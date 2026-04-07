//! ポジティブ/ネガティブシェイプ分析
//!
//! ## モード
//!
//! ### `"edge"` — エッジ輪郭型（デフォルト）
//! Canny エッジ → 膨張で輪郭を閉じる → 四隅シードの連結成分で背景除去。
//! 輝度に依存しないため、黒背景・低コントラストの作品にも対応。
//!
//! ### `"color"` — 色差型
//! 四隅の平均色を背景色と推定し、ΔE2000 で前景/背景を分類。
//! 雲・空など背景色が均一で被写体と色差がはっきりした画像に精度が出る。

use std::collections::HashSet;
use std::io::Cursor;
use std::path::Path;

use base64::Engine;
use image::{DynamicImage, GenericImageView, GrayImage, ImageFormat, Luma, RgbImage};
use imageproc::distance_transform::Norm;
use imageproc::edges::canny;
use imageproc::morphology::{dilate, erode};
use imageproc::region_labelling::{connected_components, Connectivity};
use serde::Serialize;

use crate::color_theory::{delta_e_2000, lab_from_srgb, Lab};

// ---- 共通定数 ----

const SHAPE_MAX_SIDE: u32 = 700;

// ---- エッジモード定数 ----

const CANNY_LOW: f32 = 5.0;
const CANNY_HIGH: f32 = 15.0;
const DILATION_RADIUS: u8 = 12;
/// 後処理クロージング半径（小さくして境界を締める）
const POST_CLOSE_RADIUS: u8 = 3;

// ---- 色差モード定数 ----

/// 背景色のサンプリング領域（辺の何 % を隅として使うか）
const CORNER_RATIO: f32 = 0.07;
/// ΔE2000 のポジティブ判定閾値（この値を超えると前景扱い）
const COLOR_DIFF_THRESHOLD: f64 = 16.0;
/// 色差マップのオープニング半径（ノイズ除去）
const COLOR_OPEN_RADIUS: u8 = 3;
/// 色差マップのクロージング半径（内部の穴埋め）
const COLOR_CLOSE_RADIUS: u8 = 8;

// ---- DTO ----

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShapeAnalysisDto {
    pub positive_area_pct: f32,
    pub negative_area_pct: f32,
    /// エッジモード時のみ有効（色差モードでは 0）
    pub edge_density: f32,
    pub region_count: u32,
    pub complexity_ja: String,
    pub stark_base64: String,
    pub overlay_base64: String,
    pub proc_width: u32,
    pub proc_height: u32,
    /// 使用したモード（`"edge"` または `"color"`）
    pub mode: String,
}

// ---- 共通ユーティリティ ----

fn encode_gray_png(img: &GrayImage) -> Result<String, String> {
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

fn encode_rgb_png(img: &RgbImage) -> Result<String, String> {
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&buf))
}

fn build_stark(positive_map: &[bool], w: u32, h: u32) -> GrayImage {
    GrayImage::from_fn(w, h, |x, y| {
        Luma([if positive_map[(y * w + x) as usize] { 255u8 } else { 0u8 }])
    })
}

fn build_overlay(rgb: &RgbImage, positive_map: &[bool], w: u32, h: u32) -> RgbImage {
    const POS_R: f32 = 255.0;
    const POS_G: f32 = 107.0;
    const POS_B: f32 = 53.0;
    const POS_A: f32 = 0.50;
    const NEG_R: f32 = 74.0;
    const NEG_G: f32 = 144.0;
    const NEG_B: f32 = 217.0;
    const NEG_A: f32 = 0.38;

    RgbImage::from_fn(w, h, |x, y| {
        let orig = rgb.get_pixel(x, y);
        let (r, g, b) = (orig[0] as f32, orig[1] as f32, orig[2] as f32);
        let (cr, cg, cb, ca) = if positive_map[(y * w + x) as usize] {
            (POS_R, POS_G, POS_B, POS_A)
        } else {
            (NEG_R, NEG_G, NEG_B, NEG_A)
        };
        image::Rgb([
            (r * (1.0 - ca) + cr * ca).round().clamp(0.0, 255.0) as u8,
            (g * (1.0 - ca) + cg * ca).round().clamp(0.0, 255.0) as u8,
            (b * (1.0 - ca) + cb * ca).round().clamp(0.0, 255.0) as u8,
        ])
    })
}

