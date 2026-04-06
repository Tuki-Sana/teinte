import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";
import { logAppError } from "../utils/appLog";

function isTauriWindow(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function usePaletteDangerConfirm(appDisplayName: string) {
  async function paletteDangerConfirm(message: string): Promise<boolean> {
    if (isTauriWindow()) {
      try {
        return await tauriConfirm(message, {
          title: appDisplayName,
          kind: "warning",
          okLabel: "OK",
          cancelLabel: "キャンセル",
        });
      } catch (e) {
        logAppError("paletteDangerConfirm (Tauri confirm)", e);
        return false;
      }
    }
    return window.confirm(message);
  }

  return { paletteDangerConfirm };
}
