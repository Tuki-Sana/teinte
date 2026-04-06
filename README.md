# Image Data Analyzer（Tauri + Vue）

画像の解像度・EXIF・主要色・Open Color / Tailwind 近似・WCAG コントラストに加え、**PCCS 風トーン（非公式近似）**と**色相調和スコア（独自）**を表示します。スポイトで拾った色は**複数のカラーセット**に分けて名前付きで保存でき、**JSON の読み込み・書き出し**でバックアップや他ツール連携ができます。

## 主な機能

- 画像を開いてプレビュー上をクリックし、その位置の色（HEX / RGB / HSL）を取得
- 支配色・Open Color / Tailwind 近似・WCAG 支配色ペア・色彩理論ブロック・調和スコア・要約（gist）
- **スポイトパレット**: 色ごとのメモ名、最大 48 色／セット
- **複数カラーセット**: 切り替え・セット名・新規／複製／セット削除（最低 1 セットは維持）
- **JSON**: 分析結果・パレットのコピー／ファイル保存、およびファイルからの読み込み
- **PDF 書き出し**（画面構成をベースにしたレポート）
- **用語集**（ヘルプメニュー）

## スポイトパレットとカラーセット

- 各セットは最大 **48 色**。セットごとに **名前**（任意）を付けられます。
- **新規**で空のセットを追加、**複製**で現在のセットをコピー（色の id は新規発行）、**セット削除**でカラーセットごと削除（確認ダイアログあり）。
- **色をすべて削除**は、**いま選んでいるセットの色だけ**を空にします。セット自体は残ります（確認ダイアログあり）。
- 各チップの **×** で 1 色削除（確認ダイアログあり）。
- 名前が **`パレット 1` のような連番形式**（`パレット` + 半角スペース + 数字）のセットだけ、**カラーセット削除後**に配列順で `パレット 1`, `パレット 2`, … と**自動で振り直し**ます。`肌パレット` など任意名は変わりません。

## JSON の読み込み・書き出し

| 操作 | 内容 |
|------|------|
| **パレット JSON（置換）** | 現在のカラーセットの色一覧を、ファイルの内容で**差し替え**。JSON に `name` があればセット名も更新。 |
| **パレット JSON（現在と結合）** | 読み込んだ色を**先頭**に足し、上限 48 色で切り詰め。 |
| **分析 JSON** | エクスポート形式に近い JSON から分析状態を復元（プレビュー画像 base64 は省略可）。 |

パレット JSON は `kind: "pickerPalette"` と `entries` 配列、または `entries` のみのオブジェクト／配列にも対応します。書き出し時、セット名が空でなければルートに `name` が付きます。

**メニュー**: ファイル → 読み込み。画像を開いていないときのホーム画面からも同様の読み込みボタンがあります。

## データの保存場所

スポイトパレットはブラウザの **LocalStorage**（キー `imageMetadataAnalyzer.pickerPalette`）に、次の形で保存されます。

- **v1**: `schemaVersion`, `activePaletteId`, `palettes[]`（各 `id`, `name`, `entries`, `updatedAt`）
- 以前の **エントリ配列だけ**の保存形式は、起動時に **1 セットに包んで**自動移行します。

アプリやブラウザのデータ消去で失われることがあるため、重要なパレットは **JSON で書き出し**してください。

## 確認ダイアログについて

macOS の WebView では **`window.confirm` が表示されない**ことがあるため、破壊的操作の確認には **`@tauri-apps/plugin-dialog` の `confirm`** を使っています。ブラウザ単体で `pnpm dev` したときは `window.confirm` にフォールバックします。

## バージョンとリリース

- アプリの版は **`package.json`**・**`src-tauri/tauri.conf.json`**・**`src-tauri/Cargo.toml`** の `version` を **同じ値**に揃えています（現在 **0.2.0**）。
- 変更内容の一覧は **`CHANGELOG.md`**。
- リリースでタグを付ける例: `git tag -a v0.2.0 -m "0.2.0"` のあと `git push origin v0.2.0`（リモート名は環境に合わせてください）。

## 技術構成（概要）

| 領域 | 技術 |
|------|------|
| UI | Vue 3, TypeScript, Vite |
| デスクトップシェル | Tauri 2（WebView + Rust） |
| 画像解析・配色ロジック | Rust（`src-tauri`） |
| 単体テスト | Vitest（フロントのユーティリティ）、`cargo test`（Rust） |

## CI（GitHub Actions）

`main` ブランチへの **push** と **pull_request** で [`.github/workflows/ci.yml`](.github/workflows/ci.yml) が動きます。

1. **Ubuntu**: `pnpm install` → `pnpm run test` → `pnpm run build` → `src-tauri` で `cargo test`
2. **Windows**（上記成功後）: フロントビルドのあと `pnpm exec tauri build`（インストーラ／実行ファイルの生成確認）

バッジを README に載せる場合は、リポジトリを GitHub に公開したうえで Actions の URL に合わせて追加してください。

## 開発

```bash
# フロント＋Rust の開発サーバ（推奨）
pnpm tauri dev
```

```bash
# ユニットテスト（Vitest）
pnpm run test

# フロントの型チェックと本番ビルド
pnpm run build

# Rust のテスト
cd src-tauri && cargo test
```

Tauri のビルド例: `pnpm tauri build`

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

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
