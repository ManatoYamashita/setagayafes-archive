# 規約

このリポジトリで守る決まりと、その理由をまとめる。決定の経緯は Issue #1 が正本。
機械で検査できるものは検査で落とす。各項目の末尾に、どの検査が担当するかを書く。

## 1. ブラウザへ JavaScript を送らない

- `client:*` ディレクティブ（`client:load`・`client:visible` など）を使わない
- `<script>` を書かない（`is:inline` も含む）
  - 例外は JSON-LD（`<script type="application/ld+json">`）だけ。データであって、実行されるコードではないため
  - ソースに書けるのは `<script type="application/ld+json" set:html={変数} />` の形だけ。値は TypeScript で作った変数に限り、テンプレートの中で式を組まない（`pnpm guard`・ESLint が、これ以外の `<script>` を落とす。`astro/no-set-html-directive` は、その1行だけ理由を付けて外す）
  - 例外になるのは、`type` 属性の値が `application/ld+json` と完全に一致するときだけ（大文字と小文字は区別しない。前後の空白も許さない）。
    `data-type` などの別の属性は数えない。`type` が2つあれば、ブラウザと同じく先の1つだけを見る
- インラインのイベントハンドラ（`onclick=` など）と、スクリプトを実行する URL（`javascript:`・`vbscript:`・`data:text/html`）を使わない
- `srcdoc` の中身も同じ規則で検査する
- UI ランタイム（React・Preact・Vue・Svelte・Solid・Alpine・Lit）とその Astro 統合を入れない
- 動きのある UI は HTML と CSS の標準機能で作る
  - MENU: `popover` または `<details>`
  - 絞り込み: radio ＋ `:has()`

- 過去回のサイトを iframe で埋めるときは、`sandbox` に `allow-same-origin` を付けない（プレビュー。[screen.md](../design/screen.md)）
  - 過去回のサイトは同じホストにあり、古い JS が動く。同じオリジンのまま埋めると、その JS がこのページを操作できてしまう

**理由:** CSP を `script-src 'none'` で運用する。JS が0なら、XSS の影響を構造的に断てる。
転送量の予算（後述）も守りやすい。

Astro は小さなスクリプトを `.js` ファイルにせず、HTML へインラインで埋め込む。
そのため「`.js` ファイルが無いこと」だけでは検査にならない。ビルド後の HTML の中まで見る。

HTML は文字列の一致ではなく、`scripts/lib/html.mjs` の tokenizer で、ブラウザと同じようにタグと属性に分けてから判定する。
文字列の一致では、`data-type` の中の `type`、引用符の中の `>`、`/` で区切った属性（`<img/onerror=…>`）、
文字参照で隠した URL（`jav&#x61;script:`）を取り違える（PR #4 のレビューで指摘された）。

ブラウザが markup として解釈するファイルは、拡張子が `.html` でなくても検査する。
対象は `.html`・`.htm`・`.xhtml`・`.xht`・`.shtml`・`.svg`・`.xml`・`.xsl`・`.xslt`。
中身を読めない `.svgz` は公開禁止にしている。

**検査:**

| 検査                                            | 見るもの                                                    |
| ----------------------------------------------- | ----------------------------------------------------------- |
| ESLint（`no-restricted-syntax`）                | エディタ上の `.astro`                                       |
| `pnpm guard`                                    | `src/` の生のソースと `package.json`                        |
| `pnpm build` の後段（`scripts/guard-dist.mjs`） | `dist/` の markup（HTML・SVG・XML）と、`.js` ファイルの有無 |

## 2. 公開フォルダに置いてはいけないファイル

次のものは、`public/`・`dist/`・サーバーの公開フォルダ（`~/www` の下）のどれにも置かない。

- DB のダンプ（`*.sql`・`*.sql.gz`・`*.dump` など）
- バックアップ・一時ファイル（`*.bak`・`*.old`・`*.orig`・`*~`・`*.swp` など）
- アーカイブ（`*.zip`・`*.tar.gz` など。中身がバックアップであることが多い）
- ログ（`*.log`、拡張子の無い `access_log`・`access_log_20261105`・`error_log`・`ssl_request_log` など）
- 表計算のファイル（`*.xls`・`*.xlsx`・`*.csv`）。個人情報を含むことがあるため
- サーバー側のコード（`*.php`・`*.cgi`・SSI の `*.shtml` など）と `.env`
- 圧縮した SVG（`*.svgz`）。中身のスクリプトを検査できないため
- OS と編集ソフトの副産物: `.DS_Store`・`Thumbs.db`・`desktop.ini`・FrontPage の管理フォルダ（`_vti_cnf/`・`_vti_pvt/` など `_vti_*`）
  - `Thumbs.db` には、サイトから消した画像の縮小版が残りうる。FrontPage の管理情報には、制作者の PC のアカウント名が残る
- `.git/`

**理由:** このホストの公開フォルダでは、過去に上記のようなファイルが公開状態で見つかっている
（Issue #2 の経緯）。公開してはいけない控えは、サーバー上でも公開フォルダの外に置く。

**検査:**

| 検査                | 見るもの                                   |
| ------------------- | ------------------------------------------ |
| `pnpm guard`        | `public/`                                  |
| `pnpm build` の後段 | `dist/`                                    |
| `.gitignore`        | 主な拡張子をコミットできないようにしている |

## 3. HTTP ヘッダは新トップの範囲にだけ付ける

- セキュリティヘッダ（CSP・`X-Content-Type-Options`・`Referrer-Policy`・`Permissions-Policy`・COOP）は、
  このリポジトリが出力するパス（`/`・`/en/` と、その付属ファイル）にだけ付ける
- archive ホストのルートの `.htaccess` に、**無条件で**ヘッダを書かない