fn map_to_stats(positive_map: &[bool], total: f32, edge_density: f32) -> (f32, f32, u32, String) {
    let pos_count = positive_map.iter().filter(|&&v| v).count() as f32;
    let positive_area_pct = 100.0 * pos_count / total;
    let negative_area_pct = 100.0 - positive_area_pct;
    let complexity_ja = if edge_density < 0.04 {
        "シンプル"
    } else if edge_density < 0.12 {
        "中程度"
    } else {
        "複雑"
    }
    .to_string();
    (positive_area_pct, negative_area_pct, 0, complexity_ja)
}

fn count_regions(stark: &GrayImage) -> u32 {
    connected_components(stark, Connectivity::Eight, Luma([0u8]))
        .pixels()
        .map(|p| p[0])
        .max()
        .unwrap_or(0)
}

// ---- エッジモード ----

fn positive_map_edge(gray: &GrayImage, pw: u32, ph: u32) -> (Vec<bool>, f32) {
    let edges: GrayImage = canny(gray, CANNY_LOW, CANNY_HIGH);

    let total = (pw * ph) as f32;
    let edge_count = edges.pixels().filter(|p| p[0] > 0).count() as f32;
    let edge_density = edge_count / total;

    let dilated = dilate(&edges, Norm::LInf, DILATION_RADIUS);
    let open_space = GrayImage::from_fn(pw, ph, |x, y| {
        Luma([if dilated.get_pixel(x, y)[0] > 0 { 0u8 } else { 255u8 }])
    });
    let labeled = connected_components(&open_space, Connectivity::Four, Luma([0u8]));

    let corner_labels: HashSet<u32> = [
        labeled.get_pixel(0, 0)[0],
        labeled.get_pixel(pw - 1, 0)[0],
        labeled.get_pixel(0, ph - 1)[0],
        labeled.get_pixel(pw - 1, ph - 1)[0],
    ]
    .iter()
    .copied()
    .filter(|&l| l != 0)
    .collect();

    let raw: Vec<bool> = (0..ph)
        .flat_map(|y| (0..pw).map(move |x| (x, y)))
        .map(|(x, y)| {
            let l = labeled.get_pixel(x, y)[0];
            l != 0 && !corner_labels.contains(&l)
        })
        .collect();

    // 後処理クロージング（小さめに）
    let raw_img = build_stark(&raw, pw, ph);
    let closed = erode(
        &dilate(&raw_img, Norm::LInf, POST_CLOSE_RADIUS),
        Norm::LInf,
        POST_CLOSE_RADIUS,
    );
    let map: Vec<bool> = closed.pixels().map(|p| p[0] > 0).collect();
    (map, edge_density)
}

// ---- 色差モード ----

fn sample_background_lab(proc: &DynamicImage, pw: u32, ph: u32) -> Lab {
    let rgba = proc.to_rgba8();
    let corner_px = ((pw.min(ph) as f32 * CORNER_RATIO) as u32).max(4);

    let offsets = [
        (0u32, 0u32),
        (pw.saturating_sub(corner_px), 0),
        (0, ph.saturating_sub(corner_px)),
        (pw.saturating_sub(corner_px), ph.saturating_sub(corner_px)),
    ];

    let mut sum_l = 0f64;
    let mut sum_a = 0f64;
    let mut sum_b = 0f64;
    let mut n = 0u64;

    for (cx, cy) in offsets {
        for y in cy..(cy + corner_px).min(ph) {
            for x in cx..(cx + corner_px).min(pw) {
                let p = rgba.get_pixel(x, y);
                if p[3] >= 16 {
                    let lab = lab_from_srgb(p[0], p[1], p[2]);
                    sum_l += lab.l;
                    sum_a += lab.a;
                    sum_b += lab.b;
                    n += 1;
                }
            }
        }
    }

    if n == 0 {
        return Lab { l: 50.0, a: 0.0, b: 0.0 };
    }
    let nf = n as f64;
    Lab { l: sum_l / nf, a: sum_a / nf, b: sum_b / nf }
}

fn positive_map_color(proc: &DynamicImage, pw: u32, ph: u32) -> Vec<bool> {
    let bg = sample_background_lab(proc, pw, ph);
    let rgb = proc.to_rgb8();

    // 各ピクセルの ΔE2000 で粗分類
    let raw_img = GrayImage::from_fn(pw, ph, |x, y| {
        let p = rgb.get_pixel(x, y);
        let lab = lab_from_srgb(p[0], p[1], p[2]);
        let de = delta_e_2000(lab, bg);
        Luma([if de > COLOR_DIFF_THRESHOLD { 255u8 } else { 0u8 }])
    });

    // オープニング（小ノイズ除去）→ クロージング（穴埋め）
    let opened = dilate(
        &erode(&raw_img, Norm::LInf, COLOR_OPEN_RADIUS),
        Norm::LInf,
        COLOR_OPEN_RADIUS,
    );
    let closed = erode(
        &dilate(&opened, Norm::LInf, COLOR_CLOSE_RADIUS),
        Norm::LInf,
        COLOR_CLOSE_RADIUS,
    );

    closed.pixels().map(|p| p[0] > 0).collect()
}

