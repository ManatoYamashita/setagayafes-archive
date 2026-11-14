# ドキュメント索引

## 運用

- `docs/` は、このリポジトリの規約と知見の正本
  - 決定の経緯と ToDo の正本は Issue #1
- `docs/` の直下に置くのは本索引だけ。他の文書はサブディレクトリへ置く
- サブディレクトリ名とファイル名は英小文字の `kebab-case` にする
- 文書を足したり消したりしたら、本索引も同じコミットで直す
- 機密情報（接続情報・個人情報・公開してはいけない調査の記録）は書かない。このリポジトリは公開されている
- 文書だけのコミットには `DOC:` を付ける

## 文書一覧

### 規約（rules/）

- **[conventions.md](./rules/conventions.md)**: このリポジトリで守る決まりと、その理由
  - JS は0（`client:*`・`<script>` は禁止）。HTTP ヘッダは新トップの範囲にだけ付ける
  - 公開フォルダに、ダンプ・バックアップ・ログ・表計算のファイルと、OS・編集ソフトの副産物（`Thumbs.db`・`desktop.ini`・`_vti_*` など）を置かない
- **[labels.md](./rules/labels.md)**: PR のラベルと、パスから自動で付ける仕組み
  - `docs`・`tooling` は自動。`feature`・`fix`・`server`・`security` は手で付ける

### データ（data/）

- **[festivals.md](./data/festivals.md)**: 各回と関連サイトのデータの、項目・出典・導出の規則・英語の表記
  - 年・時代・祭の名称・パスはデータに持たず、関数で導く。1件足すときは、テストの `SERVER_FOLDERS` と `LATEST_ROUND` も直す

### 画面（design/）

- **[screen.md](./design/screen.md)**: トップの部品、参考画像からの置き換え、JS を使わない MENU・プレビュー・絞り込み・初期表示の動き、英語版、写真の扱い、実測
  - 画面の高さが足りないときは MENU の内側をスクロールし、「閉じる」まで操作できるようにする
  - ヒーローは中央寄せ（2行の `h1`・説明文・ボタン2つ・最新回の写真の枠）。文言の回数と年はデータから導く
  - プレビューは popover＋iframe。iframe は sandbox（`allow-same-origin` 無し）で封じ、CSP に `frame-src 'self'` を足した
  - 一覧は全回を均等な3列に並べ、時代の絞り込みは radio＋`:has()`
  - `/en/` は同じ部品に `lang` を渡す。文言は `src/i18n/ui.ts`。テーマは原文を題名に残し、英訳を添える
- **[htaccess.md](./design/htaccess.md)**: archive 直下の `.htaccess`（ビルドで生成）。ヘッダを新トップの範囲にだけ付ける書き方、noindex の除外、CSP、HSTS
  - http→https はコントロールパネルの 302 のまま、HSTS で補う（パネルは 302 しか返せない。`.htaccess` の 301 はループの危険があり、見送った）
- **[seo.md](./design/seo.md)**: canonical・hreflang・OGP・sitemap・robots.txt。インデックスさせるのは `/` と `/en/` だけ
  - 各回のフォルダを robots.txt で Disallow しない（noindex のヘッダを読ませるため）。今のホストの `Disallow: /errorpage/` は引き継ぐ

### 運用（ops/）

- **[deploy.md](./ops/deploy.md)**: さくらへの配置。`pnpm package` で zip を作って手元の Apache で確かめ、サーバーのスクリプトで控えを取ってから展開する
  - 配置の後は `pnpm check:production` で本番のヘッダを確かめる。壊れたら `remote-rollback.sh` で戻す
  - 初回だけ、エラーページの PHP と旧トップの部品（`css/`・`js/`・`img/`）を公開フォルダの外へ移す
  - 数分かかる処理は、SSH の接続を保つか、サーバー上で `nohup` で流す（途中で切れることがある）
- **[annual-update.md](./ops/annual-update.md)**: 年次の追加。データに1件足し、`pnpm capture <回>` を1回流し、配置する
  - 新しい回のフォルダがサーバーに置かれてから始める（先に流すと撮影とリンクの検査が 404 で落ちる）
  - 始める前に、新しい回のフォルダに `*.bak`・`Thumbs.db`・`.DS_Store`・`desktop.ini`・`_vti_*` などが無いことを確かめる

- **[capture.md](./ops/capture.md)**: サムネイルの撮影（`pnpm capture`。関連サイトは `pnpm capture related`）と、AVIF・OGP 画像の生成
  - 原画像だけをコミットし、AVIF と OGP の JPEG はビルド時に作る
  - 撮影の条件、回ごとの例外、写真のメタデータの除去、撮影時点のサイト側の壊れ

- **[static-archive-checks.md](./ops/static-archive-checks.md)**: 静的化後に、終了した操作と旧ドメインの画像参照を点検する

- **[repair-past-sites.md](./ops/repair-past-sites.md)**: 過去回のサイトの壊れ（旧ドメインへの参照・サイトの外へ出る相対パス・CSS 変数・欠けたファイル・文字コード）を直す手順と道具（Issue #3）
  - 道具は手元で動かし、変えたファイルだけを、控えを取ってから送る。送る前後に sha256 で確かめる

- **[wp-to-static.md](./ops/wp-to-static.md)**: 動き続けている旧 WordPress・自作 PHP のサイトを静的 HTML に置き換え、PHP と DB を撤去する手順
  - 道具は `scripts/ops/wp2static/`（サーバーで動かす）と `scripts/ops/compare-pages.mjs`（置き換えの前後の撮影と比較）
  - `.php` の URL を保つ書き方と、`FilesMatch`・多重拡張子・撮影の待ちなどのつまずいた点

- **[post-build-checks.md](./ops/post-build-checks.md)**: ビルド後の検査（JS 0・公開禁止ファイル・リンク・転送量の予算）と `pnpm check:links`、Lighthouse の手動測定
  - 予算はブラウザで測る。初回は最初の画面に写る分だけ（先読みは除く）、全体は絞り込みに触れずに最後までスクロールした分

## 関連

- [AGENTS.md](../AGENTS.md): 作業者（人とエージェント）向けの参照順と作業の流れ
- [README.md](../README.md): セットアップとコマンド
