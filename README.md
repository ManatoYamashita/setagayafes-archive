# setagayafes-archive

[archive.setagayafes.org](https://archive.setagayafes.org/) のトップ（過去の世田谷祭の一覧）のソース。

- Astro（`output: "static"`）＋ Tailwind CSS v4
- ブラウザへ送る JavaScript は0
- 規約は [docs/rules/conventions.md](./docs/rules/conventions.md)、文書の索引は [docs/INDEX.md](./docs/INDEX.md)

## 必要なもの

- Node.js 24（`.nvmrc`）
- pnpm 10（`package.json` の `packageManager`。`corepack enable` で入る）
- e2e 用のブラウザ: `pnpm exec playwright install --only-shell chromium`

## コマンド

| コマンド                            | 内容                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install`                      | 依存を入れる                                                                                                             |
| `pnpm dev`                          | 開発サーバー                                                                                                             |
| `pnpm build`                        | `dist/` へ書き出し、出力を検査する（JS が無いこと・禁止ファイルが無いこと・サイト内のリンク）                            |
| `pnpm preview`                      | `dist/` を手元で配信する                                                                                                 |
| `pnpm lint`                         | ESLint                                                                                                                   |
| `pnpm check`                        | `astro check`（型と Astro の診断）                                                                                       |
| `pnpm format` / `pnpm format:check` | Prettier                                                                                                                 |
| `pnpm guard`                        | ソースの検査（`client:*`・`<script>`・`public/` の禁止ファイル・UI ランタイム）                                          |
| `pnpm test`                         | 検査スクリプト自体のテスト                                                                                               |
| `pnpm test:e2e`                     | `dist/` をブラウザ（Playwright の Chromium）で開く e2e テスト（転送量の予算を含む）。先に `pnpm build`                   |
| `pnpm capture [回数…]`              | 各回のトップを撮影し、`src/assets/captures/` を更新する（[手順](./docs/ops/capture.md)）                                 |
| `pnpm check:links`                  | 過去回のフォルダと外部リンクが応答するかをネットワークで確かめる。配置の前に、`pnpm build` の後で流す（CI では流さない） |
| `pnpm verify`                       | 上記をまとめて流す（CI と同じ）                                                                                          |
