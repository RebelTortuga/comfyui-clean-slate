"""Standalone Clean Slate controller with connection-based targets."""

class AnyPromptType(str):
    """Accept STRING and CONDITIONING without changing the source node."""
    def __ne__(self, other):
        return False


PROMPT_TYPE = AnyPromptType("*")


class CleanSlateController:
    @classmethod
    def INPUT_TYPES(cls):
        optional = {f"image_{i}": ("IMAGE",) for i in range(1, 6)}
        optional.update({f"mask_{i}": ("MASK",) for i in range(1, 6)})
        optional.update({"positive": (PROMPT_TYPE, {"forceInput": True}),
                         "negative": (PROMPT_TYPE, {"forceInput": True})})
        optional.update({"latent": ("LATENT",), "latent_2": ("LATENT",), "control": (PROMPT_TYPE, {"forceInput": True})})
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


class CleanSlateImageMode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "input1": ("IMAGE", {"lazy": True}),
            "input2": ("IMAGE", {"lazy": True}),
            "select": ("INT", {"default": 1, "min": 1, "max": 2}),
        }}

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("IMAGE",)
    FUNCTION = "select_image"
    CATEGORY = "RebelTortuga / Utilities"
    DESCRIPTION = "1: Automatic edit. 2: Composite edit through the painted mask. Fixed image inputs."

    def check_lazy_status(self, select, input1=None, input2=None):
        key = "input1" if select == 1 else "input2"
        return [key] if (input1 if select == 1 else input2) is None else []

    def select_image(self, select, input1=None, input2=None):
        image = input1 if select == 1 else input2
        if image is None:
            raise ValueError("Selected image branch has no data.")
        return (image,)


NODE_CLASS_MAPPINGS["CleanSlateImageMode"] = CleanSlateImageMode
NODE_DISPLAY_NAME_MAPPINGS["CleanSlateImageMode"] = "Image Edit Mode (1 Auto / 2 Painted Mask)"
