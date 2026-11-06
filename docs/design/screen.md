# 画面の構成

トップ（`/`）の部品と、JS を使わずに動きを作る方法をまとめる。決定の経緯は Issue #1。

## 部品

| 部品           | ファイル                            | 中身                                                            |
| -------------- | ----------------------------------- | --------------------------------------------------------------- |
| ヘッダー       | `src/components/SiteHeader.astro`   | サイト名（`h1`）と MENU。MENU の中身は `src/data/site-links.ts` |
| ヒーロー       | `src/components/Hero.astro`         | 最新の回（`latestFestival()`）。テーマを大きく組む              |
| 絞り込み・一覧 | `src/components/Archive.astro`      | 時代の絞り込みと、ヒーロー以外の回のグリッド（新しい順）        |
| カード         | `src/components/FestivalCard.astro` | 写真 → 日付・回・タグ → テーマ → 祭の名称                       |
| 写真           | `src/components/Capture.astro`      | サムネイル。無い回は回の数字を大きく組んだ代替表示              |
| 関連サイト     | `src/components/RelatedSites.astro` | `blockedBy` のある項目は、リンクを張らずに「公開準備中」        |
| フッター       | `src/components/SiteFooter.astro`   | MENU と同じリンク。popover が動かないブラウザでも辿れる         |

## JS を使わない動き

### MENU: `popover` と `popovertarget`

- `<button popovertarget="site-menu">` と `<nav id="site-menu" popover>` だけで開閉する
- Escape・外側のクリックで閉じ、閉じるとフォーカスはボタンへ戻る（ブラウザが行う）
- パネルは画面内に収まる高さに制限し、内容が長いときはパネル内を縦にスクロールする。E2E では幅320px・高さ256pxで、Tab で「閉じる」まで移動して操作できることを確かめる
- `command` / `commandfor`（Invoker Commands）は使わない。古いブラウザ向けの polyfill が JS になるため

### 絞り込み: radio と `:has()`

- `name="era"` の radio を3つ置き、`.archive:has(#era-musashi:checked)` で他の時代のカードを `display: none` にする
- radio は `sr-only` で隠し、`label` を丸枠のピルとして描く。矢印キーでの移動はブラウザの radio のまま
- 表示中の件数（「5件を表示中」）も、同じ `:has()` で出し分ける

### グリッドの組み方: `:nth-child(An+B of S)`

- 3列（64rem 以上）は、参考デザインに合わせて6件で1組にする。大きなカード（2列×2行）と、横に積んだ小さなカード2件、その下に3件を並べる
- 大きなカードは、1組ごとに左右を入れ替える（`12n+1` は左、`12n+7` は右）。`grid-auto-flow: dense` で隙間を詰める
- 2列（40rem 以上）は、5件ごとに1件を全幅にする
- 絞り込みで隠したカードも `:nth-child()` の数に入る。そのため、絞り込みごとに `:nth-child(… of [data-era="musashi"])` で数え直す
  - 時代の値（`musashi`・`tcu`）は CSS に直接書いている。時代を増やすときは `Archive.astro` の CSS も直す

## 写真

- サムネイルは 2560x1600（16:10）の画面写真。枠もすべて 16:10 にして、写真を切らずに見せる
  - 縦長（4:5）に切ると、横長の画面写真の中央の帯しか残らない（ロゴもナビも消える）
- 原画像は `src/lib/captures.ts` の `captureOf()` で引き、`CAPTURE_IMAGE_PROPS`（AVIF・上端基準で切り出し）で `<Image>` に渡す。撮影の手順は [capture.md](../ops/capture.md)
- `widths` と `sizes` はグリッドでの実際の幅から決める（`Archive.astro` の `sizesOf()`）
- 撮影前の回（`hasCapture()` が false）は、回の数字を大きく組んだ代替表示にする。年次の追加でデータだけ先に入れても、ビルドは落ちない
- ヒーローの写真だけ `loading="eager"`・`fetchpriority="high"`。カードはすべて `loading="lazy"`

## 実測（2026-11-06。サムネイル23件を置いた状態）

| 項目                                   | 結果                                     |
| -------------------------------------- | ---------------------------------------- |
| 転送量（412px・1.75x、全部スクロール） | 初回 60KB／全体 250KB（予算 200KB／1MB） |
| Lighthouse（モバイル、手元）           | 4カテゴリとも 100                        |
| LCP／CLS（同上）                       | 1.4 秒／0                                |

残りの指摘（キャッシュ・テキスト圧縮）はサーバー側の設定で、`.htaccess` の ToDo で扱う。

## はまりどころ

- **1列のグリッドでも `grid-template-columns: minmax(0, 1fr)` を書く。** 書かないと列の幅が中身の最小幅に引きずられ、
  320px で大きな見出しが画面からはみ出した（e2e の横スクロール検査で発見）
- **大きな見出しには `overflow-wrap: anywhere` を付ける。** `word-break: auto-phrase` は「カラクリ」のような1語を分けないため
- **日本語の文章をソース上で改行しない。** 改行は空白として描かれる（「残しています、 各回」のようになる）
- **12px 未満の文字を使わない。** Lighthouse の「読みやすい文字サイズ」で減点される
- **favicon を置く。** 無いと `/favicon.ico` が 404 になり、Lighthouse の Best Practices がコンソールのエラーで減点される
