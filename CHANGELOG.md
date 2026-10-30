# Changelog

## 0.2.0 — Connected clearing and workflow controls

Consolidated changes since the published v0.1.0 release; local test-build numbers are not separate public releases.

- Replace the old Clear actions with the five requested Reload actions, in their final order, above the sockets.
- Reduce eight image inputs to five; expand four mask inputs to five; add two LATENT inputs and one optional control input.
- Support separate standard positive/negative text encoders and paired prompts, including negative text fields and linked text/reroute sources.
- Clear downstream image-output and preview caches and retain cleared-preview state through workflow-tab reconstruction; allow fresh previews on the next generation.
- Preserve wires by avoiding node reconfiguration, recreation and slot removal during button actions.
- Add OK/Cancel confirmation; Cancel or Esc exits before changes.
- Preserve the controller's manually chosen width and height when switching tabs.
- Add the fixed two-input CleanSlateImageMode node for automatic/painted-mask output selection.
- Add a blank example workflow, actual screenshots and a separate illustrative preview; update installation and behavior documentation.

Validation: isolated logic checks passed; the author confirmed the working workflow and controller behavior in their setup. Clean-machine compatibility is not certified.

## 0.1.0 — Initial public release

- Standalone, connection-based **Clean Slate Controller**.
- Eight optional image inputs, four optional mask inputs, and dedicated positive and negative prompt inputs.
- Individual buttons for images, positive prompt, negative prompt, both prompts, and images plus both prompts.
- Confirmation before changes.
- Preserves files, prompt history, model settings, node positions, and connections.
- No automatic save, deletion, or archiving.

