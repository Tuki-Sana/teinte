import { ref, watch } from "vue";
import type { ColorAuxMode } from "../utils/colorFormat";

const COLOR_AUX_LS = "teinte.colorAuxMode";
const COLOR_AUX_LS_LEGACY = "imageMetadataAnalyzer.colorAuxMode";

function readColorAuxMode(): ColorAuxMode {
  try {
    const v = localStorage.getItem(COLOR_AUX_LS);
    if (v === "rgb" || v === "hsl") return v;
    const legacy = localStorage.getItem(COLOR_AUX_LS_LEGACY);
    if (legacy === "rgb" || legacy === "hsl") {
      localStorage.setItem(COLOR_AUX_LS, legacy);
      localStorage.removeItem(COLOR_AUX_LS_LEGACY);
      return legacy;
    }
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
