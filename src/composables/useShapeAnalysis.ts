import { invoke } from "@tauri-apps/api/core";
import { ref } from "vue";
import type { ShapeAnalysis, ShapeAnalysisMode } from "../types/analysis";

export function useShapeAnalysis() {
  const shapeAnalysis = ref<ShapeAnalysis | null>(null);
  const shapeLoading = ref(false);
  const shapeError = ref("");

  async function analyzeShape(path: string, mode: ShapeAnalysisMode = "edge") {
    shapeLoading.value = true;
    shapeError.value = "";
    try {
      shapeAnalysis.value = await invoke<ShapeAnalysis>("analyze_shape", {
        path,
        mode,
      });
    } catch (e) {
      shapeError.value = String(e);
      shapeAnalysis.value = null;
    } finally {
      shapeLoading.value = false;
    }
  }

  function clearShape() {
    shapeAnalysis.value = null;
    shapeError.value = "";
  }

  return { shapeAnalysis, shapeLoading, shapeError, analyzeShape, clearShape };
}
