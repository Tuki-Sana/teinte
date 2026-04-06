import type { PickerPaletteEntry } from "../types/analysis";
import {
  PICKER_LABEL_MAX,
  PICKER_PALETTE_MAX,
  PICKER_SET_NAME_MAX,
} from "./pickerPaletteStorage";

/** ファイル import 用の緩い検証（addedAt・id は欠けてもよい） */
function isRawEntry(x: unknown): x is Record<string, unknown> {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (
    typeof o.r !== "number" ||
    typeof o.g !== "number" ||
    typeof o.b !== "number" ||
    typeof o.hex !== "string"
  ) {
    return false;
  }
  if ("addedAt" in o && o.addedAt != null && typeof o.addedAt !== "string") {
    return false;
  }
  if ("label" in o && o.label != null && typeof o.label !== "string") {
    return false;
  }
  if ("id" in o && o.id != null && typeof o.id !== "string") return false;
  return true;
}

function clampRgb(n: number): number {
  return Math.max(0, Math.min(255, Math.round(Number(n))));
}

function normalizeHex(hex: string): string {
  const t = hex.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toUpperCase();
  return t;
}

/** 1 件をパレット用に正規化（id 欠落時は newId、RGB は 0〜255） */
export function normalizePickerImportEntry(
  raw: unknown,
  newId: () => string,
): PickerPaletteEntry | null {
  if (!isRawEntry(raw)) return null;
  const o = raw;
  const labelRaw =
    typeof o.label === "string" ? o.label.trim().slice(0, PICKER_LABEL_MAX) : "";
  const entry: PickerPaletteEntry = {
    id: typeof o.id === "string" && o.id.length > 0 ? o.id : newId(),
    r: clampRgb(o.r as number),
    g: clampRgb(o.g as number),
    b: clampRgb(o.b as number),
    hex: normalizeHex(o.hex as string),
    addedAt:
      typeof o.addedAt === "string" && o.addedAt.length > 0
        ? o.addedAt
        : new Date().toISOString(),
  };
  if (labelRaw) entry.label = labelRaw;
  return entry;
}

export type ParsePickerResult =
  | { ok: true; entries: PickerPaletteEntry[]; setName?: string }
  | { ok: false; error: string };

/**
 * アプリ書き出し（kind: pickerPalette）またはエントリ配列のみの JSON を解釈する。
 */
export function parsePickerPaletteExport(
  data: unknown,
  newId: () => string,
): ParsePickerResult {
  let arr: unknown[];
  if (data === null || typeof data !== "object") {
    return { ok: false, error: "JSON がオブジェクトではありません" };
  }
  const root = data as Record<string, unknown>;
  if (Array.isArray(data)) {
    arr = data;
  } else if (root.kind === "pickerPalette" && Array.isArray(root.entries)) {
    arr = root.entries;
  } else if (Array.isArray(root.entries)) {
    arr = root.entries;
  } else {
    return {
      ok: false,
      error:
        "パレット JSON の形式が分かりません（entries 配列または kind: pickerPalette が必要です）",
    };
  }
  let setName: string | undefined;
  if (!Array.isArray(data) && typeof root.name === "string") {
    const t = root.name.trim().slice(0, PICKER_SET_NAME_MAX);
    if (t.length > 0) setName = t;
  }
  const out: PickerPaletteEntry[] = [];
  for (const item of arr) {
    const e = normalizePickerImportEntry(item, newId);
    if (e) out.push(e);
  }
  if (out.length === 0) {
    return { ok: false, error: "有効な色エントリがありません" };
  }
  const base = { ok: true as const, entries: out.slice(0, PICKER_PALETTE_MAX) };
  return setName !== undefined ? { ...base, setName } : base;
}

export function mergePickerPalettes(
  current: PickerPaletteEntry[],
  imported: PickerPaletteEntry[],
): PickerPaletteEntry[] {
  const merged = [...imported, ...current];
  return merged.slice(0, PICKER_PALETTE_MAX);
}
