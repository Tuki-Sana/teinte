//! 色空間・色差・WCAG コントラスト

const XN: f64 = 95.047;
const YN: f64 = 100.0;
const ZN: f64 = 108.883;

const LAB_EPS: f64 = 216.0 / 24389.0;
const LAB_KAPPA: f64 = 24389.0 / 27.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Lab {
    pub l: f64,
    pub a: f64,
    pub b: f64,
}

#[inline]
pub fn srgb_u8_channel_to_linear(c: u8) -> f64 {
    let c = c as f64 / 255.0;
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

pub fn srgb_to_xyz(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let r = srgb_u8_channel_to_linear(r);
    let g = srgb_u8_channel_to_linear(g);
    let b = srgb_u8_channel_to_linear(b);
    let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
    let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
    let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
    (x * 100.0, y * 100.0, z * 100.0)
}

#[inline]
fn lab_f(t: f64) -> f64 {
    if t > LAB_EPS {
        t.cbrt()
    } else {
        (LAB_KAPPA * t + 16.0) / 116.0
    }
}

pub fn lab_from_srgb(r: u8, g: u8, b: u8) -> Lab {
    let (x, y, z) = srgb_to_xyz(r, g, b);
    let fx = lab_f(x / XN);
    let fy = lab_f(y / YN);
    let fz = lab_f(z / ZN);
    Lab {
        l: 116.0 * fy - 16.0,
        a: 500.0 * (fx - fy),
        b: 200.0 * (fy - fz),
    }
}

/// Lab → sRGB の逆変換。クレート内では未使用だが API として公開し、ユニットテストで検証する。
#[allow(dead_code)]
mod lab_inverse {
    use super::{Lab, LAB_EPS, LAB_KAPPA, XN, YN, ZN};

    #[inline]
    fn lab_f_inv(t: f64) -> f64 {
        let t3 = t * t * t;
        if t3 > LAB_EPS {
            t3
        } else {
            (116.0 * t - 16.0) / LAB_KAPPA
        }
    }

    fn xyz_from_lab(lab: &Lab) -> (f64, f64, f64) {
        let fy = (lab.l + 16.0) / 116.0;
        let fx = lab.a / 500.0 + fy;
        let fz = fy - lab.b / 200.0;
        (
            lab_f_inv(fx) * XN,
            lab_f_inv(fy) * YN,
            lab_f_inv(fz) * ZN,
        )
    }

    fn linear_srgb_from_xyz100(x: f64, y: f64, z: f64) -> (f64, f64, f64) {
        let xn = x / 100.0;
        let yn = y / 100.0;
        let zn = z / 100.0;
        let rl = 3.2404542 * xn - 1.5371385 * yn - 0.4985314 * zn;
        let gl = -0.9692660 * xn + 1.8760108 * yn + 0.0415560 * zn;
        let bl = 0.0556434 * xn - 0.2040259 * yn + 1.0572252 * zn;
        (rl, gl, bl)
    }

    #[inline]
    fn linear_channel_to_srgb_u8(c: f64) -> u8 {
        let c = c.clamp(0.0, 1.0);
        let companded = if c <= 0.0031308 {
            12.92 * c
        } else {
            1.055 * c.powf(1.0 / 2.4) - 0.055
        };
        (companded * 255.0).round().clamp(0.0, 255.0) as u8
    }

    pub fn srgb_u8_from_lab(lab: &Lab) -> (u8, u8, u8) {
        let (x, y, z) = xyz_from_lab(lab);
        let (rl, gl, bl) = linear_srgb_from_xyz100(x, y, z);
        (
            linear_channel_to_srgb_u8(rl),
            linear_channel_to_srgb_u8(gl),
            linear_channel_to_srgb_u8(bl),
        )
    }
}

#[allow(unused_imports)] // クレート外向け API。ユニットテストは `super::srgb_u8_from_lab` 経由。
pub use lab_inverse::srgb_u8_from_lab;

/// CIE76（Lab ユークリッド）。パレット照合は [`delta_e_2000`] を使用。比較・検証用に残す。
#[allow(dead_code)]
pub fn delta_e_76(a: Lab, b: Lab) -> f64 {
    let dl = a.l - b.l;
    let da = a.a - b.a;
    let db = a.b - b.b;
    (dl * dl + da * da + db * db).sqrt()
}

/// 色相角 h'（度、0〜360）。a'・b がともにほぼ 0 のときは 0（CIEDE2000 の慣例）。
fn hue_prime_deg(a_prime: f64, b: f64) -> f64 {
    if a_prime.abs() < 1e-12 && b.abs() < 1e-12 {
        return 0.0;
    }
    let mut h = b.atan2(a_prime).to_degrees();
    if h < 0.0 {
        h += 360.0;
    }
    h
}

/// CIEDE2000 色差（kL = kC = kH = 1）。パレット照合の知覚的近さに使用。
///
/// Sharma et al. の補足資料に沿った実装。極端な入力でも NaN を返さないようガードする。
pub fn delta_e_2000(a: Lab, b: Lab) -> f64 {
    const RAD: f64 = std::f64::consts::PI / 180.0;

    let l1 = a.l;
    let l2 = b.l;
    let a1 = a.a;
    let a2 = b.a;
    let b1 = a.b;
    let b2 = b.b;

    let c1 = (a1 * a1 + b1 * b1).sqrt();
    let c2 = (a2 * a2 + b2 * b2).sqrt();
    let c_bar = (c1 + c2) * 0.5;

    let g = 0.5 * (1.0 - (c_bar.powi(7) / (c_bar.powi(7) + 25.0_f64.powi(7))).sqrt());

    let a1p = (1.0 + g) * a1;
    let a2p = (1.0 + g) * a2;

    let c1p = (a1p * a1p + b1 * b1).sqrt();
    let c2p = (a2p * a2p + b2 * b2).sqrt();

    let h1p = hue_prime_deg(a1p, b1);
    let h2p = hue_prime_deg(a2p, b2);

    let dl_p = l2 - l1;
    let dc_p = c2p - c1p;

    let dh_p = if c1p * c2p < 1e-14 {
        0.0
    } else {
        let mut dh = h2p - h1p;
        if dh > 180.0 {
            dh -= 360.0;
        } else if dh < -180.0 {
            dh += 360.0;
        }
        2.0 * (c1p * c2p).sqrt() * ((dh * 0.5) * RAD).sin()
    };

    let l_bar = (l1 + l2) * 0.5;
    let c_bar_p = (c1p + c2p) * 0.5;

    let h_bar_p = if c1p * c2p < 1e-14 {
        h1p + h2p
    } else if (h1p - h2p).abs() <= 180.0 {
        (h1p + h2p) * 0.5
    } else if h1p + h2p < 360.0 {
        (h1p + h2p + 360.0) * 0.5
    } else {
        (h1p + h2p - 360.0) * 0.5
    };

    let t = 1.0
        - 0.17 * ((h_bar_p - 30.0) * RAD).cos()
        + 0.24 * ((2.0 * h_bar_p) * RAD).cos()
        + 0.32 * ((3.0 * h_bar_p + 6.0) * RAD).cos()
        - 0.20 * ((4.0 * h_bar_p - 63.0) * RAD).cos();

    let sl = 1.0 + (0.015 * (l_bar - 50.0).powi(2)) / (20.0 + (l_bar - 50.0).powi(2)).sqrt();
    let sc = 1.0 + 0.045 * c_bar_p;
    let sh = 1.0 + 0.015 * c_bar_p * t;

    let delta_theta = 30.0 * (-((h_bar_p - 275.0) / 25.0).powi(2)).exp();
    let rc = 2.0 * (c_bar_p.powi(7) / (c_bar_p.powi(7) + 25.0_f64.powi(7))).sqrt();
    let rt = -(rc * ((2.0 * delta_theta) * RAD).sin());

    let kl = 1.0;
    let kc = 1.0;
    let kh = 1.0;

    let v1 = dl_p / (kl * sl);
    let v2 = dc_p / (kc * sc);
    let v3 = dh_p / (kh * sh);

    (v1 * v1 + v2 * v2 + v3 * v3 + rt * v2 * v3).sqrt()
}

pub fn relative_luminance(r: u8, g: u8, b: u8) -> f64 {
    let r = srgb_u8_channel_to_linear(r);
    let g = srgb_u8_channel_to_linear(g);
    let b = srgb_u8_channel_to_linear(b);
    0.2126 * r + 0.7152 * g + 0.0722 * b
}

pub fn contrast_ratio(lum1: f64, lum2: f64) -> f64 {
    let l = lum1.max(lum2);
    let s = lum1.min(lum2);
    (l + 0.05) / (s + 0.05)
}

pub fn wcag_contrast_rgb(r1: u8, g1: u8, b1: u8, r2: u8, g2: u8, b2: u8) -> f64 {
    contrast_ratio(
        relative_luminance(r1, g1, b1),
        relative_luminance(r2, g2, b2),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wcag_black_white() {
        let r = wcag_contrast_rgb(0, 0, 0, 255, 255, 255);
        assert!((r - 21.0).abs() < 0.05);
    }

    #[test]
    fn lab_srgb_roundtrip_gray() {
        let (r, g, b) = (128u8, 128u8, 128u8);
        let lab = lab_from_srgb(r, g, b);
        let (r2, g2, b2) = srgb_u8_from_lab(&lab);
        assert!((r2 as i16 - r as i16).abs() <= 2);
        assert!((g2 as i16 - g as i16).abs() <= 2);
        assert!((b2 as i16 - b as i16).abs() <= 2);
    }

    #[test]
    fn ciede2000_identical_lab() {
        let a = Lab {
            l: 50.0,
            a: 12.0,
            b: -30.0,
        };
        assert!(delta_e_2000(a, a).abs() < 1e-9);
    }

    /// Sharma et al. 補足テーブル代表ペア（文献値は実装により小数第 4 位前後で揺れる）。
    #[test]
    fn ciede2000_sharma_sample_pair() {
        let a = Lab {
            l: 50.0,
            a: 2.6772,
            b: -79.7755,
        };
        let b = Lab {
            l: 50.0,
            a: 0.0,
            b: -82.7485,
        };
        let de = delta_e_2000(a, b);
        assert!((de - 2.0425).abs() < 0.02, "ΔE00={}", de);
    }

    #[test]
    fn delta_e_76_still_defined() {
        let a = Lab {
            l: 0.0,
            a: 0.0,
            b: 0.0,
        };
        let b = Lab {
            l: 10.0,
            a: 0.0,
            b: 0.0,
        };
        assert!((delta_e_76(a, b) - 10.0).abs() < 1e-9);
    }
}
