(function($) {

    module("fields: impact-assessment", {
        "setup": function() {
            $("#qunit-fixture").append('<div id="impact-assessment-fixture"></div>');
        },
        "teardown": function() {
            $("#impact-assessment-fixture").remove();
        }
    });

    var addTarget = function(id) {
        $("#impact-assessment-fixture").append('<div id="' + id + '"></div>');
        return $("#" + id);
    };

    var toggleButton = function(targetId, categoryId, durationId) {
        return $("#" + targetId + " button.alpaca-impact-assessment-level-toggle[data-category-id='" + categoryId + "'][data-duration-id='" + durationId + "']");
    };

    var clickToggle = function(targetId, categoryId, durationId, shift) {
        toggleButton(targetId, categoryId, durationId).trigger($.Event("click", { shiftKey: !!shift }));
    };

    var testConfig = function() {
        return {
            id: "bia-standard",
            version: 1,
            categories: [
                {
                    id: "financial",
                    label: "Økonomi",
                    description: "Økonomiske konsekvenser av bortfall.",
                    levelDescriptions: {
                        none: "Ingen økonomisk konsekvens.",
                        low: "Begrensede kostnader.",
                        high: "Store økonomiske tap.",
                        critical: "Uakseptable tap."
                    }
                },
                {
                    id: "delivery",
                    label: "Leveranser",
                    description: "Konsekvenser for leveranser."
                }
            ],
            durations: [
                { id: "t8h", hours: 8, label: "Etter 8 timer" },
                { id: "t2h", hours: 2, label: "Etter 2 timer" },
                { id: "t24h", hours: 24, label: "Etter 24 timer" }
            ],
            levels: [
                { id: "none", rank: 0, label: "Ingen" },
                { id: "low", rank: 1, label: "Lav" },
                { id: "high", rank: 3, label: "Høy" },
                { id: "critical", rank: 4, label: "Kritisk" }
            ],
            requireAllCells: true,
            requireCommentFromLevel: "high",
            unacceptableFromLevel: "critical",
            warnOnDecreasingImpact: true
        };
    };

    var testData = function() {
        return {
            configId: "bia-standard",
            configVersion: 1,
            cells: {
                financial: {
                    t2h: { status: "assessed", levelId: "low", comment: "" },
                    t8h: { status: "assessed", levelId: "high", comment: "Forsinket fakturering" },
                    t24h: { status: "unassessed", levelId: null, comment: "" }
                },
                delivery: {
                    t2h: { status: "unassessed", levelId: null, comment: "" },
                    t8h: { status: "assessed", levelId: "low", comment: "" },
                    t24h: { status: "assessed", levelId: "critical", comment: "Kritiske leveranser stopper" }
                }
            }
        };
    };

    // Test case 1: columns render ascending by hours regardless of config order, and cells/durations/levels
    // all come from configuration (no hardcoded values).
    test("Renders columns ascending by hours and reflects pre-filled data", function() {
        stop();
        addTarget("impact-assessment-1").alpaca({
            "options": {
                "type": "impact-assessment",
                "config": testConfig()
            },
            "data": testData(),
            "postRender": function(control) {
                expect(6);

                var headers = $("#impact-assessment-1 table.alpaca-impact-assessment-table thead th");
                equal($(headers[1]).text(), "Etter 2 timer", "First duration column is the smallest 'hours' value");
                equal($(headers[2]).text(), "Etter 8 timer", "Second duration column");
                equal($(headers[3]).text(), "Etter 24 timer", "Third duration column");

                equal(toggleButton("impact-assessment-1", "financial", "t8h").text().trim(), "Høy", "Pre-filled 'assessed' cell shows the level label");
                equal(toggleButton("impact-assessment-1", "delivery", "t2h").text().trim(), "Not assessed", "Pre-filled 'unassessed' cell shows the default (English) text");

                var cellLow = toggleButton("impact-assessment-1", "financial", "t2h").closest("td");
                var cellHigh = toggleButton("impact-assessment-1", "financial", "t8h").closest("td");
                notEqual(cellLow[0].style.backgroundColor, cellHigh[0].style.backgroundColor, "Cells with different levels get different colors");

                start();
            }
        });
    });

    // Test case 2: distinguishing unassessed vs. assessed(none) through getValue(), and dropping the removed notApplicable status.
    test("getValue() distinguishes unassessed from assessed-none, and treats legacy notApplicable as unassessed", function() {
        stop();
        var config = testConfig();
        var data = testData();
        data.cells.financial.t24h = { status: "assessed", levelId: "none", comment: "" };
        data.cells.delivery.t8h = { status: "notApplicable", levelId: null, comment: "Gammel begrunnelse" };

        addTarget("impact-assessment-2").alpaca({
            "options": { "type": "impact-assessment", "config": config },
            "data": data,
            "postRender": function(control) {
                expect(5);

                var value = control.getValue();
                equal(value.cells.delivery.t2h.status, "unassessed", "Untouched cell stays unassessed");
                equal(value.cells.financial.t24h.status, "assessed", "Explicitly assessed-none cell is 'assessed'");
                equal(value.cells.financial.t24h.levelId, "none", "Explicitly assessed-none cell keeps levelId 'none'");
                equal(value.cells.delivery.t8h.status, "unassessed", "Legacy 'notApplicable' is no longer supported and becomes 'unassessed'");
                equal(value.cells.delivery.t8h.comment, "Gammel begrunnelse", "The comment of a legacy 'notApplicable' cell is kept");

                start();
            }
        });
    });

    // Test case 3: editing a cell through the UI updates the value and fires change events.
    test("Clicking a cell cycles its level, updates the field value and triggers events", function() {
        stop();
        addTarget("impact-assessment-3").alpaca({
            "options": { "type": "impact-assessment", "config": testConfig() },
            "data": testData(),
            "postRender": function(control) {
                expect(6);

                var changeFired = false;
                control.on("change", function() { changeFired = true; });

                // unassessed -> none -> low
                clickToggle("impact-assessment-3", "delivery", "t2h");
                clickToggle("impact-assessment-3", "delivery", "t2h");

                var value = control.getValue();
                equal(value.cells.delivery.t2h.status, "assessed", "Status becomes 'assessed' after clicking");
                equal(value.cells.delivery.t2h.levelId, "low", "Two clicks from unassessed land on the second level");
                equal(toggleButton("impact-assessment-3", "delivery", "t2h").text().trim(), "Lav", "Cell label follows the level");
                ok(changeFired, "'change' event propagated through the field element");

                // shift+click goes backwards: low -> none -> unassessed -> highest level (wraps)
                clickToggle("impact-assessment-3", "delivery", "t2h", true);
                clickToggle("impact-assessment-3", "delivery", "t2h", true);
                equal(control.getValue().cells.delivery.t2h.status, "unassessed", "Shift+click steps back to unassessed");
                clickToggle("impact-assessment-3", "delivery", "t2h", true);
                equal(control.getValue().cells.delivery.t2h.levelId, "critical", "Cycle wraps around to the highest level");

                start();
            }
        });
    });

    // Test case 4: help text updates per category (with fallback to the level's general description).
    test("Help text uses category-specific description, falling back to the level description", function() {
        stop();
        addTarget("impact-assessment-4").alpaca({
            "options": { "type": "impact-assessment", "config": testConfig() },
            "data": testData(),
            "postRender": function(control) {
                expect(2);

                var financialHelp = toggleButton("impact-assessment-4", "financial", "t8h")
                    .closest(".alpaca-impact-assessment-cell").find(".alpaca-impact-assessment-cell-help");
                equal(financialHelp.text(), "Store økonomiske tap.", "Category-specific levelDescriptions override the level description");

                // "delivery" has no levelDescriptions and "critical" has no description -> empty, no error
                var deliveryHelp = toggleButton("impact-assessment-4", "delivery", "t24h")
                    .closest(".alpaca-impact-assessment-cell").find(".alpaca-impact-assessment-cell-help");
                equal(deliveryHelp.text(), "", "Missing description (no category override, no level description) renders as empty text without error");

                start();
            }
        });
    });

    // Test case 5: required-comment validation rules.
    test("Validation requires a comment from the configured level", function() {
        stop();
        addTarget("impact-assessment-5").alpaca({
            "options": { "type": "impact-assessment", "config": testConfig() },
            "data": testData(),
            "postRender": function(control) {
                expect(2);

                // financial/t8h is "high" with a comment already -> should not block validity because of this cell
                // delivery/t24h is "critical" with a comment -> ok
                // financial/t24h is unassessed -> requireAllCells makes the whole field invalid regardless
                control.refreshValidationState();
                ok(!control.isValid(), "Field is invalid while a cell is still unassessed (requireAllCells)");

                var data = control.getValue();
                data.cells.financial.t24h = { status: "assessed", levelId: "none", comment: "" };
                control.setValue(data);

                // now remove the required comment from the high-level cell
                var financialComment = $("#impact-assessment-5 textarea[data-category-id='financial'][data-duration-id='t8h']");
                financialComment.val("");
                financialComment.trigger("change");

                control.refreshValidationState();
                ok(!control.isValid(), "Field is invalid when a required comment (level >= requireCommentFromLevel) is missing");

                start();
            }
        });
    });

    // Test case 6: invalid configuration is rejected with a clear error instead of silently rendering.
    test("Invalid configuration (duplicate level ranks) triggers the error callback instead of rendering", function() {
        stop();
        var badConfig = testConfig();
        badConfig.levels[1].rank = badConfig.levels[0].rank; // duplicate rank

        var errorSeen = false;
        addTarget("impact-assessment-6").alpaca({
            "options": { "type": "impact-assessment", "config": badConfig },
            "data": testData(),
            "error": function(err) {
                errorSeen = true;
            },
            "postRender": function(control) {
                expect(1);
                ok(errorSeen, "errorCallback was invoked for an invalid configuration");
                start();
            }
        });

        // some Alpaca error paths never call postRender; fail safe after a short delay
        setTimeout(function() {
            if (!errorSeen) {
                expect(1);
                ok(errorSeen, "errorCallback should have been invoked for an invalid configuration");
                start();
            }
        }, 500);
    });

    // Test case 6b: a field with no config yet (e.g. just dropped into a form designer) renders a
    // friendly placeholder instead of invoking the error callback, which some hosts (re-)throw on.
    test("Missing options.config renders a placeholder without invoking the error callback", function() {
        stop();
        var errorSeen = false;

        addTarget("impact-assessment-6b").alpaca({
            "options": { "type": "impact-assessment" },
            "error": function() { errorSeen = true; },
            "postRender": function(control) {
                expect(2);
                ok(!errorSeen, "errorCallback is not invoked when options.config is simply missing");
                ok($("#impact-assessment-6b .alpaca-impact-assessment-has-error").length > 0, "A placeholder is still shown to the field author");
                start();
            }
        });
    });

    // Test case 6c: a form designer may initialize options.config as an empty/whitespace string
    // rather than omitting it entirely; that must be treated the same as "not configured yet".
    test("Empty string options.config renders the same friendly placeholder, not a harsh error", function() {
        stop();
        var errorSeen = false;

        addTarget("impact-assessment-6c").alpaca({
            "options": { "type": "impact-assessment", "config": "   " },
            "error": function() { errorSeen = true; },
            "postRender": function(control) {
                expect(2);
                ok(!errorSeen, "errorCallback is not invoked when options.config is a whitespace-only string");
                equal($("#impact-assessment-6c .alpaca-impact-assessment-version-error").text(), control._msg("impactAssessmentUnconfigured"), "The friendly 'not configured yet' message is shown, not an invalid-configuration error");
                start();
            }
        });
    });

    // Test case 6d: the field's options schema exposes a minimal, valid example config as the
    // default for "config", so a form designer can pre-fill newly created fields with something that works.
    test("getSchemaOfOptions() exposes a valid example config as the default for options.config", function() {
        stop();

        addTarget("impact-assessment-6d").alpaca({
            "options": { "type": "impact-assessment" },
            "postRender": function(control) {
                var exampleConfig = control.getSchemaOfOptions().properties.config["default"];
                var buildResult = control._buildConfig(exampleConfig);

                expect(2);
                ok(exampleConfig && Alpaca.isObject(exampleConfig), "A default example config object is exposed");
                ok(!buildResult.error, "The example config builds without validation errors");
                start();
            }
        });
    });

    // Test case 7: version mismatch is surfaced as a clear error and does not mutate/lose data.
    test("Config version mismatch renders a clear error and leaves the original value untouched", function() {
        stop();
        var mismatchedData = testData();
        mismatchedData.configVersion = 2;

        addTarget("impact-assessment-7").alpaca({
            "options": { "type": "impact-assessment", "config": testConfig() },
            "data": mismatchedData,
            "postRender": function(control) {
                expect(3);

                ok($("#impact-assessment-7 .alpaca-impact-assessment-has-error").length > 0, "Error state class is applied");
                ok($("#impact-assessment-7 .alpaca-impact-assessment-version-error").text().length > 0, "A clear error message is shown");
                deepEqual(control.getValue(), mismatchedData, "getValue() returns the original data untouched on version mismatch");

                start();
            }
        });
    });

    // Test case 8: safe rendering of configured/user text (no HTML injection).
    test("Category labels/descriptions and comments are rendered as text, not HTML", function() {
        stop();
        var config = testConfig();
        config.categories[0].label = "<img src=x onerror=alert(1)>";
        config.categories[0].description = "<script>window.__xss = true;<" + "/script>";

        var data = testData();
        data.cells.financial.t2h.comment = "<b>bold</b>";

        addTarget("impact-assessment-8").alpaca({
            "options": { "type": "impact-assessment", "config": config },
            "data": data,
            "postRender": function(control) {
                expect(4);

                var labelEl = $("#impact-assessment-8 .alpaca-impact-assessment-category-label").first();
                equal(labelEl.find("img").length, 0, "Category label is not interpreted as HTML");
                equal(labelEl.text(), "<img src=x onerror=alert(1)>", "Category label text is preserved verbatim");

                var commentTextarea = $("#impact-assessment-8 textarea[data-category-id='financial'][data-duration-id='t2h']");
                equal(commentTextarea.val(), "<b>bold</b>", "Comment text is preserved verbatim, not rendered as HTML");

                // validation messages (which include the category label) are rendered by Alpaca without escaping
                control.refreshValidationState();
                equal($("#impact-assessment-8 .alpaca-message img").length, 0, "Validation messages do not render config text as HTML");

                start();
            }
        });
    });

    // Test case 9: multiple instances on the same page do not collide, and destroy() cleans up listeners.
    test("Multiple impact-assessment instances on the same page do not collide, and destroy() unbinds events", function() {
        stop();
        addTarget("impact-assessment-9a").alpaca({
            "options": { "type": "impact-assessment", "config": testConfig() },
            "data": testData(),
            "postRender": function(controlA) {
                addTarget("impact-assessment-9b").alpaca({
                    "options": { "type": "impact-assessment", "config": testConfig() },
                    "data": testData(),
                    "postRender": function(controlB) {
                        expect(3);

                        // A: financial/t2h low -> high
                        clickToggle("impact-assessment-9a", "financial", "t2h");

                        notEqual(controlA.getValue().cells.financial.t2h.levelId, controlB.getValue().cells.financial.t2h.levelId,
                            "Editing instance A does not affect instance B's value");

                        controlA.destroy();
                        ok($("#impact-assessment-9a .alpaca-impact-assessment").length === 0, "destroy() removes instance A's DOM");

                        clickToggle("impact-assessment-9b", "financial", "t2h");
                        equal(controlB.getValue().cells.financial.t2h.levelId, "high", "Instance B keeps working after instance A is destroyed");

                        start();
                    }
                });
            }
        });
    });

    // Test case 10: read-only view renders text instead of editable controls.
    test("Read-only view renders assessed values as text, with no editable controls", function() {
        stop();
        addTarget("impact-assessment-10").alpaca({
            "view": "bootstrap-display",
            "options": { "type": "impact-assessment", "config": testConfig() },
            "data": testData(),
            "postRender": function(control) {
                expect(2);

                equal($("#impact-assessment-10 button.alpaca-impact-assessment-level-toggle").length, 0, "No clickable level toggles in display view");
                ok($("#impact-assessment-10 .alpaca-impact-assessment-cell-comment").text().indexOf("Forsinket fakturering") > -1,
                    "Comment text is shown as plain text in display view");

                start();
            }
        });
    });

    test("Configured level and state colors are applied to cells", function() {
        stop();
        var config = testConfig();
        config.levels[2].color = "#123456"; // high
        config.colors = { unassessed: "#fafafa" };

        addTarget("impact-assessment-11").alpaca({
            "options": { "type": "impact-assessment", "config": config },
            "data": testData(),
            "postRender": function(control) {
                expect(4);

                var cellOf = function(c, d) { return toggleButton("impact-assessment-11", c, d).closest("td")[0].style; };
                equal(cellOf("financial", "t8h").backgroundColor, "rgb(18, 52, 86)", "Configured level color is used");
                equal(cellOf("financial", "t8h").color, "rgb(255, 255, 255)", "Light text is chosen on a dark background");
                equal(cellOf("delivery", "t2h").backgroundColor, "rgb(250, 250, 250)", "Configured unassessed color is used");

                // low -> high
                clickToggle("impact-assessment-11", "financial", "t2h");
                equal(cellOf("financial", "t2h").backgroundColor, "rgb(18, 52, 86)", "Color updates when the level is toggled");

                start();
            }
        });
    });

    test("Comment indicator reflects missing/present comment and opens the comment panel", function() {
        stop();
        addTarget("impact-assessment-13").alpaca({
            "options": { "type": "impact-assessment", "config": testConfig() },
            "data": testData(),
            "postRender": function(control) {
                expect(11);

                var cellOf = function(c, d) { return toggleButton("impact-assessment-13", c, d).closest("td"); };

                equal(cellOf("financial", "t8h").attr("data-comment-state"), "present", "Cell with a comment is marked 'present'");
                equal(cellOf("financial", "t2h").attr("data-comment-state"), "empty", "Optional, empty comment is marked 'empty'");
                ok(cellOf("financial", "t8h").find(".alpaca-impact-assessment-comment-icon").hasClass("fa-pencil-alt"), "Present comments use the edit icon");
                ok(cellOf("financial", "t2h").find(".alpaca-impact-assessment-comment-icon").hasClass("fa-plus"), "Empty comments use the add icon");

                // low -> high requires a comment
                clickToggle("impact-assessment-13", "financial", "t2h");
                var cell = cellOf("financial", "t2h");
                equal(cell.attr("data-comment-state"), "missing", "Required, empty comment is marked 'missing'");
                ok(cell.find(".alpaca-impact-assessment-comment-icon").hasClass("fa-plus"), "Missing comments keep the add icon");

                var panel = cell.find(".alpaca-impact-assessment-comment-panel");
                ok(panel.prop("hidden"), "Comment panel is hidden by default");

                cell.find("button.alpaca-impact-assessment-comment-toggle").trigger("click");
                ok(!panel.prop("hidden"), "Clicking the indicator opens the comment panel");
                equal(cell.find("button.alpaca-impact-assessment-comment-toggle").attr("aria-expanded"), "true", "aria-expanded follows the panel");

                cell.find("textarea").val("Begrunnelse").trigger("input");
                equal(cell.attr("data-comment-state"), "present", "Indicator switches to 'present' once a comment is entered");
                ok(cell.find(".alpaca-impact-assessment-comment-icon").hasClass("fa-pencil-alt"), "Indicator switches to the edit icon once a comment is entered");

                start();
            }
        });
    });

    test("Categories can define their own levels and thresholds", function() {
        stop();
        var config = testConfig();
        config.categories[1].levels = [
            { id: "minor", rank: 1, label: "Liten" },
            { id: "major", rank: 2, label: "Stor" }
        ];
        config.categories[1].unacceptableFromLevel = "major";
        config.categories[1].requireCommentFromLevel = "major";

        var data = testData();
        data.cells.delivery = {
            t2h: { status: "assessed", levelId: "minor", comment: "" },
            t8h: { status: "assessed", levelId: "high", comment: "" }, // not part of delivery's scale -> reset
            t24h: { status: "assessed", levelId: "major", comment: "" }
        };

        addTarget("impact-assessment-14").alpaca({
            "options": { "type": "impact-assessment", "config": config },
            "data": data,
            "postRender": function(control) {
                expect(5);

                var value = control.getValue();
                equal(value.cells.delivery.t2h.levelId, "minor", "Category-specific level is accepted");
                equal(value.cells.delivery.t8h.status, "unassessed", "A level from another scale is not accepted for the category");

                clickToggle("impact-assessment-14", "delivery", "t2h");
                equal(control.getValue().cells.delivery.t2h.levelId, "major", "Cycling uses the category's own levels");

                equal(toggleButton("impact-assessment-14", "delivery", "t24h").closest("td").attr("data-comment-state"), "missing",
                    "Category-specific requireCommentFromLevel is applied");
                ok($("#impact-assessment-14 .alpaca-impact-assessment-summary").text().indexOf("Etter 2 timer") > -1,
                    "Category-specific unacceptableFromLevel drives the summary");

                start();
            }
        });
    });

    test("Category with neither own levels nor global levels is rejected", function() {
        stop();
        var config = testConfig();
        config.categories[0].levels = [{ id: "a", rank: 1, label: "A" }];
        delete config.levels;
        delete config.requireCommentFromLevel;
        delete config.unacceptableFromLevel;

        var errorSeen = false;
        addTarget("impact-assessment-15").alpaca({
            "options": { "type": "impact-assessment", "config": config },
            "error": function() { errorSeen = true; }
        });

        setTimeout(function() {
            expect(1);
            ok(errorSeen, "errorCallback is invoked when a category has no levels to use");
            start();
        }, 300);
    });

    test("Comment text is shown in the cell while the editor is closed", function() {
        stop();
        addTarget("impact-assessment-16").alpaca({
            "options": { "type": "impact-assessment", "config": testConfig() },
            "data": testData(),
            "postRender": function(control) {
                expect(5);

                var cellOf = function(c, d) { return toggleButton("impact-assessment-16", c, d).closest("td"); };

                var preview = cellOf("financial", "t8h").find(".alpaca-impact-assessment-comment-preview");
                equal(preview.text(), "Forsinket fakturering", "Existing comment is shown in the cell");
                ok(cellOf("financial", "t2h").find(".alpaca-impact-assessment-comment-preview").prop("hidden"), "No preview for a cell without comment");

                var cell = cellOf("financial", "t2h");
                control.toggleCommentPanel("financial", "t2h", true);
                ok(cell.hasClass("alpaca-impact-assessment-cell-comment-open"), "Cell is marked as editing while the editor is open");
                cell.find("textarea").val("Ny tekst").trigger("input");
                control.toggleCommentPanel("financial", "t2h", false);

                var newPreview = cell.find(".alpaca-impact-assessment-comment-preview");
                equal(newPreview.text(), "Ny tekst", "Preview is updated with the edited comment");
                ok(!newPreview.prop("hidden"), "Preview is shown after closing the editor");

                start();
            }
        });
    });

    test("Texts follow the view locale and can be overridden through view messages", function() {
        stop();
        addTarget("impact-assessment-17").alpaca({
            "view": {
                "parent": "bootstrap-edit",
                "locale": "nb_NO",
                "messages": { "nb_NO": { "impactAssessmentCategoryHeader": "Kategori" } }
            },
            "options": { "type": "impact-assessment", "config": testConfig() },
            "data": testData(),
            "postRender": function(control) {
                expect(2);

                equal(toggleButton("impact-assessment-17", "delivery", "t2h").text().trim(), "Ikke vurdert", "nb_NO translation is used");
                equal($("#impact-assessment-17 .alpaca-impact-assessment-row-header-col").text(), "Kategori", "View messages override the default text");

                start();
            }
        });
    });

    test("A level can require a comment explicitly, overriding requireCommentFromLevel", function() {
        stop();
        var config = testConfig();
        config.levels[1].requireComment = true;  // low: required even though below the threshold
        config.levels[3].requireComment = false; // critical: not required even though above the threshold

        var data = testData();
        data.cells.financial.t24h = { status: "assessed", levelId: "critical", comment: "" };
        data.cells.financial.t8h.comment = "";

        addTarget("impact-assessment-18").alpaca({
            "options": { "type": "impact-assessment", "config": config },
            "data": data,
            "postRender": function(control) {
                expect(3);

                var stateOf = function(c, d) { return toggleButton("impact-assessment-18", c, d).closest("td").attr("data-comment-state"); };
                equal(stateOf("financial", "t2h"), "missing", "Level with requireComment: true requires a comment");
                equal(stateOf("financial", "t24h"), "empty", "Level with requireComment: false does not require a comment");
                equal(stateOf("financial", "t8h"), "missing", "Levels without the flag still follow requireCommentFromLevel");

                start();
            }
        });
    });

    var levelAxisConfig = function() {
        return {
            id: "impact-simple",
            version: 1,
            axis: "level",
            categories: [
                { id: "life", label: "Liv og helse", levelDescriptions: { high: "Dødsfall." } },
                { id: "financial", label: "Økonomi" }
            ],
            levels: [
                { id: "low", rank: 1, label: "Lav", description: "Begrenset." },
                { id: "medium", rank: 2, label: "Middels", color: "#123456" },
                { id: "high", rank: 3, label: "Høy" }
            ],
            requireAllCells: true
        };
    };

    var criterionCell = function(root, category, levelId) {
        return root.find("tr").filter(function() {
            return $(this).find(".alpaca-impact-assessment-category-label").text() === category;
        }).find("td.alpaca-impact-assessment-criteria-cell[data-level-id='" + levelId + "']");
    };

    test("axis 'level': editable criteria matrix with levels as columns, colored by level", function() {
        stop();
        addTarget("impact-assessment-19").alpaca({
            "options": { "type": "impact-assessment", "config": levelAxisConfig() },
            "data": { configId: "impact-simple", configVersion: 1, criteria: { financial: { high: "Lagret tekst" } } },
            "postRender": function(control) {
                expect(11);

                var root = $("#impact-assessment-19");
                var headers = root.find("thead th").map(function() { return $(this).text().trim(); }).get();
                deepEqual(headers.slice(1), ["Lav", "Middels", "Høy"], "Level labels are the only columns");

                var input = function(c, l) { return criterionCell(root, c, l).find("textarea.alpaca-impact-assessment-criteria-input"); };
                equal(input("Liv og helse", "high").val(), "Dødsfall.", "Default: category-specific level description");
                equal(input("Økonomi", "low").val(), "Begrenset.", "Default: the level's own description");
                equal(input("Økonomi", "high").val(), "Lagret tekst", "Stored criteria text wins over the configured default");
                equal(criterionCell(root, "Økonomi", "medium")[0].style.backgroundColor, "rgb(18, 52, 86)", "Cell background matches the level color");

                equal(root.find("textarea").length, 6, "One editable field per category and level, and nothing else");
                equal(root.find("button").length, 0, "No level selection or comment buttons");

                var changeFired = false;
                control.on("change", function() { changeFired = true; });
                input("Liv og helse", "low").val("Ny tekst").trigger("input");
                equal(control.getValue().criteria.life.low, "Ny tekst", "Edited text is part of the value");
                ok(changeFired, "Editing fires 'change'");

                control.refreshValidationState();
                ok(control.isValid(), "requireAllCells does not apply, since nothing is assessed");
                equal(root.find(".alpaca-impact-assessment-summary").text(), "", "No summary without a time axis");

                start();
            }
        });
    });

    test("axis 'level': display view is read-only", function() {
        stop();
        addTarget("impact-assessment-21").alpaca({
            "view": "bootstrap-display",
            "options": { "type": "impact-assessment", "config": levelAxisConfig() },
            "data": { configId: "impact-simple", configVersion: 1, criteria: { financial: { high: "Lagret tekst" } } },
            "postRender": function(control) {
                expect(3);

                var root = $("#impact-assessment-21");
                equal(root.find("textarea, button").length, 0, "No editable controls");
                equal(criterionCell(root, "Økonomi", "high").text().trim(), "Lagret tekst", "Stored criteria text is shown");
                equal(criterionCell(root, "Liv og helse", "high").text().trim(), "Dødsfall.", "Defaults are shown where nothing is stored");

                start();
            }
        });
    });

    test("axis 'level' rejects categories with their own levels", function() {
        stop();
        var config = levelAxisConfig();
        config.categories[0].levels = [{ id: "a", rank: 1, label: "A" }];

        var errorSeen = false;
        addTarget("impact-assessment-20").alpaca({
            "options": { "type": "impact-assessment", "config": config },
            "error": function() { errorSeen = true; }
        });

        setTimeout(function() {
            expect(1);
            ok(errorSeen, "errorCallback is invoked when a category defines its own levels with axis 'level'");
            start();
        }, 300);
    });

    test("Invalid color in configuration is rejected", function() {
        stop();
        var config = testConfig();
        config.levels[0].color = "red;background:url(x)";

        var errorSeen = false;
        addTarget("impact-assessment-12").alpaca({
            "options": { "type": "impact-assessment", "config": config },
            "data": testData(),
            "error": function() { errorSeen = true; }
        });

        setTimeout(function() {
            expect(1);
            ok(errorSeen, "errorCallback is invoked for a non-hex color");
            start();
        }, 300);
    });

})(jQuery);
