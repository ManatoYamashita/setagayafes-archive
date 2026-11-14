# さくらへの配置

新しいトップ（`dist/`）を、archive ホストの公開フォルダ（さくらの `~/www/archive`）へ置く手順。決定の経緯は Issue #1。

**さくらのサーバーには、オーナーの明示の指示があるときだけ書き込む**（AGENTS.md）。この手順の 3 以降は、指示を受けてから行う。

## 置くもの

`dist/` の中身を、公開フォルダの直下へ展開する。過去回のフォルダ（`/75th/`〜`/97th/`）・`errorpage/`・`todoroki/`・`tfa/` には触らない。

| パス                                                 | 初回の配置（2026-11）  | 2回目から          |
| ---------------------------------------------------- | ---------------------- | ------------------ |
| `index.html`・`robots.txt`・`.htaccess`              | 旧トップのものを上書き | 前回のものを上書き |
| `index.html.gz`                                      | 新しく作る             | 上書き             |
| `en/`・`_astro/`                                     | 新しく作る             | 丸ごと入れ替える   |
| `favicon.svg`・`apple-touch-icon.png`・`sitemap.xml` | 新しく作る             | 上書き             |

- `.htaccess` は `pnpm build` が作る（[htaccess.md](../design/htaccess.md)）。**HTML と `.htaccess` は必ず一緒に置く。** HTML だけを置き換えると、CSP のハッシュがずれてスタイルが当たらなくなる
- `_astro/` は、ファイル名に中身のハッシュが入る。フォルダごと入れ替えるので、古いファイルは残らない

## 道具

| 道具                                    | 動く場所 | すること                                                                                                                      |
| --------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm package`                          | 手元     | `dist/` を `release/archive-top-<コミット>.zip` にする。展開した中身を `dist/` と突き合わせ、手元の Apache でヘッダを確かめる |
| `scripts/ops/deploy/remote-deploy.sh`   | サーバー | チェックサムを確かめ、zip が書き込む先の控えを取ってから展開する                                                              |
| `scripts/ops/deploy/remote-rollback.sh` | サーバー | 控えから元に戻す                                                                                                              |
| `pnpm check:production`                 | 手元     | 本番のヘッダを、手元の Apache と同じ項目で確かめる（GET だけ）                                                                |
| `pnpm check:production:browser`         | 手元     | 本番のトップをブラウザで開き、エラーが無いこと・MENU と絞り込みが動くことを確かめる（ページを開くだけ）                       |

- サーバーの2つのスクリプトは、zip の中に、過去回のフォルダ名・`errorpage`・`todoroki`・`tfa`・`img`・`css`・`js` や、`/` を含む変な名前があれば、何もせずに止まる
- 控えは `~/archive-docs/deploy/<日時>/`（公開フォルダの外。700）に残る。消さない

## 接続先

手順のコマンドは、SSH の接続先を別名 `setagayafes-archive` で書く。別名は各自の `~/.ssh/config` に置く。

```
Host setagayafes-archive
  HostName <サーバー名>
  User <アカウント名>
