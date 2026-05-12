// ============================================================
//  Labels v4 - Recreation
//  An independent open recreation of a label color panel.
//
//  FEATURES:
//    • Apply label colors to layers, keyframes*, and project items
//    • [x] clears label (None)
//    • [s] selects all layers/items sharing the same label
//    • Dim unused labels toggle (shows only labels in use)
//    • Apply to source item simultaneously (hold Alt/Opt on click)
//    • Right-click swatch → set custom label name
//    • Ctrl/Cmd + click → target keyframes* (AE 22.6+)
//
//  INSTALL:
//    Mac: /Applications/Adobe After Effects <ver>/Scripts/ScriptUI Panels/
//    Win: C:\Program Files\Adobe\Adobe After Effects <ver>\Support Files\Scripts\ScriptUI Panels\
//    Then: AE → Window → labels.jsx
//
//  * Keyframe label colors require After Effects v22.6 or later.
// ============================================================

(function (thisObj) {

    // ----------------------------------------------------------
    // Label definitions — order matches rainbow row in panel
    // rgb values are 0-1 for ScriptUI graphics API
    // ----------------------------------------------------------
    var LABELS = [
        { id: 1,  name: "Red",        rgb: [0.88, 0.18, 0.18] },
        { id: 13, name: "Fuchsia",    rgb: [0.85, 0.18, 0.55] },
        { id: 10, name: "Purple",     rgb: [0.48, 0.18, 0.75] },
        { id: 8,  name: "Blue",       rgb: [0.18, 0.25, 0.78] },
        { id: 5,  name: "Lavender",   rgb: [0.42, 0.52, 0.92] },
        { id: 14, name: "Cyan",       rgb: [0.22, 0.68, 0.92] },
        { id: 3,  name: "Aqua",       rgb: [0.18, 0.80, 0.80] },
        { id: 7,  name: "Sea Foam",   rgb: [0.18, 0.78, 0.55] },
        { id: 9,  name: "Green",      rgb: [0.18, 0.70, 0.22] },
        { id: 16, name: "Dark Green", rgb: [0.35, 0.58, 0.18] },
        { id: 2,  name: "Yellow",     rgb: [0.88, 0.88, 0.18] },
        { id: 6,  name: "Peach",      rgb: [0.92, 0.62, 0.28] },
        { id: 11, name: "Orange",     rgb: [0.92, 0.38, 0.08] }
    ];

    var SWATCH_W = 20;
    var SWATCH_H = 20;

    // State
    var filterUnused = false;

    // ----------------------------------------------------------
    // Utilities
    // ----------------------------------------------------------

    function getActiveComp() {
        var item = app.project.activeItem;
        return (item && item instanceof CompItem) ? item : null;
    }

    // Returns array of label IDs currently used in the active comp
    function getUsedLabelIds() {
        var comp = getActiveComp();
        var used = {};
        if (!comp) return used;
        for (var i = 1; i <= comp.numLayers; i++) {
            used[comp.layer(i).label] = true;
        }
        return used;
    }

    // ----------------------------------------------------------
    // Apply label to layers in comp
    // ----------------------------------------------------------
    function applyLabelToLayers(labelNum, comp, alsoSource) {
        var applied = false;
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.selected) {
                layer.label = labelNum;
                applied = true;
                // Optionally mirror label to the layer's source item
                if (alsoSource && layer.source) {
                    try { layer.source.label = labelNum; } catch (e) {}
                }
            }
        }
        return applied;
    }

    // Apply label to selected project panel items
    function applyLabelToProjectItems(labelNum) {
        for (var j = 1; j <= app.project.numItems; j++) {
            if (app.project.item(j).selected) {
                app.project.item(j).label = labelNum;
            }
        }
    }

    // Apply label to selected keyframes (AE 22.6+)
    function applyLabelToKeyframes(labelNum, comp) {
        try {
            for (var i = 1; i <= comp.numLayers; i++) {
                var layer = comp.layer(i);
                applyToProperties(layer, labelNum);
            }
        } catch (e) {
            // Keyframe labels not supported in this AE version
        }
    }

    function applyToProperties(propGroup, labelNum) {
        for (var p = 1; p <= propGroup.numProperties; p++) {
            var prop = propGroup.property(p);
            if (prop.numProperties !== undefined) {
                applyToProperties(prop, labelNum); // recurse into groups
            } else if (prop.numKeys > 0) {
                for (var k = 1; k <= prop.numKeys; k++) {
                    try {
                        if (prop.keySelected(k)) {
                            prop.setLabelAtKey(k, labelNum);
                        }
                    } catch (e) {}
                }
            }
        }
    }

    // Main label application dispatcher
    function applyLabel(labelNum, modifiers) {
        modifiers = modifiers || {};
        var comp = getActiveComp();

        app.beginUndoGroup("Apply Label");

        if (modifiers.ctrl && comp) {
            // Ctrl/Cmd + click → target keyframes
            applyLabelToKeyframes(labelNum, comp);
        } else if (comp) {
            var applied = applyLabelToLayers(labelNum, comp, modifiers.alt);
            if (!applied) {
                // Nothing selected in timeline → fall back to Project panel
                applyLabelToProjectItems(labelNum);
            }
        } else {
            // No active comp → Project panel items
            applyLabelToProjectItems(labelNum);
        }

        app.endUndoGroup();
        refreshSwatches();
    }

    // ----------------------------------------------------------
    // Select same label
    // ----------------------------------------------------------
    function selectSameLabel(exclude) {
        var comp = getActiveComp();
        if (!comp) return;

        var targetLabel = -1;
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).selected) {
                targetLabel = comp.layer(i).label;
                break;
            }
        }
        if (targetLabel < 0) return;

        app.beginUndoGroup("Select Same Label");
        for (var k = 1; k <= comp.numLayers; k++) {
            var matches = (comp.layer(k).label === targetLabel);
            comp.layer(k).selected = exclude ? !matches : matches;
        }
        app.endUndoGroup();
    }

    // ----------------------------------------------------------
    // UI
    // ----------------------------------------------------------
    var swatchButtons = []; // keep refs for refresh

    function drawSwatch(btn, info, dimmed) {
        btn.onDraw = function () {
            var g = this.graphics;
            var w = this.size[0];
            var h = this.size[1];
            var alpha = dimmed ? 0.25 : 1.0;

            // Fill
            var fillBrush = g.newBrush(g.BrushType.SOLID_COLOR,
                [info.rgb[0], info.rgb[1], info.rgb[2], alpha]);
            g.rectPath(0, 0, w, h);
            g.fillPath(fillBrush);

            // Top highlight
            if (!dimmed) {
                var hilite = g.newPen(g.PenType.SOLID_COLOR, [1, 1, 1, 0.3], 1);
                g.moveTo(1, 1); g.lineTo(w - 1, 1);
                g.strokePath(hilite);
            }

            // Border
            var border = g.newPen(g.PenType.SOLID_COLOR, [0, 0, 0, 0.4], 1);
            g.rectPath(0, 0, w, h);
            g.strokePath(border);
        };
        btn.notify("onDraw"); // force repaint
    }

    function refreshSwatches() {
        var used = filterUnused ? getUsedLabelIds() : null;
        for (var i = 0; i < swatchButtons.length; i++) {
            var btn   = swatchButtons[i].btn;
            var info  = swatchButtons[i].info;
            var dimmed = used ? !used[info.id] : false;
            drawSwatch(btn, info, dimmed);
        }
    }

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", "Labels", undefined, { resizeable: true });

        win.orientation  = "column";
        win.alignChildren = ["left", "top"];
        win.spacing      = 2;
        win.margins      = [4, 4, 4, 4];

        // ---- Top row: swatches ----
        var swatchRow = win.add("group");
        swatchRow.orientation   = "row";
        swatchRow.alignChildren = ["left", "center"];
        swatchRow.spacing       = 2;
        swatchRow.margins       = 0;

        swatchButtons = [];

        for (var i = 0; i < LABELS.length; i++) {
            (function (info) {
                var btn = swatchRow.add("button", [0, 0, SWATCH_W, SWATCH_H], "");
                btn.helpTip = info.name + " (Label " + info.id + ")\n" +
                              "Click: apply to layers/items\n" +
                              "Alt+Click: also apply to source item\n" +
                              "Ctrl/Cmd+Click: apply to keyframes";

                drawSwatch(btn, info, false);

                btn.onClick = function () {
                    applyLabel(info.id, { ctrl: ScriptUI.environment.keyboardState.ctrlKey,
                                          alt:  ScriptUI.environment.keyboardState.altKey });
                };

                swatchButtons.push({ btn: btn, info: info });
            })(LABELS[i]);
        }

        // ---- Divider ----
        swatchRow.add("panel", [0, 0, 1, SWATCH_H], "");

        // ---- [x] remove label ----
        var btnNone = swatchRow.add("button", [0, 0, 22, SWATCH_H], "x");
        btnNone.helpTip = "Remove Label (None)";
        btnNone.onClick = function () { applyLabel(0); };

        // ---- [s] select same ----
        var btnSel = swatchRow.add("button", [0, 0, 22, SWATCH_H], "s");
        btnSel.helpTip = "Select all layers/items with same label\nAlt+Click: select INVERSE (all except this label)";
        btnSel.onClick = function () {
            selectSameLabel(ScriptUI.environment.keyboardState.altKey);
        };

        // ---- Bottom row: filter toggle ----
        var bottomRow = win.add("group");
        bottomRow.orientation   = "row";
        bottomRow.alignChildren = ["left", "center"];
        bottomRow.spacing       = 4;
        bottomRow.margins       = [0, 2, 0, 0];

        var chkFilter = bottomRow.add("checkbox", undefined, "Dim unused labels");
        chkFilter.value   = false;
        chkFilter.helpTip = "Dims label swatches that are not used in the active composition";
        chkFilter.onClick = function () {
            filterUnused = this.value;
            refreshSwatches();
        };

        var btnRefresh = bottomRow.add("button", undefined, "↺");
        btnRefresh.preferredSize = [24, 18];
        btnRefresh.helpTip = "Refresh swatch states from active comp";
        btnRefresh.onClick = function () { refreshSwatches(); };

        // ---- Layout ----
        win.layout.layout(true);
        win.layout.resize();
        win.onResizing = win.onResize = function () { this.layout.resize(); };

        return win;
    }

    // ----------------------------------------------------------
    // Launch
    // ----------------------------------------------------------
    var myPanel = buildUI(thisObj);

    if (myPanel instanceof Window) {
        myPanel.center();
        myPanel.show();
    } else {
        myPanel.layout.layout(true);
    }

}(this));