// ---- エントリポイント ----

pub fn analyze_shape_path(path_str: &str, mode: &str) -> Result<ShapeAnalysisDto, String> {
    let path = Path::new(path_str);
    let img = image::open(path).map_err(|e| e.to_string())?;

    let proc = if img.dimensions().0.max(img.dimensions().1) > SHAPE_MAX_SIDE {
        img.thumbnail(SHAPE_MAX_SIDE, SHAPE_MAX_SIDE)
    } else {
        img.clone()
    };
    let (pw, ph) = proc.dimensions();
    let total = (pw * ph) as f32;

    let (positive_map, edge_density) = if mode == "color" {
        (positive_map_color(&proc, pw, ph), 0.0f32)
    } else {
        let gray = proc.to_luma8();
        // エッジ密度はエッジモードの場合のみ意味がある
        positive_map_edge(&gray, pw, ph)
    };

    let (positive_area_pct, negative_area_pct, _, complexity_ja) =
        map_to_stats(&positive_map, total, edge_density);

    let stark_img = build_stark(&positive_map, pw, ph);
    let region_count = count_regions(&stark_img);

    let stark_base64 = encode_gray_png(&stark_img)?;
    let rgb = proc.to_rgb8();
    let overlay_base64 = encode_rgb_png(&build_overlay(&rgb, &positive_map, pw, ph))?;

    Ok(ShapeAnalysisDto {
        positive_area_pct,
        negative_area_pct,
        edge_density,
        region_count,
        complexity_ja,
        stark_base64,
        overlay_base64,
        proc_width: pw,
        proc_height: ph,
        mode: mode.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn save_test_png(img: &RgbaImage) -> std::path::PathBuf {
        let path = std::env::temp_dir().join("shape_test.png");
        img.save(&path).expect("save test png");
        path
    }

    #[test]
    fn edge_mode_returns_valid_dto() {
        let mut img = RgbaImage::new(80, 80);
        for y in 0..80u32 {
            for x in 0..80u32 {
                let px = if x >= 20 && x < 60 && y >= 20 && y < 60 {
                    Rgba([220, 220, 220, 255])
                } else {
                    Rgba([30, 30, 30, 255])
                };
                img.put_pixel(x, y, px);
            }
        }
        let path = save_test_png(&img);
        let dto = analyze_shape_path(path.to_str().unwrap(), "edge").expect("edge mode");
        assert!((dto.positive_area_pct + dto.negative_area_pct - 100.0).abs() < 0.1);
        assert!(!dto.stark_base64.is_empty());
        assert_eq!(dto.mode, "edge");
    }

    #[test]
    fn edge_mode_solid_color_is_all_negative() {
        let img = RgbaImage::from_pixel(60, 60, Rgba([100u8, 149, 237, 255]));
        let path = save_test_png(&img);
        let dto = analyze_shape_path(path.to_str().unwrap(), "edge").expect("edge solid");
        assert!(dto.positive_area_pct < 5.0, "got {}", dto.positive_area_pct);
    }

    #[test]
    fn color_mode_detects_white_rect_on_blue() {
        // 青背景に白い四角（雲イメージ）→ 白領域がポジティブになること
        let mut img = RgbaImage::new(100, 100);
        for y in 0..100u32 {
            for x in 0..100u32 {
                let px = if x >= 30 && x < 70 && y >= 30 && y < 70 {
                    Rgba([240, 245, 255, 255]) // 白
                } else {
                    Rgba([80, 160, 220, 255]) // 青空
                };
                img.put_pixel(x, y, px);
            }
        }
        let path = save_test_png(&img);
        let dto = analyze_shape_path(path.to_str().unwrap(), "color").expect("color mode");
        assert!(
            dto.positive_area_pct > 5.0,
            "白領域がポジティブとして検出されるはず: {}",
            dto.positive_area_pct
        );
        assert_eq!(dto.mode, "color");
    }
}
