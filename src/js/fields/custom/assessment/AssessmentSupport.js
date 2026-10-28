(function($) {

    var Alpaca = $.alpaca;

    // Shared, DOM-free helpers for configurable assessment fields (scales, colors, config identity/versioning).

    var FORBIDDEN_KEYS = {
        "__proto__": true,
        "constructor": true,
        "prototype": true
    };

    // conservative "safe" identifier: starts with a letter, then letters/digits/_/-, no "__" prefix
    var ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

    // only hex colors are accepted, since the value ends up in an inline style attribute
    var COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

    // green -> yellow -> red, interpolated over the levels in rank order
    var DEFAULT_PALETTE_STOPS = [[99, 190, 123], [255, 235, 132], [248, 105, 107]];

    var hasOwn = function(obj, key)
    {
        return obj !== null && obj !== undefined && Object.prototype.hasOwnProperty.call(obj, key);
    };

    var isSafeId = function(id)
    {
        return Alpaca.isString(id) && id.length > 0 && id.length <= 64 &&
            ID_PATTERN.test(id) &&
            id.indexOf("__") !== 0 &&
            !hasOwn(FORBIDDEN_KEYS, id);
    };

    var isColor = function(color)
    {
        return Alpaca.isString(color) && COLOR_PATTERN.test(color);
    };

    var toHex = function(rgb)
    {
        return "#" + rgb.map(function(c)
        {
            var h = Math.round(c).toString(16);
            return h.length === 1 ? "0" + h : h;
        }).join("");
    };

    var parseHex = function(hex)
    {
        var h = hex.substring(1);
        if (h.length === 3) { h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
        return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
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

    var colorStyle = function(color)
    {
        return "background-color:" + color + ";color:" + contrastTextColor(color) + ";";
    };

    // Alpaca's message.html renders validation messages unescaped ({{{message}}}), so anything put there must be escaped
    var escapeHtml = function(text)
    {
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

    var cloneJson = function(value)
    {
        return JSON.parse(JSON.stringify(value));
    };

    // lookup table without prototype, so ids such as "toString" never resolve to inherited members
    var createMap = function()
    {
        return Object.create(null);
    };

    /**
     * Validates config.id and config.version.
     *
     * @returns {String|null} error message, or null when valid
     */
    var validateConfigIdentity = function(raw)
    {
        if (!isSafeId(raw.id))
        {
            return "config.id is required and must be a safe identifier";
        }
        if (!Alpaca.isNumber(raw.version) || raw.version < 1)
        {
            return "config.version is required and must be a positive number";
        }
        return null;
    };

    /**
     * True when a stored value declares a config id/version that differs from the given config.
     * Values without any config metadata are treated as compatible.
     */
    var isConfigMismatch = function(value, config)
    {
        if (Alpaca.isEmpty(value.configId) && Alpaca.isEmpty(value.configVersion))
        {
            return false;
        }
        return value.configId !== config.id || value.configVersion !== config.version;
    };

    /**
     * Validates and normalizes an ordinal scale (array of { id, rank, label, description?, color?, requireComment? }).
     * Levels are sorted by rank and get a default color when none is configured.
     *
     * @returns {{levels: Array, levelsById: Object}|{error: String}}
     */
    var parseScale = function(rawLevels, context)
    {
        if (!Alpaca.isArray(rawLevels) || rawLevels.length === 0)
        {
            return { error: context + " must be a non-empty array" };
        }

        var levels = [];
        var levelsById = createMap();
        var seenRanks = createMap();
        for (var li = 0; li < rawLevels.length; li++)
        {
            var rawLevel = rawLevels[li];
            if (!rawLevel || !isSafeId(rawLevel.id))
            {
                return { error: context + ": every level requires a safe, unique id" };
            }
            if (hasOwn(levelsById, rawLevel.id))
            {
                return { error: context + ": duplicate level id: " + rawLevel.id };
            }
            if (!Alpaca.isNumber(rawLevel.rank))
            {
                return { error: context + ": level '" + rawLevel.id + "' requires a numeric 'rank'" };
            }
            if (hasOwn(seenRanks, rawLevel.rank))
            {
                return { error: context + ": duplicate level rank: " + rawLevel.rank };
            }
            seenRanks[rawLevel.rank] = true;
            if (!Alpaca.isString(rawLevel.label) || rawLevel.label.length === 0)
            {
                return { error: context + ": level '" + rawLevel.id + "' requires a label" };
            }
            if (!Alpaca.isEmpty(rawLevel.color) && !isColor(rawLevel.color))
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
    };

    Alpaca.AssessmentSupport = {
        hasOwn: hasOwn,
        isSafeId: isSafeId,
        isColor: isColor,
        createMap: createMap,
        defaultLevelColor: defaultLevelColor,
        contrastTextColor: contrastTextColor,
        colorStyle: colorStyle,
        escapeHtml: escapeHtml,
        cloneJson: cloneJson,
        validateConfigIdentity: validateConfigIdentity,
        isConfigMismatch: isConfigMismatch,
        parseScale: parseScale
    };

})(jQuery);
