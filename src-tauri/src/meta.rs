//! ファイル情報・EXIF・主要色

use image::RgbaImage;
use std::collections::HashMap;
use std::fs;
use std::io::BufReader;
use std::path::Path;

use exif::{In, Reader, Tag};

#[derive(Clone, Debug, Default, serde::Serialize)]
pub struct FileSnapshot {
    pub size_bytes: u64,
    pub modified_display: String,
}

pub fn format_file_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

pub fn load_file_snapshot(path: &Path) -> Option<FileSnapshot> {
    let m = fs::metadata(path).ok()?;
    let modified_display = m
        .modified()
        .ok()
        .and_then(|t| {
            let utc: chrono::DateTime<chrono::Utc> = t.into();
            Some(
                utc.with_timezone(&chrono::Local)
                    .format("%Y-%m-%d %H:%M")
                    .to_string(),
            )
        })
        .unwrap_or_else(|| "—".to_string());
    Some(FileSnapshot {
        size_bytes: m.len(),
        modified_display,
    })
}

pub fn read_exif_lines(path: &Path) -> Vec<(String, String)> {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };
    let mut buf = BufReader::new(file);
    let exif = match Reader::new().read_from_container(&mut buf) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let tags: &[(Tag, &str)] = &[
        (Tag::DateTimeOriginal, "撮影日時"),
        (Tag::DateTime, "日時"),
        (Tag::Make, "メーカー"),
        (Tag::Model, "機種"),
        (Tag::LensModel, "レンズ"),
        (Tag::Orientation, "向き"),
        (Tag::PhotographicSensitivity, "ISO"),
        (Tag::FNumber, "F値"),
        (Tag::ExposureTime, "露出時間"),
        (Tag::FocalLength, "焦点距離"),
        (Tag::ImageWidth, "EXIF幅"),
        (Tag::ImageLength, "EXIF高さ"),
    ];

    let mut out = Vec::new();
    for &(tag, label) in tags {
        if let Some(field) = exif.get_field(tag, In::PRIMARY) {
            let v = field.display_value().to_string();
            if !v.is_empty() {
                out.push((label.to_string(), v));
            }
        }
    }
    out
}

pub fn dominant_colors(rgba: &RgbaImage, max_colors: usize) -> Vec<(u8, u8, u8, f32)> {
    let (w, h) = rgba.dimensions();
    if w == 0 || h == 0 || max_colors == 0 {
        return Vec::new();
    }
    let pixels = (w as u64) * (h as u64);
    let step = (pixels / 60_000).max(1) as usize;

    let q = 28u8;
    let mut map: HashMap<(u8, u8, u8), u64> = HashMap::new();
    let mut sampled = 0u64;
    for y in (0..h).step_by(step) {
        for x in (0..w).step_by(step) {
            let p = rgba.get_pixel(x, y);
            if p[3] < 16 {
                continue;
            }
            let r = (p[0] / q) * q;
            let g = (p[1] / q) * q;
            let b = (p[2] / q) * q;
            *map.entry((r, g, b)).or_insert(0) += 1;
            sampled += 1;
        }
    }
    if sampled == 0 {
        return Vec::new();
    }
    let mut v: Vec<_> = map
        .into_iter()
        .map(|(rgb, c)| (rgb.0, rgb.1, rgb.2, 100.0 * c as f32 / sampled as f32))
        .collect();
    v.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));
    v.truncate(max_colors);
    v
}
