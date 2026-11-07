# 検索とリンクのプレビュー

検索エンジンと SNS のリンクのプレビューに向けて出すもの（canonical・hreflang・OGP・sitemap・robots.txt）をまとめる。決定の経緯は Issue #1。

## 方針

- インデックスさせるのは、新トップの `/` と `/en/` だけ
- 各回のサイトは noindex のまま。noindex はサーバーのヘッダで付いている（`.htaccess` の ToDo で `/` と `/en/` だけ外す）
- **robots.txt で各回のフォルダを Disallow しない。** クロールを禁じると、クローラーが noindex のヘッダを読めない。その結果、URL だけが検索結果に残ることがある

## 出すもの

| 出すもの              | 中身                                                                                                                        | 作る場所                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| canonical・`og:url`   | その言語のトップの絶対 URL                                                                                                  | `src/layouts/Base.astro`                                            |
| hreflang の alternate | `ja`→`/`、`en`→`/en/`、`x-default`→`/`                                                                                      | `src/lib/seo.ts` の `alternatesOf()`                                |
| OGP                   | `og:type`（website）・`og:site_name`・`og:title`・`og:description`・`og:locale`（`ja_JP`／`en_US`）と `og:locale:alternate` | `Base.astro`                                                        |
| OGP の画像            | 撮影済みの回のうち最新の回の写真から作る JPEG（1200×630）。日英で同じファイル。代替テキストは言語ごと                       | `src/components/Home.astro`、`src/lib/captures.ts` の `ogImageOf()` |
| `twitter:card`        | 画像があれば `summary_large_image`                                                                                          | `Base.astro`                                                        |
| `/sitemap.xml`        | `/` と `/en/`。それぞれに `xhtml:link` で言語版を書く                                                                       | `src/pages/sitemap.xml.ts`                                          |
| `/robots.txt`         | `Disallow: /errorpage/` と、sitemap の絶対 URL                                                                              | `src/pages/robots.txt.ts`                                           |

- URL はすべて `astro.config.mjs` の `site` から作る
- sitemap と robots.txt は外部ライブラリ（`@astrojs/sitemap`）を使わず、Astro のエンドポイントで書き出す。対象が2ページしか無いため
- `lastmod` は書かない。正確に保てない値は、検索エンジンに無視されるか、信用を落とすため
- 新しい回をデータに足しても、撮影する前は、OGP の画像は1つ前の撮影済みの回のままになる。ビルドは落ちない

## 配置で注意すること

- **`robots.txt` は、archive ホストに今ある robots.txt を置き換える。** 今の中身は `Disallow: /errorpage/` の1行だけ（2026-11-07 に確認）で、この規則は引き継いだ
  - エラーページの静的化（#2）で `/errorpage/` の扱いが変わったら、`src/lib/seo.ts` の `ROBOTS_DISALLOW` を直す
- `sitemap.xml` は今のホストに無い（404）。新しく置くだけになる
- OGP の画像は `/_astro/` に出る。拡張子は `.jpeg`。サーバーが `image/jpeg` で返すことを、配置の検証で確かめる

## 検査

| 検査                                  | 見るもの                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/seo.test.mjs`（`pnpm test`） | URL・alternate・sitemap の中身・robots.txt の規則                                                                                                                               |
| `e2e/seo.e2e.mjs`（`pnpm test:e2e`）  | `dist/` の `<head>`（canonical・OGP・`twitter:card`）、OGP の画像の寸法と Content-Type とメタデータ（JFIF 以外の APPn が無いこと）、sitemap が XML として読めること、robots.txt |

- e2e のテスト用サーバー（`e2e/lib/server.mjs`）は、拡張子で Content-Type を決める。新しい拡張子を出すときは、`TYPES` にも足す
  - `.jpeg` が無かったときは `application/octet-stream` で返り、ブラウザが画像をダウンロード扱いにした
