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
