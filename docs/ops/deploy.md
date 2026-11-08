# さくらへの配置

新しいトップ（`dist/`）を、archive ホストの公開フォルダ（さくらの `~/www/archive`）へ置く手順。決定の経緯は Issue #1。

**さくらのサーバーには、オーナーの明示の指示があるときだけ書き込む**（AGENTS.md）。この手順の 3 以降は、指示を受けてから行う。

## 置くもの

`dist/` の中身を、公開フォルダの直下へ展開する。過去回のフォルダ（`/75th/`〜`/97th/`）・`errorpage/`・`todoroki/`・`tfa/` には触らない。

| パス                                    | 初回の配置（2026-11）  | 2回目から          |
| --------------------------------------- | ---------------------- | ------------------ |
| `index.html`・`robots.txt`・`.htaccess` | 旧トップのものを上書き | 前回のものを上書き |
| `en/`・`_astro/`                        | 新しく作る             | 丸ごと入れ替える   |
| `favicon.svg`・`sitemap.xml`            | 新しく作る             | 上書き             |

- `.htaccess` は `pnpm build` が作る（[htaccess.md](../design/htaccess.md)）。**HTML と `.htaccess` は必ず一緒に置く。** HTML だけを置き換えると、CSP のハッシュがずれてスタイルが当たらなくなる
- `_astro/` は、ファイル名に中身のハッシュが入る。フォルダごと入れ替えるので、古いファイルは残らない

## 道具

| 道具                                    | 動く場所 | すること                                                                                                                      |
| --------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm package`                          | 手元     | `dist/` を `release/archive-top-<コミット>.zip` にする。展開した中身を `dist/` と突き合わせ、手元の Apache でヘッダを確かめる |
| `scripts/ops/deploy/remote-deploy.sh`   | サーバー | チェックサムを確かめ、zip が書き込む先の控えを取ってから展開する                                                              |
| `scripts/ops/deploy/remote-rollback.sh` | サーバー | 控えから元に戻す                                                                                                              |
| `pnpm check:production`                 | 手元     | 本番のヘッダを、手元の Apache と同じ項目で確かめる（GET だけ）                                                                |

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

### 5. すぐ確かめる

```sh
pnpm check:production
```

- トップのページ（noindex が無い・CSP などが付く）、`/_astro/` のキャッシュ、OGP の画像の Content-Type、過去回（`/78th/`）に余計なヘッダが付かないこと、404 ページ、初期ドメイン経由、http→https の 302 を確かめる
- ブラウザで `/`・`/en/`・`/78th/`・`/96th/` を開き、表示が崩れていないこと、MENU と絞り込みが動くことを見る
- **1つでも落ちて、表示が壊れていたら、すぐ戻す**（下の「戻し方」）。原因はその後で調べる

### 6. 初回だけ: エラーページの PHP を片付ける（#2）

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

旧トップの `css/`・`js/`・`img/` を、公開フォルダの外へ移す。新しいトップは使っていない。

```sh
ssh setagayafes-archive 'sh -s' <<'EOF'
set -eu
cd ~/www/archive
# 旧トップ以外から参照されていないこと。HTML の href・src と、CSS の url() を見る
# （2026-11-07 には、絶対パスの参照は旧トップだけだった）。見つかったら、何も移さずに止まる
# BSD の grep は ./ を付けずに出すので、旧トップの index.html は両方の形で除く
others=$(grep -rIlE --exclude-dir=_astro '((href|src)=["'"'"']?|url\([[:space:]]*["'"'"']?)(\.\./|/|https?://archive\.setagayafes\.org/)(img|css|js)/' . | grep -vE '^(\./)?index\.html$' || true)
if [ -n "$others" ]; then
  echo "STOP: css/ js/ img/ are referenced from:"; echo "$others"; exit 1
fi
D=~/archive-docs/deploy/old-top
mkdir -p "$D"
mv css js img "$D/"
EOF
curl -sI https://archive.setagayafes.org/img/97th.png | head -1   # 404
```

- 旧トップ以外から参照されていれば、`STOP:` と参照元を出して、何も移さずに止まる。そのときはオーナーに相談する
- `/img/87th.JPG` は、`pnpm capture` が第87回の写真の取り元として指している（`scripts/lib/capture-targets.mjs`）。退避した後は取れない。写真の原画像は `src/assets/captures/87th.jpg` にあり、撮り直す必要は無い（全回を撮るときも、保存済みの写真は取り直さない）。取り直したいときは、`~/archive-docs/deploy/old-top/img/87th.JPG` から戻す

### 8. 記録する

Issue #1 に次を書く。

- 配置した zip の名前・コミット・sha256、控えの場所（`~/archive-docs/deploy/<日時>`）
- `pnpm check:production` の結果
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
- さくらは圧縮が効かない。`pnpm test:e2e` で測った転送量が、そのまま本番の値になる
- 同じアカウントに、他のホスト（about・blog・apply など）が同居している。`~/www/archive` の外には書き込まない
