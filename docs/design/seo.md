# 検索とリンクのプレビュー

検索エンジンと SNS のリンクのプレビューに向けて出すもの（canonical・hreflang・OGP・sitemap・robots.txt）をまとめる。決定の経緯は Issue #1。

## 方針

- インデックスさせるのは、新トップの `/` と `/en/` だけ
- 各回のサイトは noindex のまま。noindex はサーバーのヘッダで付いている。`/` と `/en/` だけ、archive 直下の `.htaccess` で外す（[htaccess.md](./htaccess.md)）
- **robots.txt で各回のフォルダを Disallow しない。** クロールを禁じると、クローラーが noindex のヘッダを読めない。その結果、URL だけが検索結果に残ることがある

## 出すもの

| 出すもの              | 中身                                                                                                                                                                                    | 作る場所                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| canonical・`og:url`   | その言語のトップの絶対 URL                                                                                                                                                              | `src/layouts/Base.astro`                                          |
| hreflang の alternate | `ja`→`/`、`en`→`/en/`、`x-default`→`/`                                                                                                                                                  | `src/lib/seo.ts` の `alternatesOf()`                              |
| `<title>`             | 日本語「過去の世田谷祭｜東京都市大学（旧 武蔵工業大学）の学園祭 歴代公式サイト｜世田谷祭アーカイブ」、英語「Setagaya Festival Archive \| Tokyo City University」（`UI` の `pageTitle`） | `src/components/Home.astro`                                       |
| OGP                   | `og:type`（website）・`og:site_name`（短い `siteName`）・`og:title`（`<title>` と同じ）・`og:description`・`og:locale`（`ja_JP`／`en_US`）と `og:locale:alternate`                      | `Base.astro`                                                      |
| OGP の画像            | 固定のデザイン（`src/assets/og/ogp.jpg`、1920×1080）から作る JPEG（1200×630）。日英で同じファイル。代替テキストは言語ごと                                                               | `src/components/Home.astro`、`src/lib/og-image.ts` の `ogImage()` |
| JSON-LD               | `WebSite`（`name`・`alternateName`・`url`・`inLanguage`）。`name` はその言語の `siteName`、`alternateName` はもう一方の言語の `siteName`。`url` は日英とも `/`                          | `src/lib/seo.ts` の `websiteJsonLd()`、`Base.astro`               |
| `apple-touch-icon`    | `/apple-touch-icon.png`（180×180）                                                                                                                                                      | `public/`、`Base.astro`                                           |
| `twitter:card`        | 画像があれば `summary_large_image`                                                                                                                                                      | `Base.astro`                                                      |
| `/sitemap.xml`        | `/` と `/en/`。それぞれに `xhtml:link` で言語版を書く                                                                                                                                   | `src/pages/sitemap.xml.ts`                                        |
| `/robots.txt`         | `Disallow: /errorpage/` と、sitemap の絶対 URL                                                                                                                                          | `src/pages/robots.txt.ts`                                         |

- URL はすべて `astro.config.mjs` の `site` から作る
- sitemap と robots.txt は外部ライブラリ（`@astrojs/sitemap`）を使わず、Astro のエンドポイントで書き出す。対象が2ページしか無いため
- `<title>` には、検索する人が打つ「東京都市大学」「武蔵工業大学」を入れる。`og:site_name` と JSON-LD の `name` は、サイトの名前として短いまま残す
- 「過去の世田谷祭」で検索されたときに当たるよう、この語を崩さない形で、`<title>` の先頭・description・ヒーローの説明文に入れる（#67）。OGP の画像の題字と同じ語
  - 「世田谷祭の過去のWebサイト」のように語順を崩すと、語句の一致として扱われにくい
  - 一覧の見出しの縦書きのラベル（「過去の回」）は変えない。7文字にすると、隣の「Archive」の字より高くなり、見出しの形が崩れる
  - 見えない文字（`sr-only` など）で語を足さない。検索エンジンには、隠したテキストとして扱われる
  - `scripts/i18n.test.mjs` が、3か所にこの語があることを検査する
- 文言を変えただけでは、検索結果の順位は決まらない。リポジトリの外で、次のことが効く（オーナーの作業）
  - Search Console にプロパティを登録し、`/sitemap.xml` を送る。`/` のインデックス登録をリクエストする
  - 公式サイト（setagayafes.org）から archive へリンクを張る。2026-11-14 の時点で、公式サイトのトップに archive へのリンクは無い
- JSON-LD の `url` は日英とも `/`。Google はサイト名を、ドメインのトップページの `WebSite` から取るため
  - JSON-LD は、ソースに `<script type="application/ld+json" set:html={変数} />` の形でだけ書ける（[conventions.md](../rules/conventions.md) §1）。中身は `jsonLdText()` を通して作る。`<` を `\u003c` に替えるので、値で要素を閉じられない
  - `pnpm build`（`scripts/guard-dist.mjs`）は、`dist/` の JSON-LD に `<` があるか、JSON として読めないと落とす。ESLint と `pnpm guard` は書き方を、`dist/` の検査はエスケープを見る
- `lastmod` は書かない。正確に保てない値は、検索エンジンに無視されるか、信用を落とすため
- OGP の画像は、オーナーが作った固定のデザイン（2026-11-14 に差し替え。それまでは最新の回の写真から作っていた）。年次の追加では変えない
  - 原画像は 16:9 で、上下を均等に切って 1.91:1 にする。ロゴ・題字・URL は切れない。差し替えるときも、上下の端に要る文字を置かない
  - 原画像は、メタデータ（EXIF・XMP）を抜いてからコミットする。Canva などの書き出しには、作者名や作成元の ID が XMP で入る。出力の JPEG はビルドで作り直すので残らないが、原画像はリポジトリに公開される
  - 抜くときは `scripts/lib/jpeg.mjs` の `stripJpegMetadata` を使う（画素はそのまま。`node -e` で1回呼べば足りる）。`pnpm test` が、`src/assets/og/` の JPEG にメタデータが残っていないことを検査する

## 配置で注意すること

- **`robots.txt` は、archive ホストに今ある robots.txt を置き換える。** 今の中身は `Disallow: /errorpage/` の1行だけ（2026-11-07 に確認）で、この規則は引き継いだ
  - エラーページの静的化（#2）で `/errorpage/` の扱いが変わったら、`src/lib/seo.ts` の `ROBOTS_DISALLOW` を直す
- `sitemap.xml` は今のホストに無い（404）。新しく置くだけになる
- OGP の画像は `/_astro/` に出る。拡張子は `.jpeg`。サーバーが `image/jpeg` で返すことを、配置の検証で確かめる

## 検査

| 検査                                  | 見るもの                                                                                                                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/seo.test.mjs`（`pnpm test`） | URL・alternate・sitemap の中身・robots.txt の規則・OGP の原画像にメタデータが無いこと・JSON-LD の中身と `<` のエスケープ                                                                                                                             |
| `e2e/seo.e2e.mjs`（`pnpm test:e2e`）  | `dist/` の `<head>`（`<title>`・canonical・OGP・`twitter:card`・JSON-LD の中身・`apple-touch-icon` の寸法と Content-Type）、OGP の画像の寸法と Content-Type とメタデータ（JFIF 以外の APPn が無いこと）、sitemap が XML として読めること、robots.txt |

- e2e のテスト用サーバー（`e2e/lib/server.mjs`）は、拡張子で Content-Type を決める。新しい拡張子を出すときは、`TYPES` にも足す
  - `.jpeg` が無かったときは `application/octet-stream` で返り、ブラウザが画像をダウンロード扱いにした
