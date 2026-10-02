/*jshint -W083 */ // inline functions are used safely
(function($) {

    var Alpaca = $.alpaca;

    // ----------------------------------------------------------------------------------------------------------
    // Internal constants / helpers
    //
    // Architecture note:
    //
    // The preferred starting point suggested for this component was to extend Alpaca.ObjectField and generate
    // a schema/options tree of standard Alpaca fields (one child field per category/duration/cell-property).
    // After inspecting this fork's ObjectField/ContainerField implementation, that approach was rejected:
    // ObjectField renders one nested "container-object" fieldset per object level, so a 3-level schema
    // (category -> duration -> {status, levelId, comment}) would render as deeply nested fieldsets, not a
    // compact matrix table, and reshaping that via templates alone would require overriding container
    // rendering at every level anyway.
    //
    // Instead this field follows the convention already established by the other bespoke composite fields in
    // this fork (RiskScoreField, DoraAssessmentField): it extends Alpaca.ControlField, keeps a single
    // JSON value (this.data) for the whole matrix, renders a custom template, and wires native
    // <select>/<textarea> controls by hand in afterRenderControl(). This keeps Alpaca's standard value
    // handling (getValue/setValue), validation (validate/handleValidate/refreshValidationState) and event
    // propagation (triggerUpdate/triggerWithPropagation, "fieldupdate"/"change") intact, while giving full
    // control over the table layout required by the spec.
    // ----------------------------------------------------------------------------------------------------------

    var STATUS_UNASSESSED = "unassessed";
    var STATUS_ASSESSED = "assessed";

    var AXIS_DURATION = "duration";
    var AXIS_LEVEL = "level";

    var FORBIDDEN_KEYS = {
        "__proto__": true,
        "constructor": true,
        "prototype": true
    };

    // conservative "safe" identifier: starts with a letter, then letters/digits/_/-, no "__" prefix
    var ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

    var isSafeId = function(id)
    {
        return Alpaca.isString(id) && id.length > 0 && id.length <= 64 &&
            ID_PATTERN.test(id) &&
            id.indexOf("__") !== 0 &&
            !FORBIDDEN_KEYS.hasOwnProperty(id);
    };

    // only hex colors are accepted, since the value ends up in an inline style attribute
    var COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

    var DEFAULT_UNASSESSED_COLOR = "#ffffff";

    // green -> yellow -> red, interpolated over the configured levels in rank order
    var DEFAULT_PALETTE_STOPS = [[99, 190, 123], [255, 235, 132], [248, 105, 107]];

    var toHex = function(rgb)
    {
        return "#" + rgb.map(function(c)
        {
            var h = Math.round(c).toString(16);
            return h.length === 1 ? "0" + h : h;
        }).join("");
    };

    var defaultLevelColor = function(index, count)
    {
        if (count <= 1) { return toHex(DEFAULT_PALETTE_STOPS[0]); }

        var scaled = (index / (count - 1)) * (DEFAULT_PALETTE_STOPS.length - 1);
        var i = Math.min(DEFAULT_PALETTE_STOPS.length - 2, Math.floor(scaled));
        var f = scaled - i;
        var from = DEFAULT_PALETTE_STOPS[i];
        var to = DEFAULT_PALETTE_STOPS[i + 1];

        return toHex([0, 1, 2].map(function(c) { return from[c] + (to[c] - from[c]) * f; }));
    };

    var parseHex = function(hex)
    {
        var h = hex.substring(1);
        if (h.length === 3) { h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
        return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
    };

    // picks black or white text, whichever gives the higher WCAG contrast ratio against the background
    var contrastTextColor = function(hex)
    {
        var lum = parseHex(hex).map(function(c)
        {
            c = c / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        var l = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];

        return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#222222" : "#ffffff";
    };

    // Alpaca's message.html renders validation messages unescaped ({{{message}}}), so anything we put there must be escaped
    var escapeHtml = function(text)
    {
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

    var escapeSelector = function(id)
    {
        // minimal escaping for use inside jQuery attribute selectors; ids are already restricted
        // by isSafeId() to [a-zA-Z0-9_-], so this is defensive rather than strictly necessary
        return String(id).replace(/(["\\])/g, "\\$1");
    };

    Alpaca.Fields.ImpactAssessmentField = Alpaca.ControlField.extend(
    /**
     * @lends Alpaca.Fields.ImpactAssessmentField.prototype
     */
    {
        /**
         * @see Alpaca.Field#getFieldType
         */
        getFieldType: function()
        {
            return "impact-assessment";
        },

        /**
         * @see Alpaca.Field#getType
         */
        getType: function()
        {
            return "object";
        },

        getTitle: function()
        {
            return "Impact assessment";
        },

        getDescription: function()
        {
            return "Registers consequences of a function or process outage over time, as part of a Business Impact Analysis (BIA).";
        },

        /**
         * @see Alpaca.Field#setup
         */
        setup: function()
        {
            this.base();

            // A field dropped into a form designer has no config yet; show a friendly placeholder
            // instead of treating the expected "not configured" state as an invalid-configuration error.
            // A designer-bound options.config may arrive as an empty/whitespace string rather than
            // undefined/null/{}, so that case must be treated as "unconfigured" too.
            var rawConfig = this.options.config;
            var unconfigured = Alpaca.isEmpty(rawConfig) || (Alpaca.isString(rawConfig) && rawConfig.trim() === "");
            if (unconfigured)
            {
                this.config = null;
                this._configError = this._msg("impactAssessmentUnconfigured");
                return;
            }
            var configResult = this._buildConfig(this.options.config);
            if (configResult.error)
            {
                // Alpaca keeps rendering after the error callback, so the field must still survive without a config
                this.config = null;
                this._configError = this._msg("impactAssessmentInvalidConfig", [configResult.error]);
                return Alpaca.throwErrorWithCallback("impact-assessment: invalid configuration - " + configResult.error, this.errorCallback);
            }
            this._configError = null;
            this.config = configResult.config;

            this.data = this._normalizeValue(this.data);
        },

        // ------------------------------------------------------------------------------------------------
        // Configuration handling
        // ------------------------------------------------------------------------------------------------

        /**
         * Validates and normalizes options.config into an internal structure.
         * Never mutates the config object that was passed in.
         *
         * @param rawConfig
         * @returns {{config: Object}|{error: String}}
         */
        _buildConfig: function(rawConfig)
        {
            if (!rawConfig || !Alpaca.isObject(rawConfig))
            {
                return { error: "options.config is required and must be an object" };
            }

            // deep clone defensively so we never mutate the caller's object
            var raw;
            try
            {
                raw = JSON.parse(JSON.stringify(rawConfig));
            }
            catch (e)
            {
                return { error: "options.config could not be cloned (must be plain JSON-serializable data)" };
            }

            if (!isSafeId(raw.id))
            {
                return { error: "config.id is required and must be a safe identifier" };
            }
            if (!Alpaca.isNumber(raw.version) || raw.version < 1)
            {
                return { error: "config.version is required and must be a positive number" };
            }

            var axis = Alpaca.isEmpty(raw.axis) ? AXIS_DURATION : raw.axis;
            if (axis !== AXIS_DURATION && axis !== AXIS_LEVEL)
            {
                return { error: "config.axis must be '" + AXIS_DURATION + "' or '" + AXIS_LEVEL + "'" };
            }
            var levelAxis = axis === AXIS_LEVEL;
            if (levelAxis && Alpaca.isEmpty(raw.levels))
            {
                return { error: "config.levels is required when axis is '" + AXIS_LEVEL + "'" };
            }

            // ---- global levels (optional when every category defines its own) ----
            var globalLevels = { levels: [], levelsById: {} };
            if (!Alpaca.isEmpty(raw.levels))
            {
                globalLevels = this._parseLevels(raw.levels, "config.levels");
                if (globalLevels.error) { return globalLevels; }
            }

            // ---- categories ----
            if (!Alpaca.isArray(raw.categories) || raw.categories.length === 0)
            {
                return { error: "config.categories must be a non-empty array" };
            }
            var categories = [];
            var categoriesById = {};
            var hasCategoryLevels = false;
            for (var ci = 0; ci < raw.categories.length; ci++)
            {
                var rawCat = raw.categories[ci];
                if (!rawCat || !isSafeId(rawCat.id))
                {
                    return { error: "every category requires a safe, unique id" };
                }
                if (categoriesById.hasOwnProperty(rawCat.id))
                {
                    return { error: "duplicate category id: " + rawCat.id };
                }
                if (!Alpaca.isString(rawCat.label) || rawCat.label.length === 0)
                {
                    return { error: "category '" + rawCat.id + "' requires a label" };
                }

                var catLevels = globalLevels;
                if (!Alpaca.isEmpty(rawCat.levels))
                {
                    // columns are the shared levels, so every row must use the same scale
                    if (levelAxis)
                    {
                        return { error: "category '" + rawCat.id + "' cannot define its own levels when axis is '" + AXIS_LEVEL + "'" };
                    }
                    catLevels = this._parseLevels(rawCat.levels, "category '" + rawCat.id + "' levels");
                    if (catLevels.error) { return catLevels; }
                    hasCategoryLevels = true;
                }
                else if (globalLevels.levels.length === 0)
                {
                    return { error: "category '" + rawCat.id + "' has no levels and config.levels is not defined" };
                }

                var levelDescriptions = {};
                if (rawCat.levelDescriptions && Alpaca.isObject(rawCat.levelDescriptions))
                {
                    for (var ldKey in rawCat.levelDescriptions)
                    {
                        if (rawCat.levelDescriptions.hasOwnProperty(ldKey) && isSafeId(ldKey))
                        {
                            levelDescriptions[ldKey] = String(rawCat.levelDescriptions[ldKey]);
                        }
                    }
                }

                var category = {
                    id: rawCat.id,
                    label: rawCat.label,
                    description: Alpaca.isString(rawCat.description) ? rawCat.description : "",
                    levelDescriptions: levelDescriptions,
                    levels: catLevels.levels,
                    levelsById: catLevels.levelsById
                };

                var commentRank = this._resolveThresholdRank(rawCat.requireCommentFromLevel, raw.requireCommentFromLevel, category, globalLevels, "requireCommentFromLevel");
                if (commentRank.error) { return commentRank; }
                category.requireCommentRank = commentRank.rank;

                var unacceptableRank = this._resolveThresholdRank(rawCat.unacceptableFromLevel, raw.unacceptableFromLevel, category, globalLevels, "unacceptableFromLevel");
                if (unacceptableRank.error) { return unacceptableRank; }
                category.unacceptableRank = unacceptableRank.rank;

                categories.push(category);
                categoriesById[category.id] = category;
            }

            // ---- durations (not used with axis "level", which only displays the assessment criteria) ----
            var durations = [];
            var durationsById = {};
            var seenHours = {};
            if (!levelAxis && (!Alpaca.isArray(raw.durations) || raw.durations.length === 0))
            {
                return { error: "config.durations must be a non-empty array" };
            }
            for (var di = 0; !levelAxis && di < raw.durations.length; di++)
            {
                var rawDur = raw.durations[di];
                if (!rawDur || !isSafeId(rawDur.id))
                {
                    return { error: "every duration requires a safe, unique id" };
                }
                if (durationsById.hasOwnProperty(rawDur.id))
                {
                    return { error: "duplicate duration id: " + rawDur.id };
                }
                if (!Alpaca.isNumber(rawDur.hours) || rawDur.hours <= 0)
                {
                    return { error: "duration '" + rawDur.id + "' requires a positive numeric 'hours' value" };
                }
                if (seenHours.hasOwnProperty(rawDur.hours))
                {
                    return { error: "duplicate duration 'hours' value: " + rawDur.hours };
                }
                seenHours[rawDur.hours] = true;

                var duration = {
                    id: rawDur.id,
                    hours: rawDur.hours,
                    label: Alpaca.isString(rawDur.label) && rawDur.label.length > 0 ? rawDur.label : this._msg("impactAssessmentDurationLabel", [rawDur.hours])
                };
                durations.push(duration);
                durationsById[duration.id] = duration;
            }
            // show durations ascending by hours, regardless of configured array order
            durations.sort(function(a, b) { return a.hours - b.hours; });

            // ---- colors for non-level states ----
            var rawColors = (raw.colors && Alpaca.isObject(raw.colors)) ? raw.colors : {};
            var stateColors = {};
            var stateColorDefaults = { unassessed: DEFAULT_UNASSESSED_COLOR };
            for (var stateKey in stateColorDefaults)
            {
                if (!stateColorDefaults.hasOwnProperty(stateKey)) { continue; }
                if (Alpaca.isEmpty(rawColors[stateKey]))
                {
                    stateColors[stateKey] = stateColorDefaults[stateKey];
                }
                else if (Alpaca.isString(rawColors[stateKey]) && COLOR_PATTERN.test(rawColors[stateKey]))
                {
                    stateColors[stateKey] = rawColors[stateKey];
                }
                else
                {
                    return { error: "colors." + stateKey + " is not a valid color (use hex, e.g. #ffffff)" };
                }
            }

            // ---- rules ----
            // "first unacceptable duration" and "decreasing over time" only make sense with a time axis
            var hasThreshold = !levelAxis && categories.some(function(c) { return c.unacceptableRank !== null; });

            var config = {
                id: raw.id,
                version: raw.version,
                axis: axis,
                levelAxis: levelAxis,
                categories: categories,
                categoriesById: categoriesById,
                durations: durations,
                durationsById: durationsById,
                levels: globalLevels.levels,
                hasCategoryLevels: hasCategoryLevels,
                colors: stateColors,
                requireAllCells: !!raw.requireAllCells,
                hasThreshold: hasThreshold,
                warnOnDecreasingImpact: !levelAxis && !!raw.warnOnDecreasingImpact
            };

            return { config: config };
        },

        _parseLevels: function(rawLevels, context)
        {
            if (!Alpaca.isArray(rawLevels) || rawLevels.length === 0)
            {
                return { error: context + " must be a non-empty array" };
            }

            var levels = [];
            var levelsById = {};
            var seenRanks = {};
            for (var li = 0; li < rawLevels.length; li++)
            {
                var rawLevel = rawLevels[li];
                if (!rawLevel || !isSafeId(rawLevel.id))
                {
                    return { error: context + ": every level requires a safe, unique id" };
                }
                if (levelsById.hasOwnProperty(rawLevel.id))
                {
                    return { error: context + ": duplicate level id: " + rawLevel.id };
                }
                if (!Alpaca.isNumber(rawLevel.rank))
                {
                    return { error: context + ": level '" + rawLevel.id + "' requires a numeric 'rank'" };
                }
                if (seenRanks.hasOwnProperty(rawLevel.rank))
                {
                    return { error: context + ": duplicate level rank: " + rawLevel.rank };
                }
                seenRanks[rawLevel.rank] = true;
                if (!Alpaca.isString(rawLevel.label) || rawLevel.label.length === 0)
                {
                    return { error: context + ": level '" + rawLevel.id + "' requires a label" };
                }
                if (!Alpaca.isEmpty(rawLevel.color) && !(Alpaca.isString(rawLevel.color) && COLOR_PATTERN.test(rawLevel.color)))
                {
                    return { error: context + ": level '" + rawLevel.id + "' has an invalid color (use hex, e.g. #ff0000)" };
                }
                if (!Alpaca.isEmpty(rawLevel.requireComment) && !Alpaca.isBoolean(rawLevel.requireComment))
                {
                    return { error: context + ": level '" + rawLevel.id + "' has a non-boolean 'requireComment'" };
                }

                var level = {
                    id: rawLevel.id,
                    rank: rawLevel.rank,
                    label: rawLevel.label,
                    description: Alpaca.isString(rawLevel.description) ? rawLevel.description : "",
                    color: Alpaca.isEmpty(rawLevel.color) ? null : rawLevel.color,
                    requireComment: Alpaca.isBoolean(rawLevel.requireComment) ? rawLevel.requireComment : null
                };
                levels.push(level);
                levelsById[level.id] = level;
            }
            levels.sort(function(a, b) { return a.rank - b.rank; });
            levels.forEach(function(lvl, index)
            {
                if (!lvl.color) { lvl.color = defaultLevelColor(index, levels.length); }
            });

            return { levels: levels, levelsById: levelsById };
        },

        /**
         * Resolves a threshold rule (category override, else global) to a rank. The level id is looked up in
         * the category's own levels first, then in the global levels, so a global rule can apply to
         * categories with their own scale as long as ranks are comparable.
         */
        _resolveThresholdRank: function(categoryValue, globalValue, category, globalLevels, ruleName)
        {
            var levelId = !Alpaca.isEmpty(categoryValue) ? categoryValue : globalValue;
            if (Alpaca.isEmpty(levelId))
            {
                return { rank: null };
            }

            if (Alpaca.isString(levelId) && category.levelsById.hasOwnProperty(levelId))
            {
                return { rank: category.levelsById[levelId].rank };
            }
            if (Alpaca.isString(levelId) && globalLevels.levelsById.hasOwnProperty(levelId))
            {
                return { rank: globalLevels.levelsById[levelId].rank };
            }

            return { error: ruleName + " for category '" + category.id + "' references an unknown level id: " + levelId };
        },

        _rank: function(category, levelId)
        {
            var level = category.levelsById[levelId];
            return level ? level.rank : null;
        },

        // ------------------------------------------------------------------------------------------------
        // Value handling
        // ------------------------------------------------------------------------------------------------

        _emptyCell: function()
        {
            return { status: STATUS_UNASSESSED, levelId: null, comment: "" };
        },

        _cloneValue: function(value)
        {
            return JSON.parse(JSON.stringify(value));
        },

        /**
         * Builds a safe internal value from whatever was passed in (schema default, bound data, setValue
         * argument, etc). Unknown/legacy data for category or duration ids that are no longer part of the
         * current config is preserved under a separate bucket rather than silently discarded.
         */
        _normalizeValue: function(raw)
        {
            var self = this;

            this._versionError = null;

            var source = (raw && Alpaca.isObject(raw)) ? raw : {};

            if (!Alpaca.isEmpty(source.configId) || !Alpaca.isEmpty(source.configVersion))
            {
                if (source.configId !== this.config.id || source.configVersion !== this.config.version)
                {
                    this._versionError = this._msg("impactAssessmentVersionMismatch", [source.configId, source.configVersion, this.config.id, this.config.version]);

                    // do not reshape data we don't understand - hand it back unchanged on getValue()
                    this._rawIncompatibleValue = this._cloneValue(source);

                    return source;
                }
            }

            var cells = {};
            var sourceCells = (source.cells && Alpaca.isObject(source.cells)) ? source.cells : {};

            this.config.categories.forEach(function(category)
            {
                cells[category.id] = {};
                var sourceCategoryCells = (sourceCells[category.id] && Alpaca.isObject(sourceCells[category.id])) ? sourceCells[category.id] : {};

                self.config.durations.forEach(function(duration)
                {
                    var sourceCell = sourceCategoryCells[duration.id];
                    var cell = self._emptyCell();

                    if (sourceCell && Alpaca.isObject(sourceCell))
                    {
                        if (sourceCell.status === STATUS_ASSESSED && isSafeId(sourceCell.levelId) && category.levelsById.hasOwnProperty(sourceCell.levelId))
                        {
                            cell.status = STATUS_ASSESSED;
                            cell.levelId = sourceCell.levelId;
                        }
                        else
                        {
                            cell.status = STATUS_UNASSESSED;
                            cell.levelId = null;
                        }

                        if (Alpaca.isString(sourceCell.comment))
                        {
                            cell.comment = sourceCell.comment;
                        }
                    }

                    cells[category.id][duration.id] = cell;
                });
            });

            this._rawIncompatibleValue = null;

            if (this.config.levelAxis)
            {
                return {
                    configId: this.config.id,
                    configVersion: this.config.version,
                    criteria: this._normalizeCriteria(source.criteria)
                };
            }

            return {
                configId: this.config.id,
                configVersion: this.config.version,
                cells: cells
            };
        },

        /**
         * Criteria texts (axis "level") per category and level. Stored texts win; missing ones fall back to
         * the configured levelDescriptions / level description.
         */
        _normalizeCriteria: function(rawCriteria)
        {
            var source = (rawCriteria && Alpaca.isObject(rawCriteria)) ? rawCriteria : {};
            var criteria = {};

            this.config.categories.forEach(function(category)
            {
                var sourceCategory = (source.hasOwnProperty(category.id) && Alpaca.isObject(source[category.id])) ? source[category.id] : {};
                criteria[category.id] = {};

                category.levels.forEach(function(level)
                {
                    criteria[category.id][level.id] = (sourceCategory.hasOwnProperty(level.id) && Alpaca.isString(sourceCategory[level.id])) ?
                        sourceCategory[level.id] :
                        (category.levelDescriptions[level.id] || level.description || "");
                });
            });

            return criteria;
        },

        /**
         * @see Alpaca.ControlField#getValue
         */
        getValue: function()
        {
            if (!this.config)
            {
                return this.data;
            }

            if (this._versionError)
            {
                // config/version mismatch: hand back exactly what we were given, untouched
                return this._rawIncompatibleValue ? this._cloneValue(this._rawIncompatibleValue) : this.data;
            }

            return this._cloneValue(this.data);
        },

        /**
         * @see Alpaca.Field#setValue
         */
        setValue: function(value)
        {
            if (!this.config)
            {
                this.data = value;
                return;
            }

            this.data = this._normalizeValue(value);

            this.updateObservable();
            this.triggerUpdate();

            if (this.control)
            {
                this._renderErrorState();
                this._syncControlsFromData();
                this._updateSummary();
                this.refreshValidationState();
            }
        },

        /**
         * @see Alpaca.Field#setDefault
         */
        setDefault: function()
        {
            this.setValue(this.schema && !Alpaca.isEmpty(this.schema["default"]) ? this.schema["default"] : {});
        },

        // ------------------------------------------------------------------------------------------------
        // Rendering
        // ------------------------------------------------------------------------------------------------

        /**
         * @see Alpaca.ControlField#prepareControlModel
         */
        prepareControlModel: function(callback)
        {
            var self = this;

            this.base(function(model)
            {
                var fieldId = self.getId();

                if (!self.config)
                {
                    model.hasError = true;
                    model.errorMessage = self._configError;
                    callback(model);
                    return;
                }

                model.hasError = !!self._versionError;
                model.errorMessage = self._versionError;
                model.readonly = !!self.options.readonly;
                model.text = {
                    legendLabel: self._msg("impactAssessmentLegendLabel"),
                    tableCaption: self._msg(self.config.levelAxis ? "impactAssessmentLevelAxisTableCaption" : "impactAssessmentTableCaption"),
                    categoryHeader: self._msg("impactAssessmentCategoryHeader"),
                    showCriteria: self._msg("impactAssessmentShowCriteria"),
                    noDescription: self._msg("impactAssessmentNoDescription"),
                    criteriaPlaceholder: self._msg("impactAssessmentCriteriaPlaceholder"),
                    commentPlaceholder: self._msg("impactAssessmentCommentPlaceholder")
                };
                model.levelAxis = self.config.levelAxis;

                // a shared legend only makes sense when all categories use the same scale; with levels as
                // columns the column headers already act as the legend
                model.levelLegend = (self.config.hasCategoryLevels || self.config.levelAxis) ? [] : self.config.levels.map(function(level)
                {
                    return { id: level.id, label: level.label, style: self._colorStyle(level.color) };
                });

                model.columns = self.config.levelAxis ?
                    self.config.levels.map(function(level)
                    {
                        return { id: level.id, label: level.label, style: self._colorStyle(level.color) };
                    }) :
                    self.config.durations.map(function(duration)
                    {
                        return { id: duration.id, label: duration.label, hours: duration.hours };
                    });

                if (!model.hasError)
                {
                    model.rows = self.config.categories.map(function(category)
                    {
                        var criteria = category.levels.map(function(level)
                        {
                            return {
                                id: level.id,
                                categoryId: category.id,
                                label: level.label,
                                style: self._colorStyle(level.color),
                                description: self.config.levelAxis ?
                                    self.data.criteria[category.id][level.id] :
                                    (category.levelDescriptions[level.id] || level.description || ""),
                                inputId: fieldId + "-criteria-" + category.id + "-" + level.id,
                                inputLabel: self._msg("impactAssessmentCriteriaLabel", [category.label, level.label])
                            };
                        });

                        var cells = self.config.durations.map(function(duration)
                        {
                            return self._buildCellModel(category, duration, fieldId);
                        });

                        return {
                            id: category.id,
                            label: category.label,
                            description: category.description,
                            criteriaId: fieldId + "-criteria-" + category.id,
                            criteria: criteria,
                            cells: cells
                        };
                    });
                }

                callback(model);
            });
        },

        _buildCellModel: function(category, duration, fieldId)
        {
            var cell = this.data.cells[category.id][duration.id];
            var baseId = fieldId + "-cell-" + category.id + "-" + duration.id;
            var commentState = this._commentState(category, cell);

            return {
                categoryId: category.id,
                durationId: duration.id,
                toggleId: baseId + "-level",
                commentId: baseId + "-comment",
                commentPanelId: baseId + "-comment-panel",
                helpId: baseId + "-help",
                errorId: baseId + "-error",
                status: cell.status,
                levelId: cell.levelId,
                cellLabel: this._cellLabel(category, cell),
                cellStyle: this._colorStyle(this._cellColor(category, cell)),
                comment: cell.comment,
                hasComment: commentState === "present",
                commentState: commentState,
                commentIconClass: this._commentIconClass(commentState),
                commentToggleLabel: this._commentToggleLabel(category, duration, commentState),
                helpText: this._cellHelpText(category, cell.levelId),
                commentRequired: this._isCommentRequired(category, cell),
                toggleAriaLabel: this._toggleAriaLabel(category, duration, cell),
                commentAriaLabel: this._msg("impactAssessmentCommentLabel", [this._where(category, duration)]),
                readonly: !!this.options.readonly
            };
        },

        _commentState: function(category, cell)
        {
            if (cell.comment && cell.comment.trim()) { return "present"; }
            return this._isCommentRequired(category, cell) ? "missing" : "empty";
        },

        _commentIconClass: function(commentState)
        {
            return commentState === "present" ? "fas fa-pencil-alt" : "fas fa-plus";
        },

        _commentToggleLabel: function(category, duration, commentState)
        {
            var args = [this._where(category, duration)];
            if (commentState === "present") { return this._msg("impactAssessmentCommentShow", args); }
            if (commentState === "missing") { return this._msg("impactAssessmentCommentMissing", args); }
            return this._msg("impactAssessmentCommentAdd", args);
        },

        _cellLabel: function(category, cell)
        {
            if (cell.status === STATUS_ASSESSED && category.levelsById[cell.levelId])
            {
                return category.levelsById[cell.levelId].label;
            }
            return this._statusLabel(cell.status);
        },

        _cellColor: function(category, cell)
        {
            if (cell.status === STATUS_ASSESSED && category.levelsById[cell.levelId])
            {
                return category.levelsById[cell.levelId].color;
            }
            return this.config.colors.unassessed;
        },

        _colorStyle: function(color)
        {
            return "background-color:" + color + ";color:" + contrastTextColor(color) + ";";
        },

        _toggleAriaLabel: function(category, duration, cell)
        {
            var label = this._msg("impactAssessmentLevelLabel", [this._where(category, duration), this._cellLabel(category, cell)]);
            if (!this.options.readonly)
            {
                label += " " + this._msg("impactAssessmentLevelHint");
            }
            return label;
        },

        _where: function(category, duration)
        {
            return category.label + " – " + duration.label;
        },

        _msg: function(key, args)
        {
            var message = this.getMessage(key);
            return args ? Alpaca.substituteTokens(message, args) : message;
        },

        _statusLabel: function(status)
        {
            if (status === STATUS_ASSESSED) { return this._msg("impactAssessmentAssessed"); }
            return this._msg("impactAssessmentUnassessed");
        },

        _cellHelpText: function(category, levelId)
        {
            if (!levelId) { return ""; }

            var level = category.levelsById[levelId];
            if (!level) { return ""; }

            if (category.levelDescriptions.hasOwnProperty(levelId) && category.levelDescriptions[levelId])
            {
                return category.levelDescriptions[levelId];
            }

            return level.description || "";
        },

        _isCommentRequired: function(category, cell)
        {
            if (cell.status !== STATUS_ASSESSED || !category.levelsById[cell.levelId])
            {
                return false;
            }

            // an explicit flag on the level wins over the requireCommentFromLevel threshold
            var level = category.levelsById[cell.levelId];
            if (level.requireComment !== null)
            {
                return level.requireComment;
            }

            if (category.requireCommentRank !== null)
            {
                return level.rank >= category.requireCommentRank;
            }

            return false;
        },

        /**
         * @see Alpaca.ControlField#afterRenderControl
         */
        afterRenderControl: function(model, callback)
        {
            var self = this;

            this.base(model, function()
            {
                if (self.config)
                {
                    self._bindEvents();
                    self._syncControlsFromData();
                    self._updateSummary();
                }

                callback();
            });
        },

        _eventNamespace: function()
        {
            return "impactassessment-" + this.getId();
        },

        _bindEvents: function()
        {
            var self = this;
            var ns = "." + this._eventNamespace();

            // unbind first in case of re-render, so we never double-bind
            $(this.control).off(ns);

            // opening/closing comments is also allowed in read-only/display mode
            $(this.control).on("click" + ns, "button.alpaca-impact-assessment-comment-toggle, .alpaca-impact-assessment-comment-preview[data-category-id]", function()
            {
                var $button = $(this);
                self.toggleCommentPanel($button.attr("data-category-id"), $button.attr("data-duration-id"));
            });

            $(this.control).on("keydown" + ns, ".alpaca-impact-assessment-comment-panel", function(e)
            {
                if (e.key === "Escape" || e.keyCode === 27)
                {
                    var $cell = $(this).closest(".alpaca-impact-assessment-cell");
                    self.toggleCommentPanel($cell.attr("data-category-id"), $cell.attr("data-duration-id"), false);
                    $cell.find("button.alpaca-impact-assessment-comment-toggle").focus();
                }
            });

            if (this.isDisplayOnly() || this.options.readonly)
            {
                return;
            }

            $(this.control).on("click" + ns, "button.alpaca-impact-assessment-level-toggle", function(e)
            {
                var $button = $(this);
                self.cycleCellLevel($button.attr("data-category-id"), $button.attr("data-duration-id"), e.shiftKey ? -1 : 1);
            });

            $(this.control).on("change" + ns + " input" + ns, "textarea.alpaca-impact-assessment-comment", function()
            {
                var $textarea = $(this);
                var categoryId = $textarea.attr("data-category-id");
                var durationId = $textarea.attr("data-duration-id");

                self.data.cells[categoryId][durationId].comment = $textarea.val();

                self._afterCellChange(categoryId, durationId, true);
            });

            $(this.control).on("change" + ns + " input" + ns, "textarea.alpaca-impact-assessment-criteria-input", function()
            {
                var $textarea = $(this);
                var categoryId = $textarea.attr("data-category-id");
                var levelId = $textarea.attr("data-level-id");
                if (!self.data.criteria || !self.data.criteria.hasOwnProperty(categoryId) || !self.data.criteria[categoryId].hasOwnProperty(levelId)) { return; }

                self.data.criteria[categoryId][levelId] = $textarea.val();

                self.updateObservable();
                self.triggerUpdate();
                self.triggerWithPropagation("change");
            });

        },

        /**
         * Opens/closes the comment panel of a cell. Omit `open` to toggle.
         */
        toggleCommentPanel: function(categoryId, durationId, open)
        {
            var $cell = this._findCellEl(categoryId, durationId);
            if (!$cell || !$cell.length) { return; }

            var $panel = $cell.find(".alpaca-impact-assessment-comment-panel");
            var show = (open === undefined) ? $panel.prop("hidden") : !!open;

            $panel.prop("hidden", !show);
            $cell.toggleClass("alpaca-impact-assessment-cell-comment-open", show);
            $cell.find("button.alpaca-impact-assessment-comment-toggle").attr("aria-expanded", show ? "true" : "false");

            if (show)
            {
                $panel.find("textarea").focus();
            }
        },

        /**
         * Sets the level of a cell directly. Pass levelId null to mark the cell as unassessed.
         */
        setCellLevel: function(categoryId, durationId, levelId)
        {
            if (!this.config.categoriesById.hasOwnProperty(categoryId) || !this.config.durationsById.hasOwnProperty(durationId)) { return; }

            var category = this.config.categoriesById[categoryId];
            if (levelId !== null && !category.levelsById.hasOwnProperty(levelId)) { return; }

            var cell = this.data.cells[categoryId][durationId];
            cell.status = levelId === null ? STATUS_UNASSESSED : STATUS_ASSESSED;
            cell.levelId = levelId;

            this._afterCellChange(categoryId, durationId);
        },

        /**
         * Moves a cell to the next (direction 1) or previous (direction -1) state in the cycle:
         * unassessed -> the category's levels by ascending rank -> unassessed.
         */
        cycleCellLevel: function(categoryId, durationId, direction)
        {
            if (!this.config.categoriesById.hasOwnProperty(categoryId) || !this.config.durationsById.hasOwnProperty(durationId)) { return; }

            var cell = this.data.cells[categoryId][durationId];

            var states = [{ status: STATUS_UNASSESSED, levelId: null }];
            this.config.categoriesById[categoryId].levels.forEach(function(level)
            {
                states.push({ status: STATUS_ASSESSED, levelId: level.id });
            });

            var current = 0;
            for (var i = 0; i < states.length; i++)
            {
                if (states[i].status === cell.status && states[i].levelId === cell.levelId) { current = i; break; }
            }

            var next = states[(current + (direction < 0 ? -1 : 1) + states.length) % states.length];
            cell.status = next.status;
            cell.levelId = next.levelId;

            this._afterCellChange(categoryId, durationId);
        },

        _afterCellChange: function(categoryId, durationId, skipControlRefresh)
        {
            var category = this.config.categoriesById[categoryId];
            var duration = this.config.durationsById[durationId];
            var cell = this.data.cells[categoryId][durationId];

            this._updateCellHelpAndState(category, duration, cell);
            this._updateSummary();

            this.updateObservable();
            this.triggerUpdate();
            this.refreshValidationState();
            this.triggerWithPropagation("change");
        },

        /**
         * Updates the dynamic parts of a single cell's markup (label, color, help text, required marker)
         * without rebuilding the controls, so focus is preserved.
         */
        _updateCellHelpAndState: function(category, duration, cell)
        {
            var $cell = this._findCellEl(category.id, duration.id);
            if (!$cell || !$cell.length) { return; }

            $cell.attr("data-status", cell.status);
            $cell.attr("data-level-id", cell.levelId || "");

            var color = this._cellColor(category, cell);
            $cell.css({ "background-color": color, "color": contrastTextColor(color) });

            var helpText = this._cellHelpText(category, cell.levelId);
            $cell.find(".alpaca-impact-assessment-level-label").text(this._cellLabel(category, cell));
            $cell.find("button.alpaca-impact-assessment-level-toggle")
                .attr("aria-label", this._toggleAriaLabel(category, duration, cell))
                .attr("title", helpText);
            $cell.find(".alpaca-impact-assessment-cell-help").text(helpText);

            var commentState = this._commentState(category, cell);
            $cell.attr("data-comment-state", commentState);
            $cell.find("button.alpaca-impact-assessment-comment-toggle")
                .attr("aria-label", this._commentToggleLabel(category, duration, commentState))
                .attr("title", this._commentToggleLabel(category, duration, commentState))
                .find(".alpaca-impact-assessment-comment-icon")
                .removeClass("fas fa-plus fas fa-pencil-alt")
                .addClass(this._commentIconClass(commentState));

            $cell.find("textarea.alpaca-impact-assessment-comment")
                .attr("aria-required", this._isCommentRequired(category, cell) ? "true" : "false");

            $cell.find(".alpaca-impact-assessment-comment-preview")
                .text(cell.comment || "")
                .attr("title", cell.comment || "")
                .prop("hidden", commentState !== "present");
        },

        _findCellEl: function(categoryId, durationId)
        {
            if (!this.control) { return null; }

            return $(this.control).find(
                "[data-category-id='" + escapeSelector(categoryId) + "'][data-duration-id='" + escapeSelector(durationId) + "'].alpaca-impact-assessment-cell"
            );
        },

        /**
         * Re-applies this.data onto the already-rendered DOM controls. Used after setValue()/load so that
         * both initial render and programmatic updates share one code path.
         */
        _syncControlsFromData: function()
        {
            var self = this;

            if (!this.control) { return; }

            this.config.categories.forEach(function(category)
            {
                self.config.durations.forEach(function(duration)
                {
                    var cell = self.data.cells[category.id][duration.id];
                    var $cell = self._findCellEl(category.id, duration.id);
                    if (!$cell || !$cell.length) { return; }

                    $cell.find("textarea.alpaca-impact-assessment-comment").val(cell.comment || "");

                    self._updateCellHelpAndState(category, duration, cell);
                });
            });

            if (this.config.levelAxis)
            {
                $(this.control).find("textarea.alpaca-impact-assessment-criteria-input").each(function()
                {
                    var $textarea = $(this);
                    var categoryCriteria = self.data.criteria[$textarea.attr("data-category-id")];
                    $textarea.val(categoryCriteria ? (categoryCriteria[$textarea.attr("data-level-id")] || "") : "");
                });
            }
        },

        _renderErrorState: function()
        {
            if (!this.control) { return; }

            $(this.control).toggleClass("alpaca-impact-assessment-has-error", !!this._versionError);
            $(this.control).find(".alpaca-impact-assessment-version-error").text(this._versionError || "");
        },

        // ------------------------------------------------------------------------------------------------
        // Summary + decreasing-impact warnings (section 10 / 8 of the spec)
        // ------------------------------------------------------------------------------------------------

        _computeSummary: function()
        {
            var self = this;
            var result = { categories: [], overall: null, hasThreshold: this.config.hasThreshold };

            if (!this.config.hasThreshold) { return result; }

            this.config.categories.forEach(function(category)
            {
                if (category.unacceptableRank === null) { return; }

                var thresholdRank = category.unacceptableRank;
                var firstUnacceptable = null;
                var incomplete = false;

                self.config.durations.forEach(function(duration)
                {
                    var cell = self.data.cells[category.id][duration.id];

                    if (firstUnacceptable) { return; }

                    if (cell.status === STATUS_UNASSESSED)
                    {
                        incomplete = true;
                        return;
                    }

                    if (cell.status === STATUS_ASSESSED && self._rank(category, cell.levelId) >= thresholdRank)
                    {
                        firstUnacceptable = duration;
                    }
                });

                var entry = {
                    categoryId: category.id,
                    label: category.label,
                    firstUnacceptableDuration: firstUnacceptable,
                    incomplete: incomplete
                };
                result.categories.push(entry);

                if (firstUnacceptable && (!result.overall || firstUnacceptable.hours < result.overall.duration.hours))
                {
                    result.overall = { categoryId: category.id, categoryLabel: category.label, duration: firstUnacceptable };
                }
            });

            return result;
        },

        _computeDecreasingImpactWarnings: function()
        {
            var self = this;
            var warnings = [];

            if (!this.config.warnOnDecreasingImpact) { return warnings; }

            this.config.categories.forEach(function(category)
            {
                var lastAssessed = null;

                self.config.durations.forEach(function(duration)
                {
                    var cell = self.data.cells[category.id][duration.id];

                    if (cell.status !== STATUS_ASSESSED || !cell.levelId) { return; }

                    var rank = self._rank(category, cell.levelId);

                    if (lastAssessed && rank < lastAssessed.rank)
                    {
                        warnings.push({
                            categoryLabel: category.label,
                            fromDurationLabel: lastAssessed.durationLabel,
                            fromLevelLabel: category.levelsById[lastAssessed.levelId].label,
                            toDurationLabel: duration.label,
                            toLevelLabel: category.levelsById[cell.levelId].label
                        });
                    }

                    lastAssessed = { durationLabel: duration.label, levelId: cell.levelId, rank: rank };
                });
            });

            return warnings;
        },

        _updateSummary: function()
        {
            var self = this;

            if (!this.control || this._versionError) { return; }

            var $summary = $(this.control).find(".alpaca-impact-assessment-summary");
            var $warnings = $(this.control).find(".alpaca-impact-assessment-warnings");

            if ($summary.length)
            {
                var summary = this._computeSummary();
                $summary.empty();

                // only categories that actually reached the unacceptable threshold are worth reporting
                var unacceptableEntries = summary.categories.filter(function(entry) { return !!entry.firstUnacceptableDuration; });

                if (!summary.hasThreshold || unacceptableEntries.length === 0)
                {
                    $summary.hide();
                }
                else
                {
                    $summary.show();

                    var $list = $("<ul class='alpaca-impact-assessment-summary-list'></ul>");
                    unacceptableEntries.forEach(function(entry)
                    {
                        var text = self._msg("impactAssessmentSummaryCategory", [entry.label, entry.firstUnacceptableDuration.label]);
                        if (entry.incomplete)
                        {
                            text += " " + self._msg("impactAssessmentSummaryIncomplete");
                        }
                        $("<li></li>").text(text).appendTo($list);
                    });

                    if (summary.overall)
                    {
                        $("<li class='alpaca-impact-assessment-summary-overall'></li>")
                            .text(this._msg("impactAssessmentSummaryOverall", [summary.overall.duration.label, summary.overall.categoryLabel]))
                            .appendTo($list);
                    }

                    $summary.append($list);
                }
            }

            if ($warnings.length)
            {
                var warnings = this._computeDecreasingImpactWarnings();
                $warnings.empty();

                if (!warnings.length)
                {
                    $warnings.hide();
                }
                else
                {
                    $warnings.show();
                    var $wlist = $("<ul class='alpaca-impact-assessment-warnings-list'></ul>");
                    warnings.forEach(function(w)
                    {
                        $("<li></li>")
                            .text(self._msg("impactAssessmentDecreasingImpact", [w.categoryLabel, w.fromLevelLabel, w.fromDurationLabel, w.toLevelLabel, w.toDurationLabel]))
                            .appendTo($wlist);
                    });
                    $warnings.append($wlist);
                }
            }
        },

        // ------------------------------------------------------------------------------------------------
        // Validation
        // ------------------------------------------------------------------------------------------------

        /**
         * @see Alpaca.Field#handleValidate
         */
        handleValidate: function()
        {
            var baseStatus = this.base();

            var valInfo = this.validation;
            var self = this;
            var overallStatus = true;

            if (!this.config)
            {
                valInfo["impactAssessmentConfig"] = { status: false, message: escapeHtml(this._configError) };
                return false;
            }

            if (this._versionError)
            {
                valInfo["impactAssessmentVersion"] = { status: false, message: escapeHtml(this._versionError) };
                return false;
            }
            else
            {
                valInfo["impactAssessmentVersion"] = { status: true, message: "" };
            }

            // cells that are simply "not assessed yet" are reported as a single, combined message below
            // instead of one message per cell - otherwise a freshly added field with many empty cells
            // would immediately show a large wall of identical-looking validation messages
            var notAssessedCount = 0;

            this.config.categories.forEach(function(category)
            {
                self.config.durations.forEach(function(duration)
                {
                    var key = "impactAssessmentCell_" + category.id + "_" + duration.id;
                    var cell = self.data.cells[category.id][duration.id];
                    var status = true;
                    var message = "";
                    var notAssessed = false;

                    if (self.config.requireAllCells && cell.status === STATUS_UNASSESSED)
                    {
                        status = false;
                        notAssessed = true;
                        message = self._msg("impactAssessmentNotAssessed", [self._where(category, duration)]);
                    }
                    else if (cell.status === STATUS_ASSESSED && !category.levelsById.hasOwnProperty(cell.levelId))
                    {
                        status = false;
                        message = self._msg("impactAssessmentInvalidLevel", [self._where(category, duration)]);
                    }
                    else if (self._isCommentRequired(category, cell) && (!cell.comment || !cell.comment.trim()))
                    {
                        status = false;
                        message = self._msg("impactAssessmentCommentRequired", [self._where(category, duration)]);
                    }

                    if (notAssessed)
                    {
                        // counted towards the combined message instead of its own valInfo entry
                        notAssessedCount++;
                    }
                    else
                    {
                        valInfo[key] = { status: status, message: escapeHtml(message) };
                    }

                    if (!status) { overallStatus = false; }

                    var $cell = self._findCellEl(category.id, duration.id);
                    if ($cell && $cell.length)
                    {
                        $cell.toggleClass("alpaca-impact-assessment-cell-invalid", !status);
                        $cell.attr("title", status ? null : message);
                        $cell.find("button.alpaca-impact-assessment-level-toggle, textarea.alpaca-impact-assessment-comment")
                            .attr("aria-invalid", status ? "false" : "true");

                        var $error = $cell.find(".alpaca-impact-assessment-cell-error");
                        $error.text(status ? "" : message);
                    }
                });
            });

            if (notAssessedCount > 0)
            {
                valInfo["impactAssessmentIncomplete"] = {
                    status: false,
                    message: escapeHtml(self._msg("impactAssessmentIncompleteCount", [notAssessedCount]))
                };
            }
            else
            {
                valInfo["impactAssessmentIncomplete"] = { status: true, message: "" };
            }

            return baseStatus && overallStatus;
        },

        // ------------------------------------------------------------------------------------------------
        // Enable / disable / destroy
        // ------------------------------------------------------------------------------------------------

        disable: function()
        {
            if (this.control)
            {
                $(this.control).find("button, textarea").prop("disabled", true);
            }
        },

        enable: function()
        {
            if (this.control)
            {
                $(this.control).find("button, textarea").prop("disabled", false);
            }
        },

        isDisabled: function()
        {
            if (this.control)
            {
                return $(this.control).find("button, textarea").first().prop("disabled") === true;
            }
            return false;
        },

        /**
         * @see Alpaca.Field#destroy
         */
        destroy: function()
        {
            if (this.control)
            {
                $(this.control).off("." + this._eventNamespace());
            }

            this.base();
        },

        // ------------------------------------------------------------------------------------------------
        // Builder metadata (consistent with the other custom fields in this fork)
        // ------------------------------------------------------------------------------------------------

        getSchemaOfOptions: function()
        {
            return Alpaca.merge(this.base(), {
                properties: {
                    config: {
                        title: "Impact assessment configuration",
                        description: "Defines categories, durations, levels and rules for the matrix.",
                        type: "any",
                        required: true,
                        default: this._exampleConfig()
                    }
                }
            });
        },

        getOptionsForOptions: function()
        {
            return Alpaca.merge(this.base(), {
                fields: {
                    config: {
                        type: "object",
                        helper: "An impact-assessment configuration object (categories, durations, levels, rules). Not editable through the generic form builder; author as JSON."
                    }
                }
            });
        },

        /**
         * A minimal, valid options.config used to pre-fill newly created fields.
         */
        _exampleConfig: function()
        {
            return {
                id: "new-impact-assessment",
                version: 1,
                categories: [
                    { id: "category1", label: this._msg("impactAssessmentExampleCategoryLabel") }
                ],
                durations: [
                    { id: "d2h", hours: 2, label: this._msg("impactAssessmentDurationLabel", [2]) },
                    { id: "d24h", hours: 24, label: this._msg("impactAssessmentDurationLabel", [24]) }
                ],
                levels: [
                    { id: "none", rank: 1, label: this._msg("impactAssessmentExampleLevelNone") },
                    { id: "low", rank: 2, label: this._msg("impactAssessmentExampleLevelLow") },
                    { id: "high", rank: 3, label: this._msg("impactAssessmentExampleLevelHigh") },
                    { id: "critical", rank: 4, label: this._msg("impactAssessmentExampleLevelCritical") }
                ]
            };
        }
    });

    Alpaca.registerFieldClass("impact-assessment", Alpaca.Fields.ImpactAssessmentField);

    // Default (English) texts. Translate per locale in src/js/messages/i18n/*.js, or override via view "messages".
    Alpaca.registerMessages({
        "impactAssessmentCriteriaLabel": "{0} – {1}: assessment criteria",
        "impactAssessmentCriteriaPlaceholder": "Describe the criteria for this level",
        "impactAssessmentLevelAxisTableCaption": "Assessment criteria: impact category per impact level",
        "impactAssessmentLegendLabel": "Color legend",
        "impactAssessmentTableCaption": "Impact matrix: impact category per duration of continuous outage",
        "impactAssessmentCategoryHeader": "Impact category",
        "impactAssessmentShowCriteria": "Show assessment criteria",
        "impactAssessmentNoDescription": "No description.",
        "impactAssessmentDurationLabel": "After {0} hours",
        "impactAssessmentAssessed": "Assessed",
        "impactAssessmentUnassessed": "Not assessed",
        "impactAssessmentLevelLabel": "{0}: impact level {1}.",
        "impactAssessmentLevelHint": "Click for next level, Shift+click for previous.",
        "impactAssessmentCommentLabel": "{0}: justification",
        "impactAssessmentCommentPlaceholder": "Justification",
        "impactAssessmentCommentAdd": "Add justification for {0}",
        "impactAssessmentCommentShow": "Show justification for {0}",
        "impactAssessmentCommentMissing": "Justification missing for {0} (required). Click to add.",
        "impactAssessmentNotAssessed": "{0}: not assessed.",
        "impactAssessmentIncompleteCount": "{0} cell(s) have not been assessed yet.",
        "impactAssessmentInvalidLevel": "{0}: invalid impact level.",
        "impactAssessmentCommentRequired": "{0}: justification is required.",
        "impactAssessmentSummaryCategory": "{0}: unacceptable impact from \"{1}\".",
        "impactAssessmentSummaryIncomplete": "(The assessment is incomplete - missing assessments must not be interpreted as acceptable.)",
        "impactAssessmentSummaryOverall": "Earliest unacceptable impact overall: \"{0}\" ({1}).",
        "impactAssessmentDecreasingImpact": "{0}: the impact decreases from \"{1}\" ({2}) to \"{3}\" ({4}) - should be justified.",
        "impactAssessmentVersionMismatch": "This assessment was made with configuration '{0}' version {1}, but the field is configured with '{2}' version {3}. The assessment is not shown and changes cannot be saved until the mismatch is resolved.",
        "impactAssessmentInvalidConfig": "Invalid impact assessment configuration: {0}",
        "impactAssessmentUnconfigured": "This impact assessment field has not been configured yet (options.config is missing).",
        "impactAssessmentExampleCategoryLabel": "Category 1",
        "impactAssessmentExampleLevelNone": "None",
        "impactAssessmentExampleLevelLow": "Low",
        "impactAssessmentExampleLevelHigh": "High",
        "impactAssessmentExampleLevelCritical": "Critical"
    });

})(jQuery);