```

- `<サーバー名>`・`<アカウント名>` は、さくらのコントロールパネルのサーバー情報で確かめる。**このリポジトリには書かない**（公開されている。規約8節）。オーナーの手元の控えに置く
- `pnpm guard` は、リポジトリに `アカウント名@…sakura.ne.jp` の形の接続先があると落ちる
- 別名があることは `grep -n '^Host setagayafes-archive' ~/.ssh/config` で確かめる。`ssh -G` は、別名が無くても値を出すので確認に使えない
- サーバーのログインシェルは csh。`ssh setagayafes-archive 'echo $(…)'` のような書き方は `Illegal variable name.` で落ちる。サーバーで動かすものは `'sh -s' <` で流すか、`sh -c` で包む

## 手順

### 1. 手元で作る

```sh
git switch main && git pull --ff-only
git status --short          # 何も出ないこと（未コミットの変更から作った zip は名前に -dirty が付く。配置しない）
pnpm verify
pnpm check:links            # 過去回と外部リンクが応答すること（docs/ops/post-build-checks.md）
pnpm package                # release/archive-top-<コミット>.zip と .sha256
```

- `pnpm package` は、zip を展開した中身を手元の Apache で配信し、`.htaccess` のヘッダを確かめる（Issue #1 の「手元の httpd で zip を展開して検証する」）。落ちたら zip を消して止まる
- 手元で見た目も確かめる: `pnpm preview` で `/` と `/en/` を開く

### 2. Issue に予定を書く

Issue #1 に、配置する zip の名前・コミット・sha256 と、作業する時刻を書く。

### 3. 送る（ここからサーバーに書き込む）

```sh
ZIP=archive-top-<コミット>.zip
ssh setagayafes-archive 'mkdir -p archive-docs/deploy/inbox && chmod 700 archive-docs/deploy'
scp release/$ZIP release/$ZIP.sha256 setagayafes-archive:archive-docs/deploy/inbox/
```

### 4. 展開する

```sh
ssh setagayafes-archive "sh -s -- $ZIP" < scripts/ops/deploy/remote-deploy.sh
```

- 出力の最後に、控えの場所（`~/archive-docs/deploy/<日時>`）と戻し方が出る。`<日時>` を控えておく
- 同じ `<日時>` の控えが既にあれば、何もせずに止まる。元の控えを上書きしないため
- サーバーに既にあるフォルダは、過去の配置が作ったもの（控えの `entries.txt` にあるもの）でなければ入れ替えずに止まる（`.well-known` など、このリポジトリの外のフォルダを守るため）
- **展開の途中で落ちたら、流し直す前に、その `<日時>` の控えで先に戻す**（下の「戻し方」）。そのまま流し直すと、中途半端な状態が新しい控えとして記録され、元のトップに戻れなくなる
  - 落ちたかどうかは、`FAIL` の行と終了コードで判断する。`then: then/endif not found.` の行は落ちたしるしではない（下の「注意」）

### 5. すぐ確かめる

```sh
pnpm check:production
```

```sh
pnpm check:production:browser
```

- `check:production`: トップのページ（noindex が無い・CSP などが付く・gzip を受け付けると `.gz` を返し、展開すると同じページになる・`.gz` を直接開くと 404）、`/_astro/` のキャッシュ、OGP の画像の Content-Type、過去回（`/78th/`）に余計なヘッダが付かないこと、404 ページ、初期ドメイン経由、http→https の 302 を確かめる
- `check:production:browser`: Playwright の Chromium で、1ページずつ順に開いて確かめる（ページを開くだけ）
  - `/`・`/en/`・`/78th/`・`/96th/` が 200 を返す
  - `/`・`/en/` で、最後までスクロールしても、コンソールのエラー・4xx/5xx の応答・失敗したリクエストが0件
  - `/` で MENU（`#site-menu`）が開き、閉じる。時代の絞り込みを切り替えると、表示されるカードの数が変わる
- 2つとも `ok` なら、ブラウザで目で見る確認は要らない。見た目の崩れ（重なり・はみ出し）は検査していないので、気になる変更を配置したときは開いて見る
- **1つでも落ちて、表示が壊れていたら、すぐ戻す**（下の「戻し方」）。原因はその後で調べる
- クラウド環境から流したときは、「http:// redirect」の項目だけは必ず落ちる。暗号化しない `http://` の通信が外へ出られないため（[cloud-environment.md](./cloud-environment.md)）
  - この項目が落ちたことだけを理由に戻さない。他の項目がすべて ok なら、手元の端末で確かめ直す
  - 手元では `pnpm check:production` を流し直す。補助に `curl -sSI http://archive.setagayafes.org/` で、302 と `Location: https://archive.setagayafes.org/` を見る
  - 手元でも落ちたら、先にプロキシと VPN を外して流し直す。それでも落ちるなら、コントロールパネルの常時 SSL 化の設定を疑う
  - 2026-11-14、#40 の配置をクラウド環境で確かめたとき、14 項目は ok でこの項目だけ確かめられなかった。手元の Mac（プロキシ・VPN 無し）から流し直し、15 項目すべて ok だった

### 6. 初回だけ: エラーページの PHP を片付ける（#2）

**2026-11-08 に済んだ。** 41本を `~/archive-docs/quarantine-20261106/errorpage-php/` へ移し、archive 配下の PHP は0本になった。2回目からの配置では行わない。

新しい `.htaccess` で、`ErrorDocument` は静的な `/errorpage/NNN.html` を指すようになった。PHP の版を公開フォルダの外へ移す。

