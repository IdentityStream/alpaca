/*jshint -W083 */ // inline functions are used safely
(function($) {

    var Alpaca = $.alpaca;

    var STATUS_UNASSESSED = "unassessed";
    var STATUS_ASSESSED = "assessed";

    var AXIS_DURATION = "duration";
    var AXIS_LEVEL = "level";

    var Support = Alpaca.AssessmentSupport;
    var hasOwn = Support.hasOwn;
    var isSafeId = Support.isSafeId;
    var createMap = Support.createMap;
    var contrastTextColor = Support.contrastTextColor;
    var escapeHtml = Support.escapeHtml;

    var DEFAULT_UNASSESSED_COLOR = "#ffffff";

    var escapeSelector = function(id)
    {
        // Keep attribute selectors safe if the ID restrictions change.
        return String(id).replace(/(["\\])/g, "\\$1");
    };

    Alpaca.Fields.ImpactAssessmentField = Alpaca.ControlField.extend(
    /**
     * @lends Alpaca.Fields.ImpactAssessmentField.prototype
     */
    {
        getFieldType: function()
        {
            return "ImpactAssessment";
        },

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

        setup: function()
        {
            this.base();

            // Form designers may initialize an unconfigured field with an empty string.
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
                // Alpaca continues rendering after the error callback.
                this.config = null;
                this._configError = this._msg("impactAssessmentInvalidConfig", [configResult.error]);
                return Alpaca.throwErrorWithCallback("ImpactAssessment: invalid configuration - " + configResult.error, this.errorCallback);
            }
            this._configError = null;
            this.config = configResult.config;

            this.data = this._normalizeValue(this.data);
        },

        _buildConfig: function(rawConfig)
        {
            if (!rawConfig || !Alpaca.isObject(rawConfig))
            {
                return { error: "options.config is required and must be an object" };
            }

            // Avoid mutating caller-owned options during normalization.
            var raw;
            try
            {
                raw = Support.cloneJson(rawConfig);
            }
            catch (e)
            {
                return { error: "options.config could not be cloned (must be plain JSON-serializable data)" };
            }

            var identityError = Support.validateConfigIdentity(raw);
            if (identityError)
            {
                return { error: identityError };
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

            var globalLevels = { levels: [], levelsById: createMap() };
            if (!Alpaca.isEmpty(raw.levels))
            {
                globalLevels = Support.parseScale(raw.levels, "config.levels");
                if (globalLevels.error) { return globalLevels; }
            }

            if (!Alpaca.isArray(raw.categories) || raw.categories.length === 0)
            {
                return { error: "config.categories must be a non-empty array" };
            }
            var categories = [];
            var categoriesById = createMap();
            var hasCategoryLevels = false;
            for (var ci = 0; ci < raw.categories.length; ci++)
            {
                var rawCat = raw.categories[ci];
                if (!rawCat || !isSafeId(rawCat.id))
                {
                    return { error: "every category requires a safe, unique id" };
                }
                if (hasOwn(categoriesById, rawCat.id))
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
                    if (levelAxis)
                    {
                        return { error: "category '" + rawCat.id + "' cannot define its own levels when axis is '" + AXIS_LEVEL + "'" };
                    }
                    catLevels = Support.parseScale(rawCat.levels, "category '" + rawCat.id + "' levels");
                    if (catLevels.error) { return catLevels; }
                    hasCategoryLevels = true;
                }
                else if (globalLevels.levels.length === 0)
                {
                    return { error: "category '" + rawCat.id + "' has no levels and config.levels is not defined" };
                }

                var levelDescriptions = createMap();
                if (rawCat.levelDescriptions && Alpaca.isObject(rawCat.levelDescriptions))
                {
                    for (var ldKey in rawCat.levelDescriptions)
                    {
                        if (hasOwn(rawCat.levelDescriptions, ldKey) && isSafeId(ldKey))
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

            var durations = [];
            var durationsById = createMap();
            var seenHours = createMap();
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
                if (hasOwn(durationsById, rawDur.id))
                {
                    return { error: "duplicate duration id: " + rawDur.id };
                }
                if (!Alpaca.isNumber(rawDur.hours) || rawDur.hours <= 0)
                {
                    return { error: "duration '" + rawDur.id + "' requires a positive numeric 'hours' value" };
                }
                if (hasOwn(seenHours, rawDur.hours))
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
            durations.sort(function(a, b) { return a.hours - b.hours; });

            var rawColors = (raw.colors && Alpaca.isObject(raw.colors)) ? raw.colors : {};
            var stateColors = {};
            var stateColorDefaults = { unassessed: DEFAULT_UNASSESSED_COLOR };
            for (var stateKey in stateColorDefaults)
            {
                if (!hasOwn(stateColorDefaults, stateKey)) { continue; }
                if (Alpaca.isEmpty(rawColors[stateKey]))
                {
                    stateColors[stateKey] = stateColorDefaults[stateKey];
                }
                else if (Support.isColor(rawColors[stateKey]))
                {
                    stateColors[stateKey] = rawColors[stateKey];
                }
                else
                {
                    return { error: "colors." + stateKey + " is not a valid color (use hex, e.g. #ffffff)" };
                }
            }

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

        // Global thresholds can resolve against a category-specific scale by rank.
        _resolveThresholdRank: function(categoryValue, globalValue, category, globalLevels, ruleName)
        {
            var levelId = !Alpaca.isEmpty(categoryValue) ? categoryValue : globalValue;
            if (Alpaca.isEmpty(levelId))
            {
                return { rank: null };
            }

            if (Alpaca.isString(levelId) && hasOwn(category.levelsById, levelId))
            {
                return { rank: category.levelsById[levelId].rank };
            }
            if (Alpaca.isString(levelId) && hasOwn(globalLevels.levelsById, levelId))
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

        _emptyAssessment: function()
        {
            return { status: STATUS_UNASSESSED, levelId: null, comment: "" };
        },

        _cloneValue: function(value)
        {
            return Support.cloneJson(value);
        },

        _normalizeValue: function(raw)
        {
            var self = this;

            this._versionError = null;

            var source = (raw && Alpaca.isObject(raw)) ? raw : {};

            if (Support.isConfigMismatch(source, this.config))
            {
                this._versionError = this._msg("impactAssessmentVersionMismatch", [source.configId, source.configVersion, this.config.id, this.config.version]);

                // do not reshape data we don't understand - hand it back unchanged on getValue()
                this._rawIncompatibleValue = this._cloneValue(source);

                return source;
            }

            var assessments = {};
            var sourceAssessments = (source.assessments && Alpaca.isObject(source.assessments)) ? source.assessments : {};

            this.config.categories.forEach(function(category)
            {
                assessments[category.id] = {};
                var sourceCategoryAssessments = (hasOwn(sourceAssessments, category.id) && Alpaca.isObject(sourceAssessments[category.id])) ? sourceAssessments[category.id] : {};

                self.config.durations.forEach(function(duration)
                {
                    var sourceAssessment = hasOwn(sourceCategoryAssessments, duration.id) ? sourceCategoryAssessments[duration.id] : null;
                    var assessment = self._emptyAssessment();

                    if (sourceAssessment && Alpaca.isObject(sourceAssessment))
                    {
                        if (sourceAssessment.status === STATUS_ASSESSED && isSafeId(sourceAssessment.levelId) && hasOwn(category.levelsById, sourceAssessment.levelId))
                        {
                            assessment.status = STATUS_ASSESSED;
                            assessment.levelId = sourceAssessment.levelId;
                        }
                        else
                        {
                            assessment.status = STATUS_UNASSESSED;
                            assessment.levelId = null;
                        }

                        if (Alpaca.isString(sourceAssessment.comment))
                        {
                            assessment.comment = sourceAssessment.comment;
                        }
                    }

                    assessments[category.id][duration.id] = assessment;
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
                assessments: assessments
            };
        },

        _normalizeCriteria: function(rawCriteria)
        {
            var source = (rawCriteria && Alpaca.isObject(rawCriteria)) ? rawCriteria : {};
            var criteria = {};

            this.config.categories.forEach(function(category)
            {
                var sourceCategory = (hasOwn(source, category.id) && Alpaca.isObject(source[category.id])) ? source[category.id] : {};
                criteria[category.id] = {};

                category.levels.forEach(function(level)
                {
                    criteria[category.id][level.id] = (hasOwn(sourceCategory, level.id) && Alpaca.isString(sourceCategory[level.id])) ?
                        sourceCategory[level.id] :
                        (category.levelDescriptions[level.id] || level.description || "");
                });
            });

            return criteria;
        },

        getValue: function()
        {
            if (!this.config)
            {
                return this.data;
            }

            if (this._versionError)
            {
                return this._rawIncompatibleValue ? this._cloneValue(this._rawIncompatibleValue) : this.data;
            }

            return this._cloneValue(this.data);
        },

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

        setDefault: function()
        {
            this.setValue(this.schema && !Alpaca.isEmpty(this.schema["default"]) ? this.schema["default"] : {});
        },

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

                // Category-specific scales cannot share a legend.
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
            var cell = this.data.assessments[category.id][duration.id];
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
            return Support.colorStyle(color);
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

            if (hasOwn(category.levelDescriptions, levelId) && category.levelDescriptions[levelId])
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

            // An explicit level flag overrides the threshold.
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

            // Re-rendering must not register duplicate handlers.
            $(this.control).off(ns);

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

            $(this.control).on("keydown" + ns, "button.alpaca-impact-assessment-level-toggle", function(e)
            {
                self._handleLevelKeydown(e, $(this).attr("data-category-id"), $(this).attr("data-duration-id"));
            });

            $(this.control).on("change" + ns + " input" + ns, "textarea.alpaca-impact-assessment-comment", function()
            {
                var $textarea = $(this);
                var categoryId = $textarea.attr("data-category-id");
                var durationId = $textarea.attr("data-duration-id");

                self.data.assessments[categoryId][durationId].comment = $textarea.val();

                self._afterCellChange(categoryId, durationId, true);
            });

            $(this.control).on("change" + ns + " input" + ns, "textarea.alpaca-impact-assessment-criteria-input", function()
            {
                var $textarea = $(this);
                var categoryId = $textarea.attr("data-category-id");
                var levelId = $textarea.attr("data-level-id");
                if (!self.data.criteria || !hasOwn(self.data.criteria, categoryId) || !hasOwn(self.data.criteria[categoryId], levelId)) { return; }

                self.data.criteria[categoryId][levelId] = $textarea.val();

                self.updateObservable();
                self.triggerUpdate();
                self.triggerWithPropagation("change");
            });

        },

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

        // A null level marks the cell as unassessed.
        setCellLevel: function(categoryId, durationId, levelId)
        {
            if (!hasOwn(this.config.categoriesById, categoryId) || !hasOwn(this.config.durationsById, durationId)) { return; }

            var category = this.config.categoriesById[categoryId];
            if (levelId !== null && !hasOwn(category.levelsById, levelId)) { return; }

            var cell = this.data.assessments[categoryId][durationId];
            cell.status = levelId === null ? STATUS_UNASSESSED : STATUS_ASSESSED;
            cell.levelId = levelId;

            this._afterCellChange(categoryId, durationId);
        },

        // Cycles unassessed and the category's levels by rank; a negative direction steps backwards.
        cycleCellLevel: function(categoryId, durationId, direction)
        {
            if (!hasOwn(this.config.categoriesById, categoryId) || !hasOwn(this.config.durationsById, durationId)) { return; }

            var cell = this.data.assessments[categoryId][durationId];

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

        _handleLevelKeydown: function(e, categoryId, durationId)
        {
            if (e.altKey || e.ctrlKey || e.metaKey) { return; }

            var key = e.key;
            var keyCode = e.which || e.keyCode;
            var offsets = {
                ArrowLeft: [0, -1],
                ArrowRight: [0, 1],
                ArrowUp: [-1, 0],
                ArrowDown: [1, 0]
            };
            var offset = offsets[key] || ({
                37: [0, -1],
                39: [0, 1],
                38: [-1, 0],
                40: [1, 0]
            })[keyCode];

            if (offset)
            {
                e.preventDefault();
                this._focusAdjacentCell(categoryId, durationId, offset[0], offset[1]);
                return;
            }

            if (e.shiftKey && (key === "Enter" || keyCode === 13 || key === " " || key === "Spacebar" || keyCode === 32))
            {
                e.preventDefault();
                this.cycleCellLevel(categoryId, durationId, -1);
            }
        },

        _focusAdjacentCell: function(categoryId, durationId, rowOffset, columnOffset)
        {
            var category = this.config.categoriesById[categoryId];
            var duration = this.config.durationsById[durationId];
            if (!category || !duration) { return; }

            var rowIndex = $.inArray(category, this.config.categories);
            var columnIndex = $.inArray(duration, this.config.durations);
            var nextCategory = this.config.categories[rowIndex + rowOffset];
            var nextDuration = this.config.durations[columnIndex + columnOffset];
            if (!nextCategory || !nextDuration) { return; }

            var $nextButton = this._findCellEl(nextCategory.id, nextDuration.id).find("button.alpaca-impact-assessment-level-toggle").first();
            if ($nextButton.length && !$nextButton.prop("disabled"))
            {
                $nextButton.trigger("focus");
            }
        },

        _afterCellChange: function(categoryId, durationId, skipControlRefresh)
        {
            var category = this.config.categoriesById[categoryId];
            var duration = this.config.durationsById[durationId];
            var cell = this.data.assessments[categoryId][durationId];

            this._updateCellHelpAndState(category, duration, cell);
            this._updateSummary();

            this.updateObservable();
            this.triggerUpdate();
            this.refreshValidationState();
            this.triggerWithPropagation("change");
        },

        // Update in place to preserve focus.
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

        // Programmatic updates and initial render use the same synchronization path.
        _syncControlsFromData: function()
        {
            var self = this;

            if (!this.control) { return; }

            this.config.categories.forEach(function(category)
            {
                self.config.durations.forEach(function(duration)
                {
                    var cell = self.data.assessments[category.id][duration.id];
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
                    var cell = self.data.assessments[category.id][duration.id];

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
                    var cell = self.data.assessments[category.id][duration.id];

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

                // Incomplete categories are not reported as unacceptable without a threshold hit.
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

            // Aggregate unassessed cells to avoid repeating the same validation message for each cell.
            var notAssessedCount = 0;

            this.config.categories.forEach(function(category)
            {
                self.config.durations.forEach(function(duration)
                {
                    var key = "impactAssessmentCell_" + category.id + "_" + duration.id;
                    var cell = self.data.assessments[category.id][duration.id];
                    var status = true;
                    var message = "";
                    var notAssessed = false;

                    if (self.config.requireAllCells && cell.status === STATUS_UNASSESSED)
                    {
                        status = false;
                        notAssessed = true;
                        message = self._msg("impactAssessmentNotAssessed", [self._where(category, duration)]);
                    }
                    else if (cell.status === STATUS_ASSESSED && !hasOwn(category.levelsById, cell.levelId))
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

        destroy: function()
        {
            if (this.control)
            {
                $(this.control).off("." + this._eventNamespace());
            }

            this.base();
        },

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

    Alpaca.registerFieldClass("ImpactAssessment", Alpaca.Fields.ImpactAssessmentField);

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
