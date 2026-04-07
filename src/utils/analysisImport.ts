import type {
  Analysis,
  AnalysisGist,
  Dominant,
  DominantTheory,
  ExifLine,
  HarmonyScore,
  PaletteMatch,
  TheoryBlock,
  WcagDominantPair,
} from "../types/analysis";

function asFiniteNum(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function parseExifLine(x: unknown): ExifLine | null {
  if (x === null || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.label !== "string" || typeof o.value !== "string") return null;
  return { label: o.label, value: o.value };
}

function parseDominant(x: unknown): Dominant | null {
  if (x === null || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.hex !== "string") return null;
  return {
    r: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.r, 0)))),
    g: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.g, 0)))),
    b: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.b, 0)))),
    pct: asFiniteNum(o.pct, 0),
    hex: o.hex,
  };
}

function parsePaletteMatch(x: unknown): PaletteMatch | null {
  if (x === null || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.swatchName !== "string" || typeof o.swHex !== "string") return null;
  return {
    domR: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.domR, 0)))),
    domG: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.domG, 0)))),
    domB: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.domB, 0)))),
    pct: asFiniteNum(o.pct, 0),
    swatchName: o.swatchName,
    swR: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.swR, 0)))),
    swG: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.swG, 0)))),
    swB: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.swB, 0)))),
    swHex: o.swHex,
    deltaE: asFiniteNum(o.deltaE, 0),
  };
}

function parseWcag(x: unknown): WcagDominantPair | null {
  if (x === null || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  return {
    r1: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.r1, 0)))),
    g1: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.g1, 0)))),
    b1: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.b1, 0)))),
    r2: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.r2, 0)))),
    g2: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.g2, 0)))),
    b2: Math.max(0, Math.min(255, Math.round(asFiniteNum(o.b2, 0)))),
    contrastRatio: asFiniteNum(o.contrastRatio, 1),
  };
}

function parseDominantTheory(x: unknown): DominantTheory | null {
  if (x === null || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.hex !== "string") return null;
  return {
    hex: o.hex,
    lStar: asFiniteNum(o.lStar, 0),
    cStar: asFiniteNum(o.cStar, 0),
    hDeg: asFiniteNum(o.hDeg, 0),
    hueRegionJa: asStr(o.hueRegionJa, ""),
    pccsStyleToneJa: asStr(o.pccsStyleToneJa, ""),
    pccsStyleToneId: asStr(o.pccsStyleToneId, ""),
  };
}

const EMPTY_THEORY: TheoryBlock = {
  disclaimerJa: "読み込んだ JSON に色彩理論ブロックが含まれていません。",
  outlineMappingJa: [],
  dominantDetails: [],
  dominantHueSummaryJa: null,
};

function parseTheory(x: unknown): TheoryBlock {
  if (x === null || typeof x !== "object") return EMPTY_THEORY;
  const o = x as Record<string, unknown>;
  const outline = Array.isArray(o.outlineMappingJa)
    ? o.outlineMappingJa.filter((l): l is string => typeof l === "string")
    : [];
  const details = Array.isArray(o.dominantDetails)
    ? (o.dominantDetails.map(parseDominantTheory).filter(Boolean) as DominantTheory[])
    : [];
  const summary =
    o.dominantHueSummaryJa === null || o.dominantHueSummaryJa === undefined
      ? null
      : typeof o.dominantHueSummaryJa === "string"
        ? o.dominantHueSummaryJa
        : null;
  return {
    disclaimerJa: asStr(o.disclaimerJa, EMPTY_THEORY.disclaimerJa),
    outlineMappingJa: outline,
    dominantDetails: details,
    dominantHueSummaryJa: summary,
  };
}

function parseHarmonyScore(x: unknown): HarmonyScore | null {
  if (x === null || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.labelJa !== "string") return null;
  return {
    id: o.id,
    labelJa: o.labelJa,
    score: asFiniteNum(o.score, 0),
  };
}

const EMPTY_GIST: AnalysisGist = {
  lines: [],
  gistJa: "",
};

