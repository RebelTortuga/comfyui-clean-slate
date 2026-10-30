import { app } from "/scripts/app.js";

const IMAGE_WIDGETS = new Set(["image", "input_image", "source_image", "reference_image", "image_path"]);

function clearWidget(node, widget, replacement = "") {
  if (typeof widget.value !== "string" || widget.value === replacement) return false;
  const previousValue = widget.value;
  widget.value = replacement;
  // ComfyUI tracks edits through widget-change events, not canvas redraws.
  node.onWidgetChanged?.(widget.name, replacement, previousValue, widget);
  return true;
}

function hasEmptyImageSelection(node) {
  return (node.widgets || []).some(widget =>
    IMAGE_WIDGETS.has(String(widget.name || "").toLowerCase()) &&
    widget.value === ""
  );
}

function clearPreviewState(node) {
  let changed = false;
  // Tab restoration rebuilds node.imgs from these caches. Clearing only the
  // canvas array leaves downstream previews available to restore later.
  if (node.graph === app.canvas?.graph) {
    const key = String(node.id);
    const output = app.nodeOutputs?.[key];
    if (output && Object.hasOwn(output, "images")) {
      const remaining = { ...output };
      delete remaining.images;
      // Reassignment also updates the output store on current frontends.
      if (Object.keys(remaining).length) app.nodeOutputs[key] = remaining;
      else delete app.nodeOutputs[key];
      changed = true;
    }
    if (app.nodePreviewImages && key in app.nodePreviewImages) {
      delete app.nodePreviewImages[key];
      changed = true;
    }
  }
  if (Array.isArray(node.imgs) && node.imgs.length) {
    node.imgs = [];
    changed = true;
  }
  if (changed) {
    node.imageIndex = null;
    node.overIndex = null;
    node.setDirtyCanvas?.(true, true);
  }
  return changed;
}

function clearImagePreview(node) {
  return (node.properties?._cleanSlatePreviewCleared === true ||
    hasEmptyImageSelection(node)) && clearPreviewState(node);
}

function guardEmptyImagePreview(node) {
  if (node._cleanSlatePreviewGuard) return;
  node._cleanSlatePreviewGuard = true;
  const previousDraw = node.onDrawBackground;
  // Load Image previews can be repopulated asynchronously after graph loading.
  // Check the real image selection before every redraw; a newly chosen image
  // immediately renders normally because its widget will no longer be empty.
  node.onDrawBackground = function (...args) {
    clearImagePreview(this);
    return previousDraw?.apply(this, args);
  };
  clearImagePreview(node);
}

function clearStalePreviewsInActiveWorkflow() {
  // ComfyUI can restore a tab's node.imgs cache without calling the usual
  // loadedGraphNode/onDrawBackground callbacks. Inspect only the active canvas.
  const graph = app.canvas?.graph;
  if (!graph?._nodes) return;
  for (const node of graph._nodes) clearImagePreview(node);
}

function linkedSources(controller, kind) {
  const graph = controller.graph;
  const result = [];
  for (const input of controller.inputs || []) {
    if (input.link == null) continue;
    const name = String(input.name || "");
    if (kind === "image" && !/^(image_\d+|mask_\d+|latent(?:_2)?)$/.test(name)) continue;
    if (kind === "prompt" && !/^(positive|negative)$/.test(name)) continue;
    const link = graph?.links?.[input.link];
    const origin = link && graph.getNodeById?.(link.origin_id);
    if (origin) result.push({ node: origin, inputName: name });
  }
  return result;
}

function downstreamNodes(start) {
  const graph = start.graph;
  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    for (const output of node.outputs || []) {
      for (const id of output.links || []) {
        const link = graph?.links?.[id];
        const target = link && graph.getNodeById?.(link.target_id);
        if (target && !visited.has(target.id)) queue.push(target);
      }
    }
  }
  return [...visited].map(id => graph.getNodeById(id)).filter(Boolean);
}

// Follow only reroutes and linked prompt text, never unrelated model inputs.
function promptWidgets(start, polarity, visited = new Set()) {
  if (!start || visited.has(start)) return [];
  visited.add(start);
  const widgets = start.widgets || [];
  const named = widgets.filter(w => /^(positive|negative)$/i.test(w.name || ""));
  const candidates = named.length
    ? named.filter(w => String(w.name).toLowerCase() === polarity)
    : widgets.filter(w => /^(text|prompt|text_g|text_l|text_t5)$/i.test(w.name || ""));
  const result = candidates.filter(w => typeof w.value === "string")
    .map(widget => ({ node: start, widget }));
  for (const input of start.inputs || []) {
    const name = String(input.name || "").toLowerCase();
    const reroute = /reroute/i.test(start.type || start.comfyClass || "");
    if (!reroute && !(named.length ? name === polarity :
        /^(text|prompt|text_g|text_l|text_t5)$/.test(name))) continue;
    const link = start.graph?.links?.[input.link];
    const origin = link && start.graph.getNodeById?.(link.origin_id);
    result.push(...promptWidgets(origin, polarity, visited));
  }
  return result;
}

