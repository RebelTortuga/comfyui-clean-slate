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

function clearImagePreview(node) {
  if (!hasEmptyImageSelection(node)) return false;
  if (!Array.isArray(node.imgs) || !node.imgs.length) return false;
  node.imgs = [];
  node.imageIndex = null;
  node.setDirtyCanvas?.(true, true);
  return true;
}

function guardEmptyImagePreview(node) {
  if (node._cleanSlatePreviewGuard ||
      !(node.widgets || []).some(w => IMAGE_WIDGETS.has(String(w.name || "").toLowerCase()))) return;
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
    if (kind === "image" && !/^(image_\d+|mask_\d+)$/.test(name)) continue;
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
          if (Array.isArray(target.imgs) && target.imgs.length) {
            target.imgs = [];
            target.imageIndex = null;
            previewCount++;
          }
          touched.add(target);
        }
      }
    }
    if (prompts !== "none") {
      for (const { node, inputName } of linkedSources(controller, "prompt")) {
        if (prompts !== "both" && prompts !== inputName) continue;
        for (const widget of node.widgets || []) {
          const name = String(widget.name || "").toLowerCase();
          // A connected Prompt History output targets only its matching active field.
          if (name !== inputName && !(name === "text" && inputName === "positive")) continue;
          if (!clearWidget(node, widget)) continue;
          promptCount++;
        }
        touched.add(node);
      }
    }
    for (const node of touched) node.setDirtyCanvas?.(true, true);
  } finally {
    graph.afterChange?.();
    if (imageCount || promptCount) graph.change?.();
    graph.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty?.(true, true);
  }
  return { imageCount, promptCount, previewCount };
}

app.registerExtension({
  name: "rebeltortuga.cleanSlateController",
  loadedGraphNode(node) {
    guardEmptyImagePreview(node);
  },
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "CleanSlateController") return;
    const previous = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = previous?.apply(this, arguments);
      const run = (images, prompts) => {
        const parts = [];
        if (images) parts.push("connected images/previews");
        if (prompts === "positive") parts.push("connected positive (+) prompt");
        if (prompts === "negative") parts.push("connected negative (−) prompt");
        if (prompts === "both") parts.push("connected positive and negative prompts");
        if (!window.confirm(`Clear ${parts.join(" and ")}?\n\nOnly connected sources are affected. Files, histories, model settings and wires stay intact.`)) return;
        try {
          const r = resetConnected(this, { images, prompts });
          window.alert(`Clean Slate finished.\nImage fields: ${r.imageCount}\nPrompt fields: ${r.promptCount}\nPreviews: ${r.previewCount}\n\nOriginal image files were not changed.`);
        } catch (error) {
          window.alert(`Clean Slate error: ${error.message}`);
        }
      };
      this.addWidget("button", "Clear Connected Images", null, () => run(true, "none"));
      this.addWidget("button", "Clear Positive (+)", null, () => run(false, "positive"));
      this.addWidget("button", "Clear Negative (−)", null, () => run(false, "negative"));
      this.addWidget("button", "Clear Both Prompts (+ / −)", null, () => run(false, "both"));
      this.addWidget("button", "Clear Images + Both Prompts", null, () => run(true, "both"));
      return result;
    };
  },
});

// Keep one inexpensive watcher for tab restoration. It never touches a node
// whose image widget contains an actual filename, or any generated-image node
// without an image-selection widget.
window.setInterval(clearStalePreviewsInActiveWorkflow, 250);
