# Image Data Analyzer（Tauri + Vue）

画像の解像度・EXIF・主要色・Open Color / Tailwind 近似・WCAG コントラストに加え、**PCCS 風トーン（非公式近似）**と**色相調和スコア（独自）**を表示します。

## PCCS 風トーンの閾値（実装メモ）

公式 PCCS ではありません。`src-tauri/src/theory.rs` の `pccs_style_tone` と同じ前提です。

| 条件（目安） | 意味 |
|--------------|------|
| `C* < 8` | 無彩色寄り |
| `8 ≤ C* < 18` | 低彩度帯の境界 |
| `18 ≤ C* < 28` | 中彩度寄り |
| `28 ≤ C* < 38` | やや高彩度 |
| `C* ≥ 38` | 高彩度寄り |

明度 L* は例として次のように分岐しています（他条件と組み合わせ）。

- `L* ≥ 76` かつ `C* < 18` → ペール寄り
- `L* ≥ 72` かつ `28 ≤ C* < 38` → ライト寄り
- `L* ≥ 62` かつ `C* ≥ 38` → ブライト寄り
- `40 ≤ L* ≤ 72` かつ `C* ≥ 38` → ビビッド寄り
- `38 ≤ L* ≤ 62` かつ `C* ≥ 28` → ストロング寄り
- `L* < 48` かつ `C* ≥ 38` → ディープ寄り
- `L* < 50` かつ `18 ≤ C* < 38` → ダール寄り
- `L* < 45` かつ `C* < 28` → ダーク寄り
- `52 ≤ L* ≤ 68` かつ `C* < 28` → ソフト寄り

## 開発

```bash
cd src-tauri && cargo test
pnpm install && pnpm run build
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