```sh
# 404 の本文が、静的な 404.html と同じこと
curl -s https://archive.setagayafes.org/no-such-page/ | cmp - <(ssh setagayafes-archive 'cat www/archive/errorpage/404.html') && echo same

ssh setagayafes-archive 'sh -s' <<'EOF'
set -eu
D=~/archive-docs/quarantine-20261106/errorpage-php
mkdir -p "$D"
mv ~/www/archive/errorpage/*.php "$D/"
echo "php files left in archive: $(find ~/www/archive -name '*.php' -type f | wc -l)"
EOF
```

- 最後の行が 0 であることを確かめ、#2 に記録する（#2 の完了条件）
- 移した後に、もう一度 `pnpm check:production` を流す

### 7. 初回だけ: 旧トップの部品を退避する（Issue #1 の ToDo）

**2026-11-08 に済んだ。** `css/`・`js/`・`img/` を `~/archive-docs/deploy/old-top/` へ移した。2回目からの配置では行わない。

旧トップの `css/`・`js/`・`img/` を、公開フォルダの外へ移す。新しいトップは使っていない。

```sh
ssh setagayafes-archive 'sh -s' <<'EOF'
set -eu
cd ~/www/archive
# 旧トップ以外から参照されていないこと。HTML の href・src と、CSS の url() を見る。
# 1. 参照らしいものを持つファイルを grep で挙げる（BSD の grep は ./ を付けずに出すので、
#    旧トップの index.html は両方の形で除く。相対パスは ../../img/ のように何階層でも拾う）
# 2. 相対パスを、そのファイルの場所から実際のパスへ解決する。ルートの /img/・/css/・/js/ を
#    指すものだけを数える（例: /89th/common/style/default.css の ../img/ は /89th/common/img/）
# 見つかったら、何も移さずに止まる
# case のパターンは (…) と開き括弧から書く。$( ) の中で ) を置換の終わりと取り違えるシェルがあるため
PATTERN='((href|src)=["'"'"']?|url\([[:space:]]*["'"'"']?)((\.\./)+|/|https?://archive\.setagayafes\.org/)(img|css|js)/[^"'"'"' )]*'
candidates=$(mktemp)
grep -rIlE --exclude-dir=_astro "$PATTERN" . | sed 's#^\./##' | grep -vE '^index\.html$' > "$candidates" || true
hits=$(while IFS= read -r f; do
  dir=$(dirname "$f")
  grep -oE "$PATTERN" "$f" | sed -E 's/^(href|src)=["'"'"']?//; s/^url\([[:space:]]*["'"'"']?//' | sort -u | while IFS= read -r ref; do
    case $ref in
      (http*) abs=$(echo "$ref" | sed -E 's#^https?://archive\.setagayafes\.org##') ;;
      (/*) abs=$ref ;;
      (*) d=$dir; r=$ref
         while case $r in (../*) true ;; (*) false ;; esac; do
           r=${r#../}; case $d in (*/*) d=${d%/*} ;; (*) d="" ;; esac
         done
         abs="/${d:+$d/}$r" ;;
    esac
    case $abs in (/img/* | /css/* | /js/*) echo "$f -> $ref" ;; esac
  done
done < "$candidates")
rm -f "$candidates"
if [ -n "$hits" ]; then
  echo "STOP: css/ js/ img/ at the root are referenced from:"; echo "$hits"; exit 1
fi
echo "ok   no page refers to the root css/ js/ img/"
D=~/archive-docs/deploy/old-top
mkdir -p "$D"
mv css js img "$D/"
EOF
curl -sI https://archive.setagayafes.org/img/97th.png | head -1   # 404
```

- ルートの `css/`・`js/`・`img/` を指す参照があれば、`STOP:` と参照元を出して、何も移さずに止まる。そのときはオーナーに相談する
- 2026-11-08 に流したときは、相対パスを解決する前の版（grep だけ）が、各サイト自身の `img/`・`css/` を指す36ファイル（130件）で止まった（誤検知）。上の版は、解決してからルートを指すものだけで止まる
  - 上の版は、仮のフォルダで sh・dash・bash の3つで確かめ（各サイト自身の `../img/` では止まらず、`../../img/`・`url("/img/…")`・`/78th/` からの `../css/`・絶対 URL では止まる）、判定の部分を本番の FreeBSD の `sh` でも流した（2026-11-08。ルートを指す参照は0件）
