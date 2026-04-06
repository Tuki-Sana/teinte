import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { computed, ref, watch, type Ref } from "vue";
import type { PickerPaletteEntry, PixelSample } from "../types/analysis";
import {
  mergePickerPalettes,
  parsePickerPaletteExport,
} from "../utils/pickerPaletteImport";
import {
  PICKER_LABEL_MAX,
  PICKER_PALETTE_MAX,
  PICKER_SET_NAME_MAX,
  getActivePaletteIndex,
  loadPickerPalettesState,
  renumberAutoPaletteSetNames,
  savePickerPalettesState,
} from "../utils/pickerPaletteStorage";
import { readJsonTextFileDialog } from "../utils/readJsonTextFileDialog";

export function usePickerPaletteApp(options: {
  showToast: (msg: string) => void;
  paletteDangerConfirm: (message: string) => Promise<boolean>;
  copyText: (text: string, label: string) => Promise<void>;
  picked: Ref<PixelSample | null>;
}) {
  const { showToast, paletteDangerConfirm, copyText, picked } = options;

  const paletteState = ref(loadPickerPalettesState());

  watch(
    paletteState,
    (v) => {
      savePickerPalettesState(v);
    },
    { deep: true },
  );

  const activePaletteSet = computed(() => {
    const r = paletteState.value;
    const i = getActivePaletteIndex(r);
    return r.palettes[i]!;
  });

  const pickerPalette = computed({
    get(): PickerPaletteEntry[] {
      return activePaletteSet.value.entries;
    },
    set(entries: PickerPaletteEntry[]) {
      const r = paletteState.value;
      const i = getActivePaletteIndex(r);
      const nextPals = r.palettes.map((p, j) =>
        j === i
          ? {
              ...p,
              entries: entries.slice(0, PICKER_PALETTE_MAX),
              updatedAt: new Date().toISOString(),
            }
          : p,
      );
      paletteState.value = { ...r, palettes: nextPals };
    },
  });

  const canDeletePaletteSet = computed(
    () => paletteState.value.palettes.length > 1,
  );

  const paletteLabelDraft = ref("");

  function setActivePaletteId(id: string) {
    if (!paletteState.value.palettes.some((p) => p.id === id)) return;
    paletteState.value = { ...paletteState.value, activePaletteId: id };
  }

  function updateActiveSetName(name: string) {
    const t = name.slice(0, PICKER_SET_NAME_MAX);
    const r = paletteState.value;
    const i = getActivePaletteIndex(r);
    const nextPals = r.palettes.map((p, j) =>
      j === i
        ? { ...p, name: t, updatedAt: new Date().toISOString() }
        : p,
    );
    paletteState.value = { ...r, palettes: nextPals };
  }

  function addPaletteSet() {
    const r = paletteState.value;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const n = r.palettes.length + 1;
    paletteState.value = {
      ...r,
      palettes: [
        ...r.palettes,
        { id, name: `パレット ${n}`, entries: [], updatedAt: now },
      ],
      activePaletteId: id,
    };
  }

  function duplicateActivePaletteSet() {
    const r = paletteState.value;
    const i = getActivePaletteIndex(r);
    const cur = r.palettes[i]!;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const entries = cur.entries.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      addedAt: new Date().toISOString(),
    }));
    const base = cur.name.trim();
    const copyLabel = base ? `${base} のコピー` : "無題のコピー";
    const name = copyLabel.slice(0, PICKER_SET_NAME_MAX);
    paletteState.value = {
      ...r,
      palettes: [...r.palettes, { id, name, entries, updatedAt: now }],
      activePaletteId: id,
    };
  }

  async function deleteActivePaletteSet() {
    const r = paletteState.value;
    if (r.palettes.length <= 1) {
      showToast("カラーセットは最低 1 つ必要です");
      return;
    }
    const label = activePaletteTitleLabel.value;
    const n = pickerPalette.value.length;
    const msg =
      `「${label}」というカラーセットを削除しますか？\n` +
      `中の色（${n} 色）もまとめて消えます。元に戻せません。`;
    if (!(await paletteDangerConfirm(msg))) return;
    const id = r.activePaletteId;
    const next = r.palettes.filter((p) => p.id !== id);
    const newActive = next[0]!.id;
    const palettes = renumberAutoPaletteSetNames(next);
    paletteState.value = {
      ...r,
      palettes,
      activePaletteId: newActive,
    };
    showToast("カラーセットを削除しました");
  }

  const activePaletteTitleLabel = computed(() => {
    const t = activePaletteSet.value.name.trim();
    return t.length > 0 ? t : "無題";
  });

  function buildPickerPaletteExportObject() {
    const setNameTrimmed = activePaletteSet.value.name.trim();
    const entries = pickerPalette.value.map((e) => {
      const base = {
        id: e.id,
        r: e.r,
        g: e.g,
        b: e.b,
        hex: e.hex,
        addedAt: e.addedAt,
      };
      const t = e.label?.trim();
      return t ? { ...base, label: t } : base;
    });
    return {
      exportedAt: new Date().toISOString(),
      kind: "pickerPalette" as const,
      ...(setNameTrimmed ? { name: setNameTrimmed } : {}),
      entries,
    };
  }

  function addPickedToPalette() {
    const p = picked.value;
    if (!p) return;
    if (pickerPalette.value.length >= PICKER_PALETTE_MAX) {
      showToast(`パレットは最大 ${PICKER_PALETTE_MAX} 色までです`);
      return;
    }
    const draft = paletteLabelDraft.value.trim().slice(0, PICKER_LABEL_MAX);
    const entry: PickerPaletteEntry = {
      id: crypto.randomUUID(),
      r: p.r,
      g: p.g,
      b: p.b,
      hex: p.hex,
      addedAt: new Date().toISOString(),
      ...(draft ? { label: draft } : {}),
    };
    pickerPalette.value = [entry, ...pickerPalette.value].slice(
      0,
      PICKER_PALETTE_MAX,
    );
    paletteLabelDraft.value = "";
    showToast("パレットに追加しました");
  }

  function setPaletteEntryLabel(id: string, raw: string) {
    const label = raw.trim().slice(0, PICKER_LABEL_MAX);
    pickerPalette.value = pickerPalette.value.map((e) => {
      if (e.id !== id) return e;
      if (!label) {
        return {
          id: e.id,
          r: e.r,
          g: e.g,
          b: e.b,
          hex: e.hex,
          addedAt: e.addedAt,
        };
      }
      return { ...e, label };
    });
  }

  async function removePaletteEntry(id: string) {
    const e = pickerPalette.value.find((x) => x.id === id);
    if (!e) return;
    const labelPart = e.label?.trim()
      ? `「${e.label.trim()}」`
      : "（名前なし）";
    const msg =
      `この色をパレットから削除しますか？\n${labelPart} ${e.hex}\n元に戻せません。`;
    if (!(await paletteDangerConfirm(msg))) return;
    pickerPalette.value = pickerPalette.value.filter((x) => x.id !== id);
  }

  async function clearPickerPalette() {
    if (pickerPalette.value.length === 0) return;
    const n = pickerPalette.value.length;
    const label = activePaletteTitleLabel.value;
    const msg =
      `「${label}」の色を ${n} 色すべて削除しますか？\n` +
      `カラーセット自体は残り、空のセットになります。元に戻せません。`;
    if (!(await paletteDangerConfirm(msg))) return;
    pickerPalette.value = [];
    showToast("このセットの色をすべて削除しました");
  }

  const pickerPaletteHexLines = computed(() =>
    pickerPalette.value.map((e) => e.hex).join("\n"),
  );

  const pickerPaletteLabeledLines = computed(() =>
    pickerPalette.value
      .map((e) => {
        const name = e.label?.trim();
        return name ? `${name} ${e.hex}` : e.hex;
      })
      .join("\n"),
  );

  async function copyPickerPaletteHexLines() {
    if (pickerPalette.value.length === 0) return;
    await copyText(pickerPaletteHexLines.value, "HEX 一覧");
  }

  async function copyPickerPaletteLabeledLines() {
    if (pickerPalette.value.length === 0) return;
    await copyText(pickerPaletteLabeledLines.value, "名前付き一覧");
  }

  async function copyPickerPaletteJson() {
    if (pickerPalette.value.length === 0) return;
    const text = JSON.stringify(buildPickerPaletteExportObject(), null, 2);
    await copyText(text, "パレット JSON");
  }

  async function savePickerPaletteJson() {
    if (pickerPalette.value.length === 0) return;
    const outPath = await save({
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: "spot-palette.json",
    });
    if (outPath === null) return;
    const text = JSON.stringify(buildPickerPaletteExportObject(), null, 2);
    try {
      await invoke("save_text_file", { path: outPath, contents: text });
      showToast("パレットを保存しました");
    } catch (e) {
      showToast(`保存に失敗: ${e}`);
    }
  }

  async function importPickerPaletteReplace() {
    try {
      const text = await readJsonTextFileDialog();
      if (text === null) return;
      let data: unknown;
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        showToast("JSON の形式が正しくありません");
        return;
      }
      const res = parsePickerPaletteExport(data, () => crypto.randomUUID());
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      pickerPalette.value = res.entries;
      if (res.setName !== undefined) {
        updateActiveSetName(res.setName);
      }
      showToast(`パレットを読み込みました（${res.entries.length} 色）`);
    } catch (e) {
      showToast(`読み込みに失敗: ${e}`);
    }
  }

  async function importPickerPaletteMerge() {
    try {
      const text = await readJsonTextFileDialog();
      if (text === null) return;
      let data: unknown;
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        showToast("JSON の形式が正しくありません");
        return;
      }
      const res = parsePickerPaletteExport(data, () => crypto.randomUUID());
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      pickerPalette.value = mergePickerPalettes(
        pickerPalette.value,
        res.entries,
      );
      showToast(`パレットを結合しました（計 ${pickerPalette.value.length} 色）`);
    } catch (e) {
      showToast(`読み込みに失敗: ${e}`);
    }
  }

  return {
    paletteState,
    paletteLabelDraft,
    activePaletteSet,
    pickerPalette,
    canDeletePaletteSet,
    activePaletteTitleLabel,
    setActivePaletteId,
    updateActiveSetName,
    addPaletteSet,
    duplicateActivePaletteSet,
    deleteActivePaletteSet,
    addPickedToPalette,
    setPaletteEntryLabel,
    removePaletteEntry,
    clearPickerPalette,
    copyPickerPaletteHexLines,
    copyPickerPaletteLabeledLines,
    copyPickerPaletteJson,
    savePickerPaletteJson,
    importPickerPaletteReplace,
    importPickerPaletteMerge,
  };
}
