# 旧 WordPress・自作 PHP のサイトを静的化する

サーバー上で動き続けている過去回のサイトを、表示を変えずに静的 HTML へ置き換え、PHP と DB を撤去する手順。
2026-11-06 に7サイトで実施した。経緯と結果は [Issue #2](https://github.com/ManatoYamashita/setagayafes-archive/issues/2) を参照。
置き換えた後の確認（検索・RSS・コメント欄の撤去、旧ドメインの画像の点検）は [static-archive-checks.md](./static-archive-checks.md) を参照。

接続情報と、サーバー上の作業場所は書かない（このリポジトリは公開されている）。

## なぜ静的化するのか

archive のホストには、全サービスが1つのアカウントに同居している。
DB につながった PHP が1本でも残っていると、そこが破られたときに全サイトへ被害が及ぶ。
アーカイブになった回に、動く仕組みは要らない。

## 道具

| ファイル                                       | 実行場所 | 役割                                                                                             |
| ---------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `scripts/ops/wp2static/crawl.sh`               | サーバー | `wget` で HTML を巡回する。サイトマップの URL 一覧を起点にできる                                 |
| `scripts/ops/wp2static/build-static.sh`        | サーバー | 静的ファイルを `rsync` で複製し、巡回結果を重ね、`.htaccess` を作る                              |
| `scripts/ops/wp2static/strip-dynamic-links.sh` | サーバー | `<head>` から、フィード・REST・oEmbed・RSD・短縮リンクへの参照を除く（`build-static.sh` が呼ぶ） |
| `scripts/ops/wp2static/rehost.sh`              | サーバー | 旧ホスト・旧ドメインを指す絶対 URL を、新しい置き場所へ書き換える                                |
| `scripts/ops/wp2static/dump-db.sh`             | サーバー | 該当の接頭辞のテーブルだけを控える。資格情報は画面に出さない                                     |
| `scripts/ops/wp2static/spider.sh`              | サーバー | 置き換えた後のリンク切れを数える                                                                 |
| `scripts/ops/compare-pages.mjs`                | 手元     | 置き換えの前後の撮影・画素の比較・差分の画像                                                     |

サーバーの `wget`・`rsync`・`perl`・`mysqldump`・`php` を使う。シェルは csh なので、スクリプトは `sh` で動かす。

## 手順

1つのサイトを、次の順で最後まで終えてから次へ進む。小さいサイトから始める。

1. **調べる**: WordPress の版・容量・プラグイン・パーマリンクの形・ページ数を見る。
   ページ数は `wp-sitemap.xml`（WordPress 標準）か REST API の `X-WP-Total` で数える。
   **トップから辿るだけだと取りこぼす**（第13回 等々力祭は 344 URL のうち 28 しか辿れなかった）。
2. **before を撮る**: 主要ページを `compare-pages.mjs shoot` で撮る。失敗したリソースも `report.json` に残る。
3. **巡回する**: `crawl.sh <開始URL> <cut-dirs> <作業フォルダ> <ドメイン> [URL一覧]`。
   クエリ付きの URL と、ログイン・REST・フィードは除いている。
   サイトマップの URL を全部集めて一覧に渡し、取れたファイルと突き合わせて漏れが0であることを確かめる。
4. **組み立てる**: `build-static.sh <WordPressのフォルダ> <巡回結果> <出力先> <公開パス>`。
   PHP・設定・バックアップ・ログ・`*.sh` は複製しない。出力に PHP が0本であることを表示で確かめる。
5. **置き場所が変わるなら書き換える**: `rehost.sh <出力先> <旧ホスト> <新しいURL>`。
   旧ドメインを指す画像（`setagayafes.org/93rd/…`・`todorokifes.com/…` など）も、archive に実体があれば同じ方法で向け直す。
6. **DB を控える**: `dump-db.sh <WordPressのフォルダ> <出力.sql.gz>`。控えは公開フォルダの外に置く。
7. **置き換える**: 公開中のフォルダを公開フォルダの外へ `mv` し、出力先を同じ場所へ `mv` する。
   同じディスク上の移動なので一瞬で終わり、戻すのも逆向きの `mv` で済む。削除はしない。
8. **after を撮って比べる**: `shoot` で同じページを撮り、`compare` で差を出す。
   差が 0.5% を超えたページは `diff` の画像を目で見る。失敗したリソースの集合も before と比べる。
9. **リンク切れを数える**: `spider.sh <公開URL> <作業フォルダ> <ドメイン>`。
   WordPress は旧スラッグを自動で転送していたので、見つかったら `.htaccess` に `Redirect 301` を1行足す。
10. **ホスト名を転送する**（専用のホスト名があった回だけ）: そのホストの公開フォルダを、
    `RewriteRule ^(.*)$ https://archive.setagayafes.org/<置き場所>/$1 [R=301,L]` だけのフォルダに入れ替える。
11. **記録する**: Issue に、ページ数・比較の結果・残った壊れを書く。

DB 自体の削除は、静的版が2週間問題なく動いてから行う。
等々力祭の DB は1つの DB を回ごとの接頭辞で共有しているので、DB ごとではなく接頭辞単位で消す。

## 自作 PHP のサイト（第82回・第84回）

`include` でヘッダーとフッターを組むだけの PHP なら、WordPress と同じ手順で静的化できる。
ただし URL が `/82nd/theme.php` のように `.php` で公開されているので、次の形で URL を保つ。

- 書き出した HTML は `<名前>_php.html` として置く
- `.htaccess` に `RewriteRule ^(.+)\.php$ $1_php.html [L]` と `DirectoryIndex index.html index_php.html` を書く
- そのサイトの `.htaccess` では、`FilesMatch` の拒否の対象から `php` を外す（下の「つまずいた点」の2と3）

## つまずいた点

1. **撮影が画像の読み込みを待たないと、偽の差が出る。** `compare-pages.mjs` は、すべての `<img>` の読み込み完了を待ってから撮る。
2. **`FilesMatch` による拒否は、`.htaccess` の書き換えより先に、元の URL に対して判定される。**
   `.php` を拒否していると、`theme.php` を HTML へ振り替える前に 403 になる。
3. **Apache はファイル名に含まれる拡張子をすべて見る。** `theme.php.html` も PHP として実行されて 500 になる。
   書き出した HTML のファイル名に `.php.` を含めない。
4. **旧ドメインの画像は、置き換える前から壊れていることがある。**
   `src` が旧ドメイン、`srcset` が archive を指しているページでは、ブラウザが `srcset` を選んだときだけ表示される。
   旧ドメインが Vercel（第97回のサイト）なら、ボット判定の 403 で表示が揺れる。`rehost.sh` で archive を直接指す。
5. **サーバーの `tar` はロケールが無いと、日本語のファイル名で警告を出す。** 複製は `rsync` で行う（名前をバイト列のまま写す）。
6. **権限 `000` のフォルダ**（止めたプラグインなど）で `find` が失敗する。`build-static.sh` は読めないフォルダを飛ばし、記録に残す。
7. **`wget --spider` は、クエリ付きの URL を誤ってリンク切れと報告することがある。** 報告された URL は `curl` で確かめる。
8. **手元のシェルが zsh なら、`for s in $list` は改行で分割されない。** URL 一覧を作るときは `while read -r` を使う。