function reloadConnectedControls(controller) {
  const graph = controller.graph;
  if (!graph) throw new Error("Controller is not in an active workflow.");
  const targets = new Set();
  for (const input of controller.inputs || []) {
    if (input.link == null) continue;
    const link = graph.links?.[input.link];
    const source = link && graph.getNodeById?.(link.origin_id);
    if (source && /^(ImpactSwitch|LatentSwitch|SEGSSwitch)$/.test(source.comfyClass || source.type || "")) {
      targets.add(source);
    }
  }
  let removed = 0;
  graph.beforeChange?.();
  try {
    for (const node of targets) {
      if (typeof node.removeInput !== "function") continue;
      const slots = (node.inputs || []).filter(i => /^input\d+$/.test(i.name || ""));
      const selected = Number((node.widgets || []).find(w => w.name === "select")?.value || 1);
      const highestConnected = Math.max(0, ...slots.filter(i => i.link != null)
        .map(i => Number(i.name.slice(5))));
      const keepThrough = Math.max(2, highestConnected + 1, Number.isFinite(selected) ? selected : 1);
      // Removing unused slots must not trigger Impact Pack's dynamic-input
      // callback, which can append new slots during the same operation.
      const ownCallback = Object.getOwnPropertyDescriptor(node, "onConnectionsChange");
      node.onConnectionsChange = function () {};
      try {
        for (let index = node.inputs.length - 1; index >= 0; index--) {
          const input = node.inputs[index];
          if (!/^input\d+$/.test(input.name || "") || input.link != null ||
              Number(input.name.slice(5)) <= keepThrough) continue;
          node.removeInput(index);
          removed++;
        }
      } finally {
        if (ownCallback) Object.defineProperty(node, "onConnectionsChange", ownCallback);
        else delete node.onConnectionsChange;
      }
      const selectWidget = (node.widgets || []).find(w => w.name === "select");
      if (selectWidget?.options) {
        selectWidget.options.max = Math.max(1, ...(node.inputs || [])
          .filter(i => /^input\d+$/.test(i.name || "")).map(i => Number(i.name.slice(5))));
      }
      if (node.computeSize && node.setSize) node.setSize(node.computeSize());
      node.setDirtyCanvas?.(true, true);
    }
  } finally {
    graph.afterChange?.();
    if (targets.size) graph.change?.();
    graph.setDirtyCanvas?.(true, true);
  }
  return { controls: targets.size, removed };
}

function reloadAllConnections(controller, scope = "all") {
  const sources = linkedSources(controller).filter(({ inputName }) => {
    if (scope === "all") return true;
    if (scope === "images") return /^(image_\d+|mask_\d+|latent(?:_2)?)$/.test(inputName);
    if (scope === "both") return /^(positive|negative)$/.test(inputName);
    return inputName === scope;
  });
  const targets = new Set(sources.map(source => source.node));
  // Never configure, recreate, reconnect or remove slots during this action.
  // Custom-node configure callbacks can otherwise rewrite existing wires.
  for (const node of targets) {
    guardEmptyImagePreview(node);
    clearImagePreview(node);
    node.setDirtyCanvas?.(true, true);
  }
  clearStalePreviewsInActiveWorkflow();
  controller.graph?.setDirtyCanvas?.(true, true);
  app.canvas?.setDirty?.(true, true);
  return { nodes: targets.size, controls: 0, failures: [] };
}

function layoutController(node, initializeSize = true) {
  // Explicit slot positions keep sockets, labels and hit targets together.
  node.widgets_up = true;
  node.widgets_start_y = 8;
  const buttonHeight = globalThis.LiteGraph?.NODE_WIDGET_HEIGHT || 20;
  const slotHeight = globalThis.LiteGraph?.NODE_SLOT_HEIGHT || 20;
  const top = 8 + (node.widgets || []).length * (buttonHeight + 4) + 16;
  for (const [index, input] of (node.inputs || []).entries()) {
    input.pos = [0, top + index * slotHeight];
  }
  const height = top + (node.inputs || []).length * slotHeight + 8;
  if (initializeSize) node.setSize?.([Math.max(280, node.size?.[0] || 280), height]);
  node.setDirtyCanvas?.(true, true);
}

