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
| `~/www/archive/errorpage/` | 前のエラーページ（#24 で静的化した `NNN.html`）。今は使わないが、戻すときのために残す                                   |

- 前段が nginx、`.htaccess` を読むのはその後ろの Apache 2.4
- http→https の転送は、今は前段の nginx が **302** で返している（コントロールパネルの HTTPS 転送）。Apache まで届かない
- 上位の `~/www/.htaccess` には、`RewriteEngine on` と、ホストの根元（`^$`）を別のホストへ送る `RewriteRule` もある（2026-11-14 に確認）。archive の要求には掛からない（`.htaccess` の置き場所からの相対パスが `archive/…` になり、`^$` に合わないため）
  - archive 直下の `.htaccess` に `RewriteEngine On` を書くと、archive の配下では上位の規則が継承されなくなる。上の理由で、今は影響が無い

### Apache から見える要求（2026-11-14 に確認）

試しのフォルダの `.htaccess` で、`mod_rewrite` の変数を `RewriteRule ^ - [E=…]` で環境変数へ移し、`Header always set` で応答に出して確かめた（Issue #49）。手元の Apache（`pnpm check:htaccess`）との違いで、規則の書き方に響くのは `Accept-Encoding` と `REDIRECT_STATUS` の2つ。

| 変数                                            | さくらでの値                                                                     | 手元の Apache          |
| ----------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------- |
| `%{HTTP:Accept-Encoding}`                       | **常に空**。前段の nginx が外す（`User-Agent`・`Accept`・独自のヘッダは届く）    | クライアントが送った値 |
| `%{ENV:REDIRECT_STATUS}`                        | **最初の要求から `200`**。ホスト名から公開フォルダへの振り分けが内部の転送のため | 最初の要求では空       |
| `%{SERVER_PROTOCOL}`                            | 外から HTTP/2 で来ても `HTTP/1.1`                                                | クライアントと同じ     |
| `%{DOCUMENT_ROOT}`                              | `…/www/archive`                                                                  | 試験用のフォルダ       |
| `%{REQUEST_URI}`                                | 手元と同じ形（`/` は `DirectoryIndex` で `/index.html` になる）                  | 同じ                   |
| `RewriteRule`・`-f`・`<IfModule mod_rewrite.c>` | 手元と同じに動く                                                                 | 同じ                   |

- 前段の nginx は、Apache が付けた `Content-Encoding` をそのまま通す（展開し直さず、二重に圧縮もしない）。ただし、nginx 自身は圧縮しない
- `REDIRECT_STATUS` で「内部の振り替えの後か」を見分ける書き方は、さくらでは使えない。クライアントが送った要求そのものを見るなら `%{THE_REQUEST}` を使う

## 中身

