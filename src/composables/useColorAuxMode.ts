import { ref, watch } from "vue";
import type { ColorAuxMode } from "../utils/colorFormat";

const COLOR_AUX_LS = "imageMetadataAnalyzer.colorAuxMode";

function readColorAuxMode(): ColorAuxMode {
  try {
    const v = localStorage.getItem(COLOR_AUX_LS);
    if (v === "rgb" || v === "hsl") return v;
  } catch {
    /* ignore */
  }
  return "rgb";
}

export function useColorAuxMode() {
  const colorAuxMode = ref<ColorAuxMode>(readColorAuxMode());

  watch(colorAuxMode, (m) => {
    try {
      localStorage.setItem(COLOR_AUX_LS, m);
    } catch {
      /* ignore */
    }
  });

  return { colorAuxMode };
}
