"""Standalone Clean Slate controller with connection-based targets."""

class CleanSlateController:
    @classmethod
    def INPUT_TYPES(cls):
        optional = {f"image_{i}": ("IMAGE",) for i in range(1, 9)}
        optional.update({f"mask_{i}": ("MASK",) for i in range(1, 5)})
        optional.update({"positive": ("STRING", {"forceInput": True}),
                         "negative": ("STRING", {"forceInput": True})})
        return {"required": {}, "optional": optional}

    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = "RebelTortuga / Utilities"
    DESCRIPTION = "Connect image and prompt outputs; clear only connected sources using the buttons."

    def noop(self, **kwargs):
        return ()


NODE_CLASS_MAPPINGS = {"CleanSlateController": CleanSlateController}
NODE_DISPLAY_NAME_MAPPINGS = {"CleanSlateController": "Clean Slate Controller"}
WEB_DIRECTORY = "web"
