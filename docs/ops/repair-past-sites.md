# 過去回のサイトの壊れを直す

過去回のサイト（`~/www/archive/<回>/`）のうち、当時は表示できていたのに今は壊れているものを直す手順と道具。直した記録と、直せなかったものの一覧は Issue #3。

- 直すのは「壊れ」だけ。当時の誤記や当時の内容は、資料としてそのまま残す
- サーバーへの書き込みは、オーナーの明示の指示があるときだけ（AGENTS.md）。ほかのセッションが同じフォルダに触っていないかを先に確かめ、書き込む範囲を伝える
- archive 直下の `.htaccess` には触らない（`pnpm build` が作る。[htaccess.md](../design/htaccess.md)）

## 壊れの種類と直し方（2026-11-08〜09 に行ったもの）

| 種類                                 | 原因                                                                                                                                      | 直し方                                                                                           | 道具                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------- |
| 旧ドメインへの参照                   | 各回のサイトは `https://setagayafes.org/<回>/` にあった。そのドメインは今、最新の回のサイトを返す。ブラウザは画像や CSS を ORB で遮断する | `https://archive.setagayafes.org/<回>/…` へ向け直す                                              | `scripts/ops/rehost-old-domain.mjs`   |
| サイトの外へ出る相対パス             | HTTrack は `//fonts.googleapis.com/css?…` などを `../../css?family=…` に書き換えた。archive では 404                                      | Web フォントとアイコンのフォントだけ、元の配信元に戻す。X の埋め込み・解析タグ・統計は戻さない   | `scripts/ops/restore-cdn-refs.mjs`    |
| CSS 変数の中の相対パス               | WordPress のテーマがページの `<style>` に `--x: url(wp-content/…)` と書く。変数を使う CSS の場所から解決され、パスが二重になる            | `/<回>/wp-content/…` の絶対パスにする                                                            | `scripts/ops/absolutize-css-vars.mjs` |
| http の外部ファイル（Mixed Content） | https の archive から http のファイルを読むと、ブラウザが遮断する                                                                         | https で同じファイルを配信しているものだけ、`https://` に変える                                  | 手で1か所ずつ                         |
| 欠けたファイル                       | 静的化のときに取りこぼした、または当時からのサーバーの整理で消えた                                                                        | 同じファイルが残っていれば足す。取り元は Wayback Machine、プラグインやライブラリの同じ版の配布物 | 手で1件ずつ                           |
| 文字コード                           | 保存し直したときに、Shift_JIS のファイルが UTF-8 として読まれた                                                                           | 元のバイトが残っていれば戻す。失われていれば、原本（`.bak` など）を使うかをオーナーが決める      | 手で1件ずつ                           |

## 道具（どれも手元で動かす。サーバーでは動かさない）

3つとも、手元に写した各回のテキストのファイル（`.htm`・`.html`・`.css`・`.js` など）を読み、変えたファイルだけを出力先に書く。サーバーへは、その出力だけを送る。

```sh
# 写す（テキストのファイルだけ）と、サーバーにある全ファイルの一覧
rsync -a --include='*/' --include='*.htm' --include='*.html' --include='*.css' --include='*.js' \
  --include='*.xml' --include='*.json' --exclude='*' --prune-empty-dirs \
  setagayafes-archive:www/archive/90th/ mirror/90th/
ssh setagayafes-archive 'sh -s' <<< "cd ~/www/archive/90th && find . -type f | sed 's#^\./##'" > mirror/90th.files

node scripts/ops/rehost-old-domain.mjs 90th mirror/90th mirror/90th.files out/90th
node scripts/ops/restore-cdn-refs.mjs mirror/90th out-b/90th
node scripts/ops/absolutize-css-vars.mjs 95th mirror/95th out-css/95th
```

- `rehost-old-domain.mjs`
  - HTTrack が `style.css?ver=2.1.0` を `style3c94.css` のように保存した対応を、コピー自身の参照から引く
  - ページは `<!-- Mirrored from … -->` の書き残しから引く
  - `srcset` の候補のうち archive に実体が無いものは取り除く。ブラウザは `src`（手元のファイル）を使う
  - 出力の JSON に、向け直した先の内訳（`file`・`page`・`folder`・`hashed`・`missing`）が出る。`missing` は、WordPress の動的な入口（`wp-admin`・`wp-json`）や `<meta>` の画像が大半で、表示に関わらないことを確かめる
- `restore-cdn-refs.mjs`: サイトのフォルダより上へ出る相対パスだけを変える。サイト自身の `css/` などは指さない
- `absolutize-css-vars.mjs`: サイトのフォルダの中を指すものだけを変える

## サーバーへ送る段取り

1サイトずつ、次の順で行う。途中の確かめで合わなければ、送らずに止まる。

1. 写す（上のとおり）
2. 道具で変え、出力の JSON と差分を確かめる
3. 変えるファイルの控えを、元のフォルダ構成のまま `~/archive-docs/issue3/<回>/before/` に取る（`rsync --files-from`）
4. 控えの sha256 が、手元の写しと同じことを確かめる（写した後に、誰もサーバーのファイルを変えていない）
5. 変えたファイルだけを `rsync -rt --files-from` で送り、パーミッションを 644 にする
6. サーバーのファイルの sha256 が、手元の出力と同じことを確かめる
7. Chromium で開き、遮断・404・出ない画像の数を、直す前と比べる

- 欠けたファイルを足すときは、同じ名前のファイルが既にあれば止める（上書きしない）。取り元は `~/archive-docs/issue3/<回>/d/added.txt` に書く
- 戻すときは、控えのファイルを同じパスへ送り返す

## つまずいた点

1. **macOS の rsync（2.6.9）は `--chmod` を受け付けない。** 送った後に、サーバーで `chmod 644` する
2. **手元の zsh は、変数の中の空白で引数を分けない。** URL の一覧を変数に入れて渡すと、1つの引数になる。1つずつ書くか、配列を使う
3. **サーバーのログインシェルは csh。** `ssh … "sh -c '…\$(…)…'"` は引用符が崩れる。`ssh … 'sh -s' <<'EOF'` で流す
4. **URL の中の日本語は `%e3%80%90…` と符号化されている。** サーバーのファイル名（UTF-8）と照らし合わせるときは、復号してから比べる
5. **フォルダの入口が `index.htm` のサイトがある**（第94・95回）。`index.html` だけを見ると、無いと誤って数える
6. **数分かかる処理は、SSH の接続を保つ設定で流す**（[deploy.md](./deploy.md)）。第89回（約1,950ファイル）は数分かかった
7. **Wayback Machine の検索窓口は、ときどき止まる**（「Temporarily Offline」の HTML が返る）。時間をおいて、間を空けて問い合わせる

## 直した後

- トップの見た目が変わった回は、`pnpm capture <回>` で撮り直し、前後を `scripts/ops/compare-pages.mjs diff` で並べて確かめてから PR に入れる（[capture.md](./capture.md)）
- 撮り直した写真は、次の配置で本番のトップに出る（[deploy.md](./deploy.md)）