**理由:** ルートの `.htaccess` の設定は、配下の過去回のサイト（`/78th/` など）へ継承される。
過去回のサイトはインラインの JS や外部の埋め込みを使っている。そこへ CSP が掛かると表示が壊れる。

- HSTS は archive ホストにだけ付ける。`includeSubDomains` は付けない
- noindex は上位フォルダと archive 直下の2箇所で付いている。`/` と `/en/` だけを、両方で除外する

- 範囲は `<If "%{REQUEST_URI} =~ m#…#">` で限る。対象のパスは `dist/` の中身から作る（`dist/.htaccess` はビルドで生成する）
  - 詳しい書き方と理由は [htaccess.md](../design/htaccess.md)
- archive 直下の `.htaccess` は、このリポジトリが正本。サーバーの上で直接書き換えない

**検査:**

| 検査                                       | 見るもの                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `scripts/htaccess.test.mjs`（`pnpm test`） | 生成する `.htaccess` の中身（範囲の正規表現・CSP・HSTS・ヘッダがすべて `<If>` の中にあること） |
| `pnpm check:htaccess`                      | 手元の Apache で、上位と archive 直下の2段の `.htaccess` を再現し、返るヘッダを確かめる        |
| `e2e/headers.e2e.mjs`（`pnpm test:e2e`）   | CSP を掛けた状態で、ページが同じに表示され、違反が出ないこと                                   |

## 4. 出力を過去回のフォルダと衝突させない

`dist/` の中身は、archive ホストの公開フォルダへ、過去回のフォルダ（`/75th/`〜`/97th/`・`/96th/` など）と
並べて置く。

- 出力するパスに、過去回のフォルダ名を使わない
- 配置するとき、既存のフォルダを消したり上書きしたりしない

## 5. デザイン

- 色はモノクロだけにする。トークンは `src/styles/global.css` の `@theme` に置き、
  Tailwind の既定のカラーパレットは無効にしている
- フォントはシステムフォントだけにする。Web フォントは読み込まない
- 欧文の大きな見出しは `--font-display`（Futura 系を先頭に並べたシステムフォント）で組む。これもダウンロードはしない
- 参考デザインは第三者のもの（Issue #1 のテンプレート、Issue #30 のオウンドメディアのトップ）。画像も、そこから切り出したものもコミットしない
  - 手元で使うときは `/reference/` に置く（`.gitignore` 済み）
  - 写すのはレイアウトと視覚の文法だけにする。参考元の社名・ロゴ・写真・配色は使わない（[screen.md](../design/screen.md) の「参考画像からの置き換え」）

## 6. 性能の予算

| 項目                   | 予算           |
| ---------------------- | -------------- |
| 初回表示の転送量       | 200KB 以下     |
| ページ全体の転送量     | 1MB 以下       |
| Lighthouse（モバイル） | 全カテゴリ 100 |

- さくらでは圧縮が効かない（実測済み）。予算は**非圧縮のバイト数**で測る（1KB = 1,000 バイト）
- **初回**は、HTML などの画像以外のものと、最初の画面に写る `<img>` の画像。画面の下の画像をブラウザが先回りして読み込む分は数えない
- **全体**は、開いたままの状態で最後までスクロールして読み込まれるもの全部。絞り込みの切り替えで取り直す画像は数えない（参考値として測る）
  - 初回と全体の定義は、2026-11-07 にオーナーが決めた。測り方は [post-build-checks.md](../ops/post-build-checks.md)
- ページの CSS は HTML にインラインで入れる（`build.inlineStylesheets: "always"`）。
  リクエストを1本減らすため

**検査:**

| 検査                                    | 見るもの                                                             |
| --------------------------------------- | -------------------------------------------------------------------- |
| `pnpm test:e2e`（`e2e/budget.e2e.mjs`） | 8つの画面で、初回と全体のバイト数                                    |
| 手動                                    | Lighthouse（依存を足さないため。手元と本番で測り、Issue に記録する） |

## 7. 依存パッケージ

- 外部ライブラリを足すときは、目的・代替案・影響（サイズ）を示して、オーナーの承認を取る
- 版は完全に固定する（`pnpm add -E`）
- Playwright（devDependencies）は、サムネイルの撮影（`pnpm capture`）と e2e テスト（`pnpm test:e2e`）にだけ使う。撮影は Issue #1 の決定、e2e は PR #7 による
  - ブラウザは `pnpm exec playwright install --only-shell chromium` で別に入れる
  - CI は e2e のためにだけ入れる。撮影は CI では行わない
- 画像の変換は Astro が同梱する sharp で、`astro:assets` を通して行う。sharp を直接 import しない
- TypeScript は 6 系に固定している。`@astrojs/check` と `typescript-eslint` が 7 に未対応のため
- `@emnapi/runtime` は `pnpm.overrides` で 1.11.3 に固定している
  - 自動で入る peer に 2.0 の beta が選ばれると、`@emnapi/core` 1.x と混在する
  - 混在すると、`astro check` が読み込みの段階で落ちる
  - 上流が揃ったら外してよい。外すときは `pnpm check` が通ることを確かめる

## 8. サーバーとの関わり

- さくらのサーバーには、オーナーの明示の指示があるときだけ書き込む（読み取りは可）
- 接続情報や、公開してはいけない調査の記録は、このリポジトリに書かない
  - SSH の接続先は、手順書でも別名 `setagayafes-archive` で書く。中身は各自の `~/.ssh/config` に置く（[deploy.md](../ops/deploy.md)）
  - #21 で `<アカウント名>@<サーバー名>` を手順書に書いてしまった。今の版からは消したが、Git の履歴には残っている

**検査:** `pnpm guard` が、リポジトリのテキストのファイルに `<アカウント名>@<…>.sakura.ne.jp` の形の接続先があると落ちる
