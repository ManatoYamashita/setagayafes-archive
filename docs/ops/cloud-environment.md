# クラウド環境（Claude Code on the web）

claude.ai/code のクラウドセッションで、このリポジトリの `pnpm verify` と `pnpm check:production` を動かすための環境の設定。
環境の作り方と項目の意味は、公式の [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) を参照する。

## 環境

- 名前は `setagayafes-archive`（個人用）。このリポジトリでセッションを始めるときは、この環境を選ぶ
- Default 環境は他のリポジトリと共有するため、このリポジトリだけに要る設定は入れない

## ネットワーク

- 通信は制限付き。パッケージレジストリ（npm・apt など）と MCP サーバーは、一覧に無くても通る
- 許可ホスト

| ホスト                     | 使う場面                                                       |
| -------------------------- | -------------------------------------------------------------- |
| `cdn.playwright.dev`       | `pnpm exec playwright install`（e2e テストのブラウザの取得）   |
| `archive.setagayafes.org`  | `pnpm check:production`                                        |
| `setagayafes.sakura.ne.jp` | `pnpm check:production` の「サーバーの初期ドメイン経由」の確認 |

- `pnpm check:links` が見に行く他のホスト（`setagayafes.org`・`web.archive.org` など）は許可していない。使うときは、拒否されたホストを足す
- 暗号化しない `http://` の通信は、ホストを許可しても外へ出られない

## セットアップスクリプト

コンテナを新しく作るたびに、root で動く。

```bash
set -e
if [ ! -x /opt/node24/bin/node ]; then
  curl -fsSL https://nodejs.org/dist/v24.13.0/node-v24.13.0-linux-x64.tar.xz -o /tmp/node24.tar.xz
  mkdir -p /opt/node24 && tar -xJf /tmp/node24.tar.xz -C /opt/node24 --strip-components=1
fi
for b in node npm npx corepack; do ln -sf /opt/node24/bin/$b /opt/node22/bin/$b; done
corepack enable
apt-get update -qq && apt-get install -y -qq --no-install-recommends apache2
if [ -d setagayafes-archive ]; then
  (cd setagayafes-archive && pnpm install --frozen-lockfile && pnpm exec playwright install --only-shell chromium)
fi
```

- コンテナに入っている Node は v22 で、`/opt/node22/bin` が PATH の先頭にある。Node 24 を別の場所に入れても v22 が使われるため、`/opt/node22/bin` にリンクを張って差し替える
- Node の版は `.nvmrc` に合わせる。`.nvmrc` を上げたら、スクリプトの版も上げる
- apache2 は `pnpm check:htaccess` が使う
- Playwright のブラウザは、`package.json` で固定した版に合うものを取る。コンテナに最初から入っている Chromium は版が合わない

## シークレットと環境変数

- シークレットは置かない。さくらのサーバーへの書き込みは、オーナーの明示の指示があるときだけ手元から行う
- 環境変数も置いていない

## `pnpm check:production` を動かすとき

`scripts/check-production.mjs` は Node の `http`・`https` で直接つなぐため、そのままではコンテナのプロキシを通らず、名前解決で落ちる。
次のように変数を付けて動かす。

```bash
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt pnpm check:production
```

- `NODE_USE_ENV_PROXY` はプロキシに関わる予約された変数で、セッションからは環境に保存できない。保存するなら、claude.ai の環境設定で手で足す
- 「http:// redirect」の確認は、`http://` の通信が外へ出られないため、クラウドでは必ず落ちる。手元の Mac で確かめる

## `pnpm check:production:browser` を動かすとき

変数は要らない。Chromium はコンテナのプロキシと証明書をそのまま使う。

- 過去回（`/78th/`・`/96th/`）は外部のホスト（`s.w.org`・`stats.wp.com` など）を読み、プロキシに拒否される。過去回で見るのは 200 だけなので、結果には響かない