function resetConnected(controller, { images = true, prompts = "none" } = {}) {
  const graph = controller.graph;
  let imageCount = 0, promptCount = 0, previewCount = 0;
  const touched = new Set();
  graph.beforeChange?.();
  try {
    if (images) {
      for (const { node } of linkedSources(controller, "image")) {
        for (const widget of node.widgets || []) {
          if (IMAGE_WIDGETS.has(String(widget.name || "").toLowerCase()) &&
              clearWidget(node, widget)) {
            imageCount++;
          }
        }
        guardEmptyImagePreview(node);
        for (const target of downstreamNodes(node)) {
          // Properties survive workflow serialization and tab reconstruction.
          // Load-image nodes instead use their empty selection as the guard,
          // allowing a newly selected source image to display immediately.
          const isSource = (target.widgets || []).some(w =>
            IMAGE_WIDGETS.has(String(w.name || "").toLowerCase()));
          if (!isSource && target !== controller) {
            target.properties ||= {};
            target.properties._cleanSlatePreviewCleared = true;
          }
          guardEmptyImagePreview(target);
          if (clearPreviewState(target)) previewCount++;
          touched.add(target);
        }
      }
    }
    if (prompts !== "none") {
      for (const { node, inputName } of linkedSources(controller, "prompt")) {
        if (prompts !== "both" && prompts !== inputName) continue;
        for (const { node: source, widget } of promptWidgets(node, inputName)) {
          if (!clearWidget(source, widget)) continue;
          promptCount++;
          touched.add(source);
        }
        touched.add(node);
      }
    }
    for (const node of touched) node.setDirtyCanvas?.(true, true);
  } finally {
    graph.afterChange?.();
    if (touched.size) graph.change?.();
    graph.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty?.(true, true);
  }
  return { imageCount, promptCount, previewCount };
}

app.registerExtension({
  name: "rebeltortuga.cleanSlateController",
  loadedGraphNode(node) {
    guardEmptyImagePreview(node);
    if (node.comfyClass === "CleanSlateController" || node.type === "CleanSlateController") {
      layoutController(node, false);
    }
  },
  beforeRegisterNodeDef(nodeType, nodeData) {
    // ComfyUI invokes this on nodes when a new execution starts. Release the
    // saved clear marker then, so new previews and executed outputs can render.
    const previousExecutionStart = nodeType.prototype.onExecutionStart;
    nodeType.prototype.onExecutionStart = function (...args) {
      if (this.properties) delete this.properties._cleanSlatePreviewCleared;
      return previousExecutionStart?.apply(this, args);
    };
    if (nodeData.name !== "CleanSlateController") return;
    const previous = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = previous?.apply(this, arguments);
      const actions = [
        ["Reload All Connections", "all"],
        ["Reload All Connected Images", "images"],
        ["Reload Both Prompts (+ / -)", "both"],
        ["Reload + Prompt", "positive"],
        ["Reload - Prompt", "negative"],
      ];
      for (const [label, scope] of actions) {
        this.addWidget("button", label, null, () => {
          if (!window.confirm(`${label}?\n\nThis clears the selected connected content.\nConnections, files, saved history and other settings stay intact.\n\nChoose Cancel or press Esc to leave everything unchanged.`)) return;
          try {
            const cleared = resetConnected(this, {
              images: scope === "all" || scope === "images",
              prompts: scope === "all" || scope === "both" ? "both" :
                scope === "positive" || scope === "negative" ? scope : "none",
            });
            const r = reloadAllConnections(this, scope);
            window.alert(`${label} finished.\nNodes reloaded: ${r.nodes}\nControls compacted: ${r.controls}\nImage fields cleared: ${cleared.imageCount}\nPrompt fields cleared: ${cleared.promptCount}\nCleared content stays blank; wires and other settings preserved.${r.failures.length ? "\nCould not reload: " + r.failures.join(", ") : ""}`);
          } catch (error) {
            window.alert(`Clean Slate error: ${error.message}`);
          }
        });
      }
      layoutController(this);
      return result;
    };
  },
});

// Clear async tab-restored previews only for empty image sources or nodes
// explicitly marked by a Clear action. New execution releases those markers.
window.setInterval(clearStalePreviewsInActiveWorkflow, 250);