function parseGist(x: unknown): AnalysisGist {
  if (x === null || typeof x !== "object") return EMPTY_GIST;
  const o = x as Record<string, unknown>;
  const lines = Array.isArray(o.lines)
    ? o.lines
        .map((row) => {
          if (row === null || typeof row !== "object") return null;
          const r = row as Record<string, unknown>;
          if (typeof r.text !== "string" || typeof r.role !== "string") return null;
          const role = r.role;
          if (
            role !== "mono" &&
            role !== "label" &&
            role !== "body" &&
            role !== "foot"
          ) {
            return null;
          }
          return { text: r.text, role };
        })
        .filter(Boolean)
    : [];
  return {
    lines: lines as AnalysisGist["lines"],
    gistJa: typeof o.gistJa === "string" ? o.gistJa : "",
  };
}

export type ParseAnalysisResult =
  | { ok: true; analysis: Analysis }
  | { ok: false; error: string };

/** アプリの「エクスポート用 JSON」（プレビュー省略可）から Analysis を復元する */
export function parseAnalysisExportJson(text: string): ParseAnalysisResult {
  let root: unknown;
  try {
    root = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "JSON の解析に失敗しました" };
  }
  if (root === null || typeof root !== "object") {
    return { ok: false, error: "ルートがオブジェクトではありません" };
  }
  const o = root as Record<string, unknown>;
  const path = asStr(o.path, "");
  const width = Math.max(0, Math.round(asFiniteNum(o.width, 0)));
  const height = Math.max(0, Math.round(asFiniteNum(o.height, 0)));

  const exif = Array.isArray(o.exif)
    ? (o.exif.map(parseExifLine).filter(Boolean) as ExifLine[])
    : [];
  const dominants = Array.isArray(o.dominants)
    ? (o.dominants.map(parseDominant).filter(Boolean) as Dominant[])
    : [];
  const openColorMatches = Array.isArray(o.openColorMatches)
    ? (o.openColorMatches.map(parsePaletteMatch).filter(Boolean) as PaletteMatch[])
    : [];
  const tailwindMatches = Array.isArray(o.tailwindMatches)
    ? (o.tailwindMatches.map(parsePaletteMatch).filter(Boolean) as PaletteMatch[])
    : [];

  if (dominants.length === 0) {
    return { ok: false, error: "支配色データがありません" };
  }
  if (width <= 0 || height <= 0) {
    return { ok: false, error: "画像の幅・高さが不正です（width/height が必要です）" };
  }

  let wcag: WcagDominantPair | null = null;
  if (o.wcagDominantPair !== undefined && o.wcagDominantPair !== null) {
    wcag = parseWcag(o.wcagDominantPair);
  }

  const previewB64 =
    typeof o.previewJpegBase64 === "string" ? o.previewJpegBase64 : "";
  const pw = Math.max(
    0,
    Math.round(asFiniteNum(o.previewWidth, width || 1)),
  );
  const ph = Math.max(
    0,
    Math.round(asFiniteNum(o.previewHeight, height || 1)),
  );

  const analysis: Analysis = {
    schemaVersion: Math.max(0, Math.round(asFiniteNum(o.schemaVersion, 1))),
    path: path || "(JSON から読み込み・元パス不明)",
    width: width || pw,
    height: height || ph,
    fileSizeBytes:
      o.fileSizeBytes === null || o.fileSizeBytes === undefined
        ? null
        : Math.round(asFiniteNum(o.fileSizeBytes, 0)),
    fileSizeDisplay:
      typeof o.fileSizeDisplay === "string" ? o.fileSizeDisplay : null,
    modifiedDisplay:
      typeof o.modifiedDisplay === "string" ? o.modifiedDisplay : null,
    exif,
    previewJpegBase64: previewB64,
    previewWidth: pw,
    previewHeight: ph,
    previewBgDark: asBool(o.previewBgDark, false),
    dominants,
    openColorMatches,
    tailwindMatches,
    wcagDominantPair: wcag,
    theory: parseTheory(o.theory),
    harmonyScores: Array.isArray(o.harmonyScores)
      ? (o.harmonyScores.map(parseHarmonyScore).filter(Boolean) as HarmonyScore[])
      : [],
    gist: parseGist(o.gist),
  };

  return { ok: true, analysis };
}
