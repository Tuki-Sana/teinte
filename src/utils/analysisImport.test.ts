import { describe, expect, it } from "vitest";
import { parseAnalysisExportJson } from "./analysisImport";

describe("parseAnalysisExportJson", () => {
  it("parses minimal export-like object", () => {
    const text = JSON.stringify({
      schemaVersion: 4,
      path: "/tmp/x.png",
      width: 100,
      height: 100,
      exif: [],
      previewJpegBase64Omitted: true,
      previewWidth: 100,
      previewHeight: 100,
      previewBgDark: false,
      dominants: [
        { r: 255, g: 0, b: 0, pct: 50, hex: "#FF0000" },
      ],
      openColorMatches: [],
      tailwindMatches: [],
      wcagDominantPair: null,
      theory: {
        disclaimerJa: "d",
        outlineMappingJa: [],
        dominantDetails: [],
        dominantHueSummaryJa: null,
      },
      harmonyScores: [],
      gist: { lines: [], gistJa: "" },
    });
    const res = parseAnalysisExportJson(text);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.analysis.dominants).toHaveLength(1);
      expect(res.analysis.previewJpegBase64).toBe("");
    }
  });

  it("rejects empty object", () => {
    const res = parseAnalysisExportJson("{}");
    expect(res.ok).toBe(false);
  });

  it("rejects invalid json", () => {
    const res = parseAnalysisExportJson("not-json");
    expect(res.ok).toBe(false);
  });
});
