# archive 直下の .htaccess

archive ホストの公開フォルダ（さくらの `~/www/archive`）の直下に置く `.htaccess` の中身と理由をまとめる。規約は [conventions.md](../rules/conventions.md) の3節、決定の経緯は Issue #1。

## 作り方

- `pnpm build` の中で `scripts/build-htaccess.mjs` が `dist/.htaccess` を書き出す。中身は `scripts/lib/htaccess.mjs` が作る
- このリポジトリが正本。サーバーの上で直接書き換えない。直すときはリポジトリを直して配置し直す
- ビルドで作る理由は2つ
  - CSP に、ページのインラインの `<style>` のハッシュを入れるため（CSS が変わるとハッシュも変わる）
  - ヘッダを付けるパスを、`dist/` の中身から作るため（出力を足したときに書き足し忘れない）

## サーバーの構成（2026-11-07 に確認）

| ファイル                   | 中身                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `~/www/.htaccess`（上位）  | `ErrorDocument`（`.php`）と、ホスト名が archive・about・blog・form・link のときの `X-Robots-Tag: noindex, noimageindex` |
| `~/www/archive/.htaccess`  | `ErrorDocument`（`.php`）と、無条件の `X-Robots-Tag: noindex, noimageindex`。これを `dist/.htaccess` で置き換える       |
| `~/www/archive/errorpage/` | エラーページ。`NNN.php` と、静的化した `NNN.html` が両方ある                                                            |

- 前段が nginx、`.htaccess` を読むのはその後ろの Apache 2.4
- http→https の転送は、今は前段の nginx が **302** で返している（コントロールパネルの HTTPS 転送）。Apache まで届かない

## 中身

| 部分               | 対象                                                           | 中身                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ErrorDocument`    | すべて                                                         | `/errorpage/NNN.html`（静的なページ）。PHP の版は使わない                                                                                                           |
| noindex            | トップのページ（`/`・`/index.html`・`/en/`・`/en/index.html`） | `X-Robots-Tag` を `unset` する。上位の `.htaccess` が付けたぶんも消える                                                                                             |
|                    | それ以外のすべて（過去回・エラーページ・画像など）             | `X-Robots-Tag: noindex, noimageindex`（これまでと同じ）                                                                                                             |
| セキュリティヘッダ | このリポジトリが出力したパス                                   | `X-Content-Type-Options`・`Referrer-Policy`・`Permissions-Policy`・`Cross-Origin-Opener-Policy`                                                                     |
| CSP                | トップのページ                                                 | `default-src 'none'; script-src 'none'`、`style-src` はインラインの `<style>` の sha256、`img-src 'self'`、`base-uri`・`form-action`・`frame-ancestors` は `'none'` |
| キャッシュ         | `/_astro/`                                                     | `public, max-age=31536000, immutable`（ファイル名に中身のハッシュが入るため）                                                                                       |
|                    | トップのページ                                                 | `no-cache`（毎回確かめる。中身が変われば取り直す）                                                                                                                  |
| HSTS               | Host が `archive.setagayafes.org` のとき                       | `max-age=31536000`。`includeSubDomains` は付けない                                                                                                                  |
| 圧縮               | このリポジトリが出力したパス                                   | `mod_deflate` があるときだけ。さくらでは効かないことを実測済みなので、無くても困らない                                                                              |

### 範囲を `<If>` で限る理由

- archive 直下の `.htaccess` の設定は、配下の過去回のサイト（`/78th/` など）へ継承される。過去回はインラインの JS や外部の埋め込みを使うので、CSP が掛かると壊れる
- `<If>` は、すべてのディレクトリの設定（上位の `~/www/.htaccess` と、過去回のフォルダの `.htaccess` を含む）を合わせた**後**に評価される。そのため、上位が付けた noindex を、トップのページでだけ消せる
  - 上位の `~/www/.htaccess` は、このリポジトリの外にあり、他のホストにも効く。書き換えない
- `<FilesMatch>` では限れない。`index.html` は過去回のフォルダにもある
- `/` を開いたとき、Apache は `DirectoryIndex` で `/index.html` へ内部で振り替える。正規表現は `/` と `/index.html` の両方に合わせてある

### CSP をハッシュで書く理由

- `script-src 'none'` なので、`style-src 'unsafe-inline'` でも大きな穴にはならない。それでも、許すものを最小にするためにハッシュにした
- Astro は CSS を HTML に埋め込む（`build.inlineStylesheets: "always"`）。CSS を変えるとハッシュも変わるが、`.htaccess` はビルドで作り直されるので、配置で HTML と一緒に置けば揃う
- **HTML だけを置き換えて `.htaccess` を置き換えないと、ページのスタイルが当たらなくなる。** 配置では必ず両方を置く

### 入れていないもの

- **http→https の 301。** 今の 302 は前段の nginx が返していて、Apache の `.htaccess` では変えられない
  - `.htaccess` で 301 にするなら、コントロールパネルの HTTPS 転送を止めて、`RewriteRule` で転送する。しかし、要求が https かどうかを Apache 側で何で判定できるか（`%{HTTPS}`・`%{ENV:HTTPS}`・転送元のヘッダ）は、さくらの上で試さないと分からない。判定を誤ると転送がループし、過去回を含むホスト全体が見られなくなる
  - 自分の `.htaccess` で `RewriteEngine on` を持つ過去回のフォルダ（`/93rd/`・`/96th/` など）には、親の `RewriteRule` が継承されない。`.htaccess` の 301 では、ホスト全体を覆えない
  - オーナーが決める（Issue #1）。選択肢は「コントロールパネルで 301 にできるか確かめる」「サーバーの上で判定の方法を試してから、`.htaccess` で 301 にする」「302 のままにする（HSTS で、2回目からはブラウザが http を使わない）」
- **CSP 以外のヘッダを過去回へ付けること。** 範囲の外。HSTS だけはホスト単位の仕組みなので、過去回の応答にも付く

## 配置で注意すること

- zip に `.htaccess`（ドットファイル）を含める
- 置き換える前に、今の `~/www/archive/.htaccess` の控えを `~/archive-docs/`（公開フォルダの外）に取る
- 置いたらすぐ、`curl -sI` で `/`・`/en/`・`/78th/`・存在しないパスのヘッダを確かめる。崩れていたら控えに戻す
- `ErrorDocument` を `.html` に切り替えた後で、`errorpage/` の PHP を撤去する（#2）
- `/img/` の退避（Issue #1 の ToDo）より前に、`scripts/lib/capture-targets.mjs` の第87回の写真（`/img/87th.JPG`）の取り先を決める。退避すると `pnpm capture 87` が取れなくなる

## 検査

| 検査                                       | 見るもの                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `scripts/htaccess.test.mjs`（`pnpm test`） | 範囲の正規表現（過去回・`/errorpage/`・`/img/` に掛からないこと）、CSP、HSTS、すべてのヘッダが `<If>` の中にあること |
| `pnpm check:htaccess`                      | 手元の Apache 2.4 で、上位と archive 直下の2段の `.htaccess` を再現し、実際に返るヘッダを確かめる                    |
| `e2e/headers.e2e.mjs`（`pnpm test:e2e`）   | CSP を掛けたページが、掛けないときと同じに表示され、違反が出ないこと                                                 |

- `pnpm check:htaccess` は `pnpm verify` と CI で流す。macOS は `/usr/sbin/httpd`、Ubuntu は `apache2` を使う
- わざと壊して確かめた: noindex の `unset` を消す・CSP のハッシュを変える・範囲の `<If>` を外す → どれも落ちる
