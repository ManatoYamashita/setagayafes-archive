# AGENTS.md

archive.setagayafes.org のトップ（過去の世田谷祭の一覧）を作るリポジトリ。
各回のサイトそのものは、このリポジトリの管理外（サーバー上に当時のまま保存されている）。

## 参照する順

1. 本ファイル
2. [docs/INDEX.md](./docs/INDEX.md): 文書の索引
3. [docs/rules/conventions.md](./docs/rules/conventions.md): 規約
4. Issue #1: 決定事項と ToDo の正本

## 作業の流れ

- 作業は Issue に紐づけ、`feature/` ブランチから PR を出す。main へ直接 push しない
- PR を出す前に `pnpm verify` を通す（CI でも同じものが走る）
- 外部ライブラリを足すときは、目的・代替案・影響（サイズ）を示して、オーナーの承認を取る
- さくらのサーバーには、オーナーの明示の指示があるときだけ書き込む
- 新しく分かったことは `docs/` に書き、`docs/INDEX.md` を直す
- 複数の作業を並行するときは、`git worktree` で作業ディレクトリを分ける。1つのディレクトリで branch を切り替え合わない

## 積み重ねる PR

まだマージされていない PR の上に、別の PR を作るときの決まり。

- 上に積む PR の base は、土台の PR のブランチにする。説明の冒頭に、土台の PR の番号を書く
- 土台の PR をマージする前に、上に積んだ PR の base を main へ付け替える。土台のブランチを消すのは、その後にする
  - 理由: 土台のブランチを先に消すと、GitHub は上の PR の base を付け替えず、その PR を閉じる。#5 をマージしてブランチを消したとき、#7 が閉じた
  - 閉じてしまったら、土台のブランチを同じコミットで作り直す。PR を開き直し、base を main に付け替えてから、ブランチを消し直す
- base を付け替えたら、上の PR の CI を確かめ直す。`pull_request` の CI は、base とマージした状態で走るため
- 土台の PR では force-push しない。直すときはコミットを足す
- 並行する PR が同じファイルを変えて衝突したら、後からマージする側が直す
  - `package.json`・`README.md` の表・`docs/INDEX.md`: 両方の変更を残して、Prettier を掛け直す
  - `pnpm-lock.yaml`: `pnpm install` で作り直す