| 部分               | 対象                                                           | 中身                                                                                                                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ErrorDocument`    | すべて                                                         | `/errors/NNN.html`（このリポジトリが出力する33本）。応答のステータスは元のまま（404 なら 404）。`/errorpage/` へ戻せば前の画面になる                                                                                                                           |
| noindex            | トップのページ（`/`・`/index.html`・`/en/`・`/en/index.html`） | `X-Robots-Tag` を `unset` する。上位の `.htaccess` が付けたぶんも消える                                                                                                                                                                                        |
|                    | それ以外のすべて（過去回・エラーページ・画像など）             | `X-Robots-Tag: noindex, noimageindex`（これまでと同じ）                                                                                                                                                                                                        |
| セキュリティヘッダ | このリポジトリが出力したパス                                   | `X-Content-Type-Options`・`Referrer-Policy`・`Permissions-Policy`・`Cross-Origin-Opener-Policy`                                                                                                                                                                |
| CSP                | トップのページ                                                 | `default-src 'none'; script-src 'none'`、`style-src` はインラインの `<style>` の sha256、`img-src 'self'`・`connect-src 'self'`・`frame-src 'self'`（プレビューの iframe。[screen.md](./screen.md)）、`base-uri`・`form-action`・`frame-ancestors` は `'none'` |
| CSP（エラー）      | `/errors/NNN.html`                                             | トップと別の方針。`default-src 'none'; script-src 'none'`、`style-src` はエラーページの `<style>` の sha256、`img-src 'self'`、`base-uri`・`form-action`・`frame-ancestors` は `'none'`。iframe も通信も無いので `frame-src`・`connect-src` は足さない         |
| キャッシュ         | `/_astro/`                                                     | `public, max-age=31536000, immutable`（ファイル名に中身のハッシュが入るため）                                                                                                                                                                                  |
|                    | トップのページ・エラーページ                                   | `no-cache`（毎回確かめる。中身が変われば取り直す）                                                                                                                                                                                                             |
| HSTS               | Host が `archive.setagayafes.org` のとき                       | `max-age=31536000`。`includeSubDomains` は付けない                                                                                                                                                                                                             |
| 圧縮               | このリポジトリが出力したパス                                   | `mod_deflate` があるときだけ。さくらでは効かないことを実測済みなので、無くても困らない                                                                                                                                                                         |

### 範囲を `<If>` で限る理由

- archive 直下の `.htaccess` の設定は、配下の過去回のサイト（`/78th/` など）へ継承される。過去回はインラインの JS や外部の埋め込みを使うので、CSP が掛かると壊れる
- `<If>` は、すべてのディレクトリの設定（上位の `~/www/.htaccess` と、過去回のフォルダの `.htaccess` を含む）を合わせた**後**に評価される。そのため、上位が付けた noindex を、トップのページでだけ消せる
  - 上位の `~/www/.htaccess` は、このリポジトリの外にあり、他のホストにも効く。書き換えない
- `<FilesMatch>` では限れない。`index.html` は過去回のフォルダにもある
- `/` を開いたとき、Apache は `DirectoryIndex` で `/index.html` へ内部で振り替える。正規表現は `/` と `/index.html` の両方に合わせてある

### エラーページの範囲は、転送先のパスで限る（2026-11-15 に実測）

`ErrorDocument` は、失敗した要求を、エラーページへ**内部で転送**して返す。そのとき `<If>` が見る `%{REQUEST_URI}` が、元の URL か転送先かを、手元の Apache 2.4.58 で測った（Issue #70）。

| 要求                       | 応答 | `%{REQUEST_URI}`   | `%{THE_REQUEST}`                | `<If "%{REQUEST_URI} =~ m#^/errors/#">` | 元の URL に合わせた `<If>` |
| -------------------------- | ---- | ------------------ | ------------------------------- | --------------------------------------- | -------------------------- |
| `/no-such-page/`（無い）   | 404  | `/errors/404.html` | `GET /no-such-page/ HTTP/1.1`   | 効く                                    | 効かない                   |
| `/errors/404.html`（直接） | 200  | `/errors/404.html` | `GET /errors/404.html HTTP/1.1` | 効く                                    | —                          |
| `/78th/`（過去回）         | 200  | `/78th/index.html` | `GET /78th/ HTTP/1.1`           | 効かない                                | —                          |

- `REQUEST_URI` は**転送先**になる。そのため、エラーページの CSP は `<If "%{REQUEST_URI} =~ m#^/errors/[0-9]{3}\.html$#">` と、エラーページ自身のパスで限る。どの URL に出ても、同じヘッダが付く
- 元の要求の `<If>` で付けたヘッダは、転送後の応答に残らなかった。元の URL がトップのページ（`/en/` など）に合っても、トップの CSP や noindex の解除は、エラーページに付かない
- `Header set`（`always` 無し）でも 404 の応答に付いた。エラーの応答に付けるものは、念のため `Header always set` で書く
- 共通のヘッダ（`X-Content-Type-Options` など）は、`own` の範囲（`errors/.*` を含む）で付く。noindex は `<Else>` の側で付く
- さくらで同じに動くかは、配置後の `pnpm check:production`（存在しない URL で、エラーページの CSP と 404 を確かめる）で確かめる。上の表の `REQUEST_URI` の形は、さくらでも手元と同じだった（「Apache から見える要求」）

### `connect-src 'self'` を入れる理由

- Lighthouse は robots.txt を、測っているページの中から取得する。`connect-src` が無いと `default-src 'none'` が効いて取得が CSP で禁じられ、SEO の監査「robots.txt is not valid」が0点になる
  - 2026-11-08 の本番の実測で SEO が 92 だった。手元で同じ `dist/` に `connect-src 'self'` を足すと 100 になった（Issue #1）
- `connect-src` が縛るのは、スクリプトからの通信（fetch・XHR・WebSocket など）と `<a ping>` だけ。`script-src 'none'` でスクリプトは動かないので、許しても使うものは無い。許すのも自分のホストだけ
- 本物のクローラーは robots.txt を直接取りに行くので、`connect-src` が無くても検索には影響しない。直したのは、完了条件の「Lighthouse 全カテゴリ 100」を満たすため
- `e2e/headers.e2e.mjs` が、Lighthouse と同じ方法（DevTools Protocol の `Network.loadNetworkResource`）で、CSP を掛けたページから robots.txt を取得できることを確かめる

### CSP をハッシュで書く理由

- `script-src 'none'` なので、`style-src 'unsafe-inline'` でも大きな穴にはならない。それでも、許すものを最小にするためにハッシュにした
- Astro は CSS を HTML に埋め込む（`build.inlineStylesheets: "always"`）。CSS を変えるとハッシュも変わるが、`.htaccess` はビルドで作り直されるので、配置で HTML と一緒に置けば揃う
- **HTML だけを置き換えて `.htaccess` を置き換えないと、ページのスタイルが当たらなくなる。** 配置では必ず両方を置く

### http→https は 302 のまま（301 にしない）

2026-11-07 にオーナーが決めた（Issue #1）。http→https の転送は、コントロールパネルの HTTPS 転送（302）のままにし、HSTS で補う。

- **コントロールパネルの転送は 302 しか返せない。** さくらの公式ヘルプに「コントロールパネルの転送は HTTP 302 Temporary で転送します」とある（[ドメインリダイレクトを設定したい](https://help.sakura.ad.jp/domain/2150/)）。転送は前段の nginx が返すので、Apache の `.htaccess` では変えられない
- **`.htaccess` の 301 は見送った。** パネルの転送を止めて `RewriteRule` で転送すれば 301 にできるが、次の問題がある
  - 要求が https かどうかを、Apache 側で何で判定できるかが分からない。2017年の報告では `%{HTTPS}` は https でも空で、`X-Sakura-Forwarded-For` の有無で判定していた。前段が nginx になった今も同じかは、サーバーで試さないと分からない
  - 判定を誤ると転送がループし、過去回を含むホスト全体が見られなくなる
  - 自分の `.htaccess` で `RewriteEngine on` を持つ過去回のフォルダ（`/93rd/`・`/96th/` など）には、親の `RewriteRule` が継承されない。ホスト全体を覆えない
- **302 で困ることは小さい。**
  - HSTS（この `.htaccess` で付ける）により、一度 https で来たブラウザは、次から http を使わない
  - インデックスさせるのは `/` と `/en/` だけで、canonical・sitemap・hreflang はどれも https の URL を指す
- 見直すのは、さくらが 301 を選べるようになったとき、またはホストを移すとき

### 入れていないもの

- **CSP 以外のヘッダを過去回へ付けること。** 範囲の外。HSTS だけはホスト単位の仕組みなので、過去回の応答にも付く
- **前もって圧縮したページ（`index.html.gz`）を返すこと。** さくらでは返せない（2026-11-14。#49・#51）
  - #51 は、ビルドで `index.html.gz` を作り、`RewriteCond %{HTTP:Accept-Encoding} \bgzip\b` で振り替えた。手元の Apache と CI では通ったが、本番に置くと振り替えが一度も起きなかった
  - 原因は、上の「Apache から見える要求」の2つ。前段の nginx が `Accept-Encoding` を外すので、Apache はクライアントが gzip を受け付けるかを見分けられない。「`.gz` の直接は 404」の規則も、`REDIRECT_STATUS` が空にならないので効かなかった
  - `Accept-Encoding` を見ずに、常に `.gz` を返すことはしない。gzip を受け付けると言っていないクライアントにも、圧縮して返すことになる（HTTP の決まりに反する）
  - 見直すのは、さくらの前段が `Accept-Encoding` を渡すか、自分で圧縮するようになったとき、またはホストを移すとき

## 配置で注意すること

手順の全体は [deploy.md](../ops/deploy.md)。`.htaccess` について特に注意することは次のとおり。

- zip に `.htaccess`（ドットファイル）を含める
- 置き換える前に、今の `~/www/archive/.htaccess` の控えを `~/archive-docs/`（公開フォルダの外）に取る
- 置いたらすぐ、`curl -sI` で `/`・`/en/`・`/78th/`・存在しないパスのヘッダを確かめる。崩れていたら控えに戻す
- `ErrorDocument` は `/errors/` を指す。`errors/` と `.htaccess` は必ず一緒に置く（[deploy.md](../ops/deploy.md)）
- 他のセッションの配置と重なると、`ErrorDocument` の変更が黙って消える（#24 で起きた）。配置する版の `.htaccess` に `/errors/` の行が33本あることを確かめる
- `/img/` の退避（Issue #1 の ToDo）より前に、`scripts/lib/capture-targets.mjs` の第87回の写真（`/img/87th.JPG`）の取り先を決める。退避すると `pnpm capture 87` が取れなくなる
- `mod_rewrite` に頼る規則を足すときは、本番のトップに置く前に、試しのフォルダで、規則が使う変数の値を確かめる（下の「試しのフォルダで確かめる」）。手元の Apache で通っても、さくらでは動かないことがある（上の「Apache から見える要求」）

### 試しのフォルダで確かめる

サーバーへの書き込みなので、オーナーの指示を取ってから行う。

1. `~/www/archive/` の下に、過去回と重ならない名前のフォルダ（例: `rwtest-<日付>/`）を作り、確かめたいファイルと、次のような `.htaccess` を置く
2. `curl -sS -o /dev/null -D - -H 'Accept-Encoding: gzip' https://archive.setagayafes.org/<フォルダ>/index.html` で、`X-T-…` のヘッダを読む。値が無い変数は `(null)` と出る
3. 確かめ終わったら、フォルダごと消し、その URL が 404 になることを確かめる

