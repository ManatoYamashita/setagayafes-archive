# PR のラベル

PR に付けるラベルと、自動で付く仕組みをまとめる。

## ラベルの一覧

| ラベル     | 付け方 | 条件                                                                                    |
| ---------- | ------ | --------------------------------------------------------------------------------------- |
| `docs`     | 自動   | 変えたファイルが**すべて** Markdown（`**/*.md`）                                        |
| `tooling`  | 自動   | `.github/`・lint と整形の設定・`package.json`・lockfile・検査スクリプトのどれかを変えた |
| `feature`  | 手動   | 画面・機能の追加                                                                        |
| `fix`      | 手動   | 当時表示できていたものを直す                                                            |
| `server`   | 手動   | さくらのサーバー上の作業                                                                |
| `security` | 手動   | 漏えい・公開範囲・セキュリティヘッダに関わる作業                                        |

- 自動で付けるのは、変えたパスだけで決まるものに限る。意図で決まるものは、PR を出す人が手で付ける
- 自動のラベルは、後の push で条件から外れると外れる（`sync-labels: true`）
  - `docs`・`tooling` は、手で付けても条件に合わなければ外れる。手で付けたいものは、`labeler.yml` の規則を直す
  - `labeler.yml` に無いラベル（`feature` など）には触らない

## 仕組み

- `.github/workflows/label.yml` が `actions/labeler` を `pull_request_target` で動かす。規則は `.github/labeler.yml`
- `pull_request_target` のジョブは、base 側の workflow と書き込みできる token で動く
  - PR のコードを checkout しない。checkout すると、PR のコードに書き込みの token を渡すことになる
- 規則は base 側（main）の `.github/labeler.yml` から読む。規則を変える PR では、マージするまで新しい規則は効かない

## 経緯

- 最初の `label.yml` は、`actions/labeler@v4` のひな形のままで、`.github/labeler.yml` が無かった。そのため #4〜#9 で Labeler が毎回失敗していた
- `labeler.yml` の書式は v5 で変わった（`changed-files` と `any-glob-to-any-file` などで書く）。v4 の書式の例を写すと、v5 以降では読めない