- 全ファイルを読むので、6〜7分かかる。`grep: ./78th/93rd/…: No such file or directory` と出るのは、遮断してある `78th/93rd/` の中の行き先の無いリンクで、判定には影響しない
- `/img/87th.JPG` は、`pnpm capture` が第87回の写真の取り元として指している（`scripts/lib/capture-targets.mjs`）。退避した後は取れない。写真の原画像は `src/assets/captures/87th.jpg` にあり、撮り直す必要は無い（全回を撮るときも、保存済みの写真は取り直さない）。取り直したいときは、`~/archive-docs/deploy/old-top/img/87th.JPG` から戻す

### 8. 記録する

Issue #1 に次を書く。

- 配置した zip の名前・コミット・sha256、控えの場所（`~/archive-docs/deploy/<日時>`）
- `pnpm check:production` と `pnpm check:production:browser` の結果
  - 「http:// redirect」を手元で確かめ直したとき（5 を参照）は、配置の記録へのリンクを付けて、補足のコメントとして書く。流した環境と、プロキシ・VPN の有無も書く
- Lighthouse（モバイル。性能・アクセシビリティ・おすすめの方法・SEO）を、手元（`pnpm preview`）と本番の両方で、Chrome の DevTools で測った値（[post-build-checks.md](./post-build-checks.md)）

## 戻し方

```sh
ssh setagayafes-archive 'sh -s -- <日時>' < scripts/ops/deploy/remote-rollback.sh
pnpm check:production   # 戻した後は、旧トップに戻っているので「新しいトップが無い」で止まる
```

- 配置で新しくできたもの（初回なら `en/`・`_astro/`・`favicon.svg`・`sitemap.xml`）は消え、上書きしたもの（`index.html`・`robots.txt`・`.htaccess`）は控えから戻る
- 6・7 を済ませた後で戻すときは、先にそれぞれを戻す（`errorpage-php/` の PHP を `errorpage/` へ、`old-top/` の3つを公開フォルダへ）。旧 `.htaccess` は PHP のエラーページを指しているため

## 注意

- サーバーは FreeBSD で、ログインシェルは csh。スクリプトは `ssh … 'sh -s' < スクリプト` で流す（`<( )` は使えない）
- `ssh setagayafes-archive …`・`scp` を流すたびに、`then: then/endif not found.` の行が出る。ログインシェル（csh）の初期化ファイルの書き間違いから出ているとみられる（原因は確かめていない）。送信・展開・`pnpm check:production` には影響しない（2026-11-14 の配置で確かめた）ので、無視して進める
  - 成否は、各スクリプトの最後の `ok` の行（展開は `ok   extracted …`、戻しは `ok   rolled back …`）と終了コード（直後の `echo $?` が `0`）で判断する。`FAIL` の行が出るか、終了コードが `0` でなければ失敗
  - この行だけを理由に、控えで戻さない
  - 初期化ファイルは直さない。サーバーへの書き込みで、`~/www/archive` の外にあり、同じアカウントの他のホストにも効くため。直すなら、別の Issue でオーナーの指示を取ってから行う
- さくらは `mod_deflate` が効かない。トップの HTML だけは、ビルドで作った `.gz` を返す（[htaccess.md](../design/htaccess.md)）。`pnpm test:e2e` は非圧縮のバイト数で測るので、本番の転送量はそれ以下になる
- 同じアカウントに、他のホスト（about・blog・apply など）が同居している。`~/www/archive` の外には書き込まない
- 数分かかる処理（公開フォルダ全体の `grep`・`find` など）は、接続が切れても止まらない形で流す
  - 読み取りだけの処理: `ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=20 setagayafes-archive …` で接続を保つ
  - 書き込む処理（ファイルの移動など）: スクリプトを公開フォルダの外（`~/archive-docs/…`）に置き、`nohup sh <スクリプト> > <ログ> 2>&1 &` で流す。終わったらログを読む
  - 理由: 2026-11-09、公開フォルダ全体の `grep`（約10分）の途中で SSH が切れ（`Operation timed out`）、結果が出なかった。書き込みの途中で切れると、一部だけ移った状態が残る
