# Image Data Analyzer（Tauri + Vue）

ブラウザにアップロードせず、手元の画像だけで色やメタデータをざっと調べたいとき用のデスクトップアプリです。解像度・EXIF・支配色、Open Color / Tailwind への近似、WCAG のコントラスト、あわせて **PCCS 風のトーン（非公式の近似）** と **色相の調和スコア（独自の簡易指標）** まで一度に見られます。

スポイトで拾った色は **名前付きで最大 48 色／セット**、セットは複数持てます。**JSON の読み書き**でバックアップしたり、別ツールとデータを行き来させたりできます。

## できること（ざっくり）

- プレビューをクリックして、その位置の色（HEX / RGB / HSL）
- 支配色・近似色・WCAG 支配色ペア・色彩理論ブロック・調和スコア・要約（gist）
- **スポイトパレット**（メモ名、48 色上限、セット切り替え・複製・削除）
- **分析 / パレットの JSON** コピー・ファイル保存・ファイルからの読み込み
- **PDF 書き出し**（画面に近いレイアウトのレポート）
- **用語集**（ヘルプメニュー）

## スポイトパレットとカラーセット

- セットごとに名前（任意）。**新規**で空セット、**複製**でコピー（色の id は新規）、**セット削除**は確認付き。
- **色をすべて削除**は、今選んでいるセットの中身だけ空にする。セット自体は残る（確認あり）。
- チップの **×** で 1 色削除（確認あり）。
- 名前が `パレット 1` のように **`パレット` + 半角スペース + 数字**だけのセットは、削除のあと配列順で `パレット 1`, `2`, … に**振り直し**（`肌パレット` など任意名はそのまま）。

## JSON まわり

| 操作 | 内容 |
|------|------|
| **パレット JSON（置換）** | 今のセットの色をファイル内容で差し替え。`name` があればセット名も更新。 |
| **パレット JSON（結合）** | 読み込んだ色を先頭に足して、48 色で切り詰め。 |
| **分析 JSON** | エクスポート形式に近い JSON から分析状態を復元（プレビュー画像の base64 は省略可）。 |

パレット JSON は `kind: "pickerPalette"` と `entries`、または `entries` だけの形にも対応。書き出し時、セット名が空でなければルートに `name` が付きます。

**ファイル → 読み込み**。画像を開いていないホーム画面からも同じ操作ができます。

## データの保存場所

スポイトパレットは **LocalStorage**（キー `imageMetadataAnalyzer.pickerPalette`）。

- **v1**: `schemaVersion`, `activePaletteId`, `palettes[]`（各 `id`, `name`, `entries`, `updatedAt`）
- 昔の「エントリ配列だけ」の形式は、起動時に 1 セットに包んで移行します。

アプリやブラウザのデータ消去で消えるので、大事なパレットは **JSON で書き出し**を。

## 確認ダイアログ

macOS の WebView では **`window.confirm` が出ない**ことがあるので、危ない操作は **`@tauri-apps/plugin-dialog` の `confirm`** を使っています。`pnpm dev` だけのブラウザでは `window.confirm` にフォールバックします。

## バージョンとリリース

`package.json`・`src-tauri/tauri.conf.json`・`src-tauri/Cargo.toml` の **version は揃えて**あります（いま **0.2.0**）。履歴は **`CHANGELOG.md`**。

タグの例: `git tag -a v0.2.0 -m "0.2.0"` → `git push origin v0.2.0`（リモート名は環境に合わせてください）。

## 中身の構成

| 領域 | 技術 |
|------|------|
| UI | Vue 3, TypeScript, Vite |
| シェル | Tauri 2 |
| 画像・配色ロジック | Rust（`src-tauri`） |
| テスト | Vitest（フロント）、`cargo test`（Rust） |

処理の流れやフォルダの役割は [docs/architecture.md](docs/architecture.md)（Mermaid と簡易ツリー）にまとめています。

## CI

`main` への **push / pull_request** で [`.github/workflows/ci.yml`](.github/workflows/ci.yml) が動きます。

1. **Ubuntu**: フロントの `test`・`build` のあと `src-tauri` で `cargo test`（Linux では Tauri 用に WebKit/GTK 系パッケージを入れています）
2. **Windows**（上記が通ったあと）: `pnpm exec tauri build` でビルド確認

## 開発コマンド

```bash
pnpm tauri dev    # いつもの開発
pnpm run test     # Vitest
pnpm run build    # vue-tsc + vite build
cd src-tauri && cargo test
pnpm tauri build  # 配布用
```

エディタは [VS Code](https://code.visualstudio.com/) なら [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar)、[Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)、[rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) が便利です。

## PCCS 風トーン（実装メモ）

公式 PCCS ではありません。`src-tauri/src/theory.rs` の `pccs_style_tone` と同じ前提です。

| 条件（目安） | 意味 |
|--------------|------|
| `C* < 8` | 無彩色寄り |
| `8 ≤ C* < 18` | 低彩度帯の境界 |
| `18 ≤ C* < 28` | 中彩度寄り |
| `28 ≤ C* < 38` | やや高彩度 |
| `C* ≥ 38` | 高彩度寄り |

明度 L* は例として次のように分岐（他条件と組み合わせ）。

- `L* ≥ 76` かつ `C* < 18` → ペール寄り
- `L* ≥ 72` かつ `28 ≤ C* < 38` → ライト寄り
- `L* ≥ 62` かつ `C* ≥ 38` → ブライト寄り
- `40 ≤ L* ≤ 72` かつ `C* ≥ 38` → ビビッド寄り
- `38 ≤ L* ≤ 62` かつ `C* ≥ 28` → ストロング寄り
- `L* < 48` かつ `C* ≥ 38` → ディープ寄り
- `L* < 50` かつ `18 ≤ C* < 38` → ダール寄り
- `L* < 45` かつ `C* < 28` → ダーク寄り
- `52 ≤ L* ≤ 68` かつ `C* < 28` → ソフト寄り
