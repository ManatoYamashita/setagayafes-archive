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
  - 公開フォルダに、ダンプ・バックアップ・ログ・表計算のファイルを置かない

### データ（data/）

- **[festivals.md](./data/festivals.md)**: 各回と関連サイトのデータの、項目・出典・導出の規則・英語の表記
  - 年・時代・祭の名称・パスはデータに持たず、関数で導く。1件足すときは、テストの `SERVER_FOLDERS` と `LATEST_ROUND` も直す

### 運用（ops/）

- **[capture.md](./ops/capture.md)**: サムネイルの撮影（`pnpm capture`）と、AVIF・OGP 画像の生成
  - 原画像だけをコミットし、AVIF と OGP の JPEG はビルド時に作る
  - 撮影の条件、回ごとの例外、写真のメタデータの除去、撮影時点のサイト側の壊れ

- **[static-archive-checks.md](./ops/static-archive-checks.md)**: 静的化後に、終了した操作と旧ドメインの画像参照を点検する

- **[wp-to-static.md](./ops/wp-to-static.md)**: 動き続けている旧 WordPress・自作 PHP のサイトを静的 HTML に置き換え、PHP と DB を撤去する手順
  - 道具は `scripts/ops/wp2static/`（サーバーで動かす）と `scripts/ops/compare-pages.mjs`（置き換えの前後の撮影と比較）
  - `.php` の URL を保つ書き方と、`FilesMatch`・多重拡張子・撮影の待ちなどのつまずいた点

### 予定（まだ無い文書。作ったらリンクにする）

- `ops/deploy.md`: さくらへの配置手順（手元の httpd での検証を含む）
- `ops/annual-update.md`: 年次の追加手順（データに1件追加し、撮影スクリプトを1回流す）

## 関連

- [AGENTS.md](../AGENTS.md): 作業者（人とエージェント）向けの参照順と作業の流れ
- [README.md](../README.md): セットアップとコマンド
