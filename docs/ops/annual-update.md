# 年次の追加（新しい回を足す）

毎年、新しい回のサイトを archive に加え、トップの一覧に1件足す手順。Issue #1 の決定「データファイルに1件追加＋撮影スクリプトを1回」に沿う。

例は第98回（2027年）。

## 前提

- 新しい回のサイトが、archive ホストのフォルダ（`~/www/archive/98th/`）に置かれていること
  - サイトの移し替え（静的化を含む）は、このリポジトリの外の作業。動的なサイトなら [wp-to-static.md](./wp-to-static.md) の手順で静的にしてから置く
  - フォルダ名は、序数の英語表記（`98th`）。データの `pathOf()` がこの名前を導く
- `https://archive.setagayafes.org/98th/` がブラウザで開けること
- 新しい回のフォルダに、編集ソフトやOSの副産物と、公開してはいけないファイル（[conventions.md](../rules/conventions.md) の2節）が無いこと

  ```sh
  ssh setagayafes-archive 'sh -s' <<'EOF'
  cd ~/www/archive/98th || exit 1
  # 何も出なければよい（読み取りだけ）
  find . \( -type d \( -name '_vti_*' -o -name .git \) -prune -print \) -o -type f \( \
    -iname '*.bak' -o -iname 'Thumbs.db' -o -iname '.DS_Store' -o -iname 'desktop.ini' \
    -o -iname '*.sql*' -o -iname '*.log' -o -iname '*.zip' -o -iname '*.php' -o -iname '*.php.*' -o -iname '.env*' \) -print
  EOF
  ```

  - 出たものは、サイトの本体か（ページから参照されているか）を確かめてから、公開フォルダの外（`~/archive-docs/…`）へ、相対パスを保って移す
  - WordPress の書き出しには、テーマやプラグインの正規の `.zip`・`sitemap.xml.gz` が含まれることがある。中身を見て判断する
  - 理由: 2026-11-09、過去回の公開フォルダから、外から取得できる `*.bak`・`Thumbs.db`・`.DS_Store`・`desktop.ini`・FrontPage の管理情報（`_vti_cnf/`・`_vti_pvt/`）を445ファイル退避した。`Thumbs.db` にはサイトから消した画像の縮小版が残りうる。FrontPage の管理情報には、制作者の PC のアカウント名が残っていた

**順番に注意:** サイトのフォルダが置かれる前に `pnpm capture 98` や `pnpm check:links` を流すと、その回が 404 で落ちる。

## 手順

### 1. ブランチを切る

```sh
git switch main && git pull --ff-only
git worktree add -b feature/add-98th ../setagayafes-archive-98th
cd ../setagayafes-archive-98th && pnpm install
```

### 2. データに1件足す

`src/data/festivals.ts` の `FESTIVALS` の末尾に1件足す。項目と表記の決まりは [festivals.md](../data/festivals.md) の「1件追加するとき」。

- `round`・`dates`・`theme`（日英）・`commonTheme`・`status`
- 英訳はオーナーが確認する（PR の本文に、日本語と英語の対の表を載せる）
- 年・時代・祭の名称・パスは書かない（関数で導く）

続けて、`scripts/festivals.test.mjs` の `SERVER_FOLDERS` に `"98th"` を足し、`LATEST_ROUND` を `98` にする。

### 3. 撮影する

```sh
pnpm capture 98
```

- 原画像が `src/assets/captures/98th.png` に保存される。同じ PR に入れる
- 撮影の条件と回ごとの例外は [capture.md](./capture.md)。オープニングの演出が長いサイトは、`scripts/lib/capture-targets.mjs` の `OVERRIDES` に待ち時間を足す
- 撮影した画像を開いて、ローダーや空白で撮れていないかを目で見る

### 4. 確かめる

```sh
pnpm verify          # 単体・e2e・転送量の予算を含む
pnpm check:links     # 第98回のフォルダが応答すること
pnpm preview         # / と /en/ を開く
```

- ヒーローが第98回になり、第97回が一覧の先頭のカードに移ること
- `pnpm test:e2e` の予算の行（`ℹ initial … total …`）を見る。カードが1件増えると、全体が十数〜数十KB 増える。全体 1MB・初回 200KB を超えたら、画像の候補か配置を見直す（[post-build-checks.md](./post-build-checks.md)）
- OGP の画像は、撮影済みの回のうち最新の回（第98回）に変わる

### 5. PR を出してマージする

- PR の本文に、データの1件・英訳の表・撮影した画像・予算の値を載せる
- マージはオーナーの判断

### 6. 配置する

[deploy.md](./deploy.md) の手順 1〜5 と 8（初回だけの 6・7 は不要）。

## 年をまたいで変わりうるもの

- **時代（大学名）が変わったとき:** `src/data/festivals.ts` の時代の境目と、`Archive.astro` の絞り込み（時代の値を CSS に直接書いている。[screen.md](../design/screen.md)）を直す
- **祭の名称が変わったとき:** `festivalNameOf()` の境目を直す
- **公式サイトのホストが変わったとき:** `src/data/site-links.ts`