```apache
# Temporary diagnostics. Remove the folder after reading the headers.
RewriteEngine On
RewriteRule ^(.*)$ - [E=T_RS:%{ENV:REDIRECT_STATUS},E=T_URI:%{REQUEST_URI},E=T_AE:%{HTTP:Accept-Encoding},E=T_PATH:$1]
# Show the path only below /www/, so the account name never reaches the response.
RewriteCond %{REQUEST_FILENAME} /www/(.*)$
RewriteRule ^ - [E=T_FN:%1]
Header always set X-T-RS "[%{T_RS}e]"
Header always set X-T-URI "%{T_URI}e"
Header always set X-T-AE "[%{T_AE}e]"
Header always set X-T-Path "%{T_PATH}e"
Header always set X-T-FN "%{T_FN}e"
```

- 応答のヘッダは誰でも読める。絶対パス（`%{REQUEST_FILENAME}`・`%{DOCUMENT_ROOT}`）は、アカウント名を含むので、そのまま出さない
- 条件が合うかを確かめたいときは、`RewriteCond …` の後に `RewriteRule ^ - [E=T_X:1]` を置き、`X-T-X` が `1` か `(null)` かを見る

## 検査

| 検査                                       | 見るもの                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/htaccess.test.mjs`（`pnpm test`） | 範囲の正規表現（過去回・`/errorpage/`・`/img/` に掛からないこと）、CSP、HSTS、すべてのヘッダが `<If>` の中にあること、`ErrorDocument` が33本とも `/errors/` を指し、出力に無いページを指さないこと                                                           |
| `pnpm check:htaccess`                      | 手元の Apache 2.4 で、上位と archive 直下の2段の `.htaccess` を再現し、実際に返るヘッダを確かめる。存在しない URL（深い階層・過去回の中を含む）で 404 のエラーページ、拒否するフォルダで 403 のエラーページが、元のステータスとエラーページの CSP で返ること |
| `e2e/headers.e2e.mjs`（`pnpm test:e2e`）   | CSP を掛けたページが、掛けないときと同じに表示され、違反が出ないこと                                                                                                                                                                                         |
| `e2e/errors.e2e.mjs`（`pnpm test:e2e`）    | エラーページ33本が、エラーページの CSP で違反を出さないこと                                                                                                                                                                                                  |

- `pnpm check:htaccess` は `pnpm verify` と CI で流す。macOS は `/usr/sbin/httpd`、Ubuntu は `apache2` を使う
- わざと壊して確かめた: noindex の `unset` を消す・CSP のハッシュを変える・範囲の `<If>` を外す → どれも落ちる
