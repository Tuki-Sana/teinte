import { describe, expect, it } from "vitest";
import { PICKER_PALETTE_MAX } from "./pickerPaletteStorage";
import {
  mergePickerPalettes,
  normalizePickerImportEntry,
  parsePickerPaletteExport,
} from "./pickerPaletteImport";

describe("parsePickerPaletteExport", () => {
  const id = () => "test-id";

  it("accepts kind: pickerPalette", () => {
    const res = parsePickerPaletteExport(
      {
        kind: "pickerPalette",
        entries: [
          {
            id: "a",
            r: 255,
            g: 128,
            b: 0,
            hex: "#FF8000",
            addedAt: "2020-01-01T00:00:00.000Z",
          },
        ],
      },
      id,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.entries).toHaveLength(1);
      expect(res.entries[0].hex).toBe("#FF8000");
    }
  });

  it("reads optional set name from object root", () => {
    const res = parsePickerPaletteExport(
      {
        kind: "pickerPalette",
        name: "  キャラA  ",
        entries: [
          {
            id: "a",
            r: 0,
            g: 0,
            b: 0,
            hex: "#000000",
            addedAt: "t",
          },
        ],
      },
      id,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.setName).toBe("キャラA");
    }
  });

  it("accepts raw array", () => {
    const res = parsePickerPaletteExport(
      [
        {
          r: 10,
          g: 20,
          b: 30,
          hex: "#0A141E",
          addedAt: "x",
        },
      ],
      id,
    );
    expect(res.ok).toBe(true);
  });

  it("accepts object with entries only (no kind)", () => {
    const res = parsePickerPaletteExport(
      {
        entries: [
          {
            id: "x",
            r: 0,
            g: 255,
            b: 0,
            hex: "#00FF00",
            addedAt: "t",
          },
        ],
      },
      id,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.entries[0].hex).toBe("#00FF00");
  });

  it("assigns id when missing", () => {
    const res = parsePickerPaletteExport(
      {
        kind: "pickerPalette",
        entries: [{ r: 0, g: 0, b: 0, hex: "#000000", addedAt: "t" }],
      },
      () => "new-id",
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.entries[0].id).toBe("new-id");
  });

  it("rejects empty entries", () => {
    const res = parsePickerPaletteExport({ kind: "pickerPalette", entries: [] }, id);
    expect(res.ok).toBe(false);
  });
});

describe("normalizePickerImportEntry", () => {
  it("clamps rgb", () => {
    const e = normalizePickerImportEntry(
      { r: 300, g: -5, b: 128, hex: "#abc", addedAt: "t" },
      () => "i",
    );
    expect(e).not.toBeNull();
    expect(e!.r).toBe(255);
    expect(e!.g).toBe(0);
    expect(e!.b).toBe(128);
  });
});

describe("mergePickerPalettes", () => {
  it("prepends imported and caps", () => {
    const a = [
      {
        id: "1",
        r: 1,
        g: 1,
        b: 1,
        hex: "#010101",
        addedAt: "t",
      },
    ];
    const b = [
      {
        id: "2",
        r: 2,
        g: 2,
        b: 2,
        hex: "#020202",
        addedAt: "t",
      },
    ];
    const m = mergePickerPalettes(a, b);
    expect(m[0].id).toBe("2");
    expect(m[1].id).toBe("1");
  });

  it(`truncates to ${PICKER_PALETTE_MAX} entries`, () => {
    const mk = (i: number) => ({
      id: `c${i}`,
      r: i % 256,
      g: 0,
      b: 0,
      hex: "#000000",
      addedAt: "t",
    });
    const current = Array.from({ length: 20 }, (_, i) => mk(i));
    const imported = Array.from({ length: PICKER_PALETTE_MAX + 5 }, (_, i) =>
      mk(100 + i),
    );
    const m = mergePickerPalettes(current, imported);
    expect(m).toHaveLength(PICKER_PALETTE_MAX);
    expect(m[0].id).toBe("c100");
    expect(m[PICKER_PALETTE_MAX - 1].id).toBe(
      `c${100 + PICKER_PALETTE_MAX - 1}`,
    );
  });
});
