//! 支配色の色相から、代表的な調和パターンへの「当てはまり度」スコア（0〜1 目安、独自定義）。

use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarmonyScoreDto {
    pub id: String,
    pub label_ja: String,
    pub score: f64,
}

fn hue_circ_dist_deg(a: f64, b: f64) -> f64 {
    let mut d = (a - b).abs() % 360.0;
    if d > 180.0 {
        d = 360.0 - d;
    }
    d
}

/// (hue_deg, weight), weight は正
fn score_template(weighted: &[(f64, f64)], ideal_rels: &[f64], sigma_deg: f64) -> f64 {
    if weighted.is_empty() || ideal_rels.is_empty() {
        return 0.0;
    }
    let w_sum: f64 = weighted.iter().map(|(_, w)| w).sum();
    if w_sum < 1e-9 {
        return 0.0;
    }

    let mut best_global = 0.0f64;
    // アンカーを 15° 刻みで探索（相対テンプレートの向きを合わせる）
    for k in 0..24 {
        let anchor = k as f64 * 15.0;
        let ideals: Vec<f64> = ideal_rels
            .iter()
            .map(|r| (anchor + r).rem_euclid(360.0))
            .collect();

        let mut acc = 0.0f64;
        for &(h, w) in weighted {
            let mut best = f64::INFINITY;
            for &t in &ideals {
                best = best.min(hue_circ_dist_deg(h, t));
            }
            acc += w * (-(best * best) / (2.0 * sigma_deg * sigma_deg)).exp();
        }
        best_global = best_global.max(acc / w_sum);
    }
    best_global
}

/// 類似色: すべての色相が狭い範囲に入っている
fn score_analogous(weighted: &[(f64, f64)]) -> f64 {
    if weighted.len() < 2 {
        return 0.0;
    }
    let hues: Vec<f64> = weighted.iter().map(|(h, _)| *h).collect();
    let mut max_span = 0.0f64;
    for i in 0..hues.len() {
        for j in i + 1..hues.len() {
            max_span = max_span.max(hue_circ_dist_deg(hues[i], hues[j]));
        }
    }
    if max_span <= 28.0 {
        0.95
    } else if max_span <= 45.0 {
        0.75
    } else if max_span <= 60.0 {
        0.5
    } else {
        0.2
    }
}

pub fn harmony_scores(weighted_hues: &[(f64, f64)]) -> Vec<HarmonyScoreDto> {
    let sigma = 22.0_f64;
    let mut out = vec![
        HarmonyScoreDto {
            id: "analogous".to_string(),
            label_ja: "類似色（色相が近い）".to_string(),
            score: score_analogous(weighted_hues),
        },
        HarmonyScoreDto {
            id: "complementary".to_string(),
            label_ja: "補色（約 180° 対比）".to_string(),
            score: score_template(weighted_hues, &[0.0, 180.0], sigma),
        },
        HarmonyScoreDto {
            id: "split_complementary".to_string(),
            label_ja: "分割補色（0° / 150° / 210° 付近）".to_string(),
            score: score_template(weighted_hues, &[0.0, 150.0, 210.0], sigma),
        },
        HarmonyScoreDto {
            id: "triadic".to_string(),
            label_ja: "トライアド（約 120° 間隔）".to_string(),
            score: score_template(weighted_hues, &[0.0, 120.0, 240.0], sigma),
        },
        HarmonyScoreDto {
            id: "tetrad".to_string(),
            label_ja: "テトラード（矩形・60°/180°/240° 系）".to_string(),
            score: score_template(weighted_hues, &[0.0, 60.0, 180.0, 240.0], sigma * 1.1),
        },
    ];

    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    for s in &mut out {
        s.score = (s.score * 1000.0).round() / 1000.0;
    }
    out
}
