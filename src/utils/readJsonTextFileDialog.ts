import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

/** ファイルダイアログで JSON を 1 つ選び、UTF-8 テキストとして読み込む */
export async function readJsonTextFileDialog(): Promise<string | null> {
  const filePath = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (filePath === null || Array.isArray(filePath)) return null;
  return invoke<string>("read_text_file", { path: filePath });
}
