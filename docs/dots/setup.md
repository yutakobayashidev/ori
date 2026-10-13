# Ori / dots の接続と運用の詳細

確認日: 2026-10-13。対象は公開リポジトリ [yutakobayashidev/ori](https://github.com/yutakobayashidev/ori)、確認したコミットは [`bf9587b7c25518209da8d26057bc0905cc304c58`](https://github.com/yutakobayashidev/ori/commit/bf9587b7c25518209da8d26057bc0905cc304c58) です。旧称に由来する `TWITTER_LITE_*`、`twitter-lite-*` は現在も実際の設定名・コマンド名として使われます。

この手順は公開ドキュメントとコードの照合結果です。新規環境でのビルド、デプロイ、ログイン、イベントの実配送は実行していません。更新後は現行の README と差分を確認してください。

[セットアップの入口](../dots-workflows.md) / [ワークフローテンプレート](workflow-templates.md)

## 目次

- [構成と前提](#1-構成と前提条件)
- [Dockerとownerログイン](#2-基本の-ori-を起動する)
- [Secure MCP TunnelとChatGPT登録](#3-secure-mcp-tunnel-を用意しchatgpt-に登録する)
- [イベントworker](#4-イベント配信側を準備する)
- [購読](#5-クライアント側で監視を設定する)
- [動作確認](#6-接続から動作までを分けて確認する)
- [トラブルシューティング](#7-よくある問題)
- [任意のCodex実行](#8-任意-ori-内の-codex-実行)
- [バックアップ](#9-バックアップと更新)

初回導入は [READMEの番号順](../../README.md#セットアップ)に進めます。Linux / Nix でイベントまで用意する場合は [native導入](native-event-setup.md)を先に完了し、この文書の第3節で合流してください。第2節はDockerで基本機能を試す別経路です。

## 1. 構成と前提条件

- **基本の Ori**: Docker Engine/Desktop と Docker Compose。Home、タスク、Board、Focus、owner ログイン、SQLite 永続化を使えます。ホストの Node.js / pnpm / Nix / Elixir、SNS、Beeper、Tailscale、Codex は基本起動には不要です。
- **dots から手動で読み書き**: Ori の `/mcp` へ届く接続と、利用アカウントで許可されたカスタム MCP プラグインが必要です。
- **イベントから dots を起動**: 上記に加え、別プロセスのイベント worker、共有 DB、暗号鍵、外向き HTTPS、クライアント側の明示的な購読・処理指示が必要です。
- **Beeper 会話連携**: 別途 Beeper Server/Desktop、CLI、認証済み target、対象チャットが必要です。
- **Ori 内の AI 実行**: オプションの `compose.ai.yaml` と Codex ログインを使います。外部 dots が MCP を呼ぶための必須条件ではありません。

Docker は `ori:local` をソースからビルドします。このコミットには配布済みの公式コンテナイメージを pull する手順はありません。ビルド時の `@yuta/bird` は `.npmrc` が指定する Gitea Packages に依存しており、GitHub への移動だけで依存先が完全に独立したわけではありません。[Docker の構成](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/docs/docker.md)、[.npmrc](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/.npmrc)

## 2. 基本の Ori を起動する

Git がある場合:

```sh
git clone https://github.com/yutakobayashidev/ori.git
cd ori
docker compose up -d --build --wait
docker compose exec web node .output/server/tools/account-setup.js
```

Git を使わない場合は GitHub からソースをダウンロード・展開し、そのディレクトリで後半の二つのコマンドを実行します。

1. `http://localhost:3000` をブラウザで開く。
2. セットアップコマンドが表示したコードを入力する。
3. owner の名前・メールアドレス・パスワードを設定し、onboarding を完了する。
4. Home と Board を開き、テスト用タスクを作成して再読み込み後も残ることを確認する。

セットアップコードは秘密として扱い、チャット・Git・公開ログに貼らないでください。owner は一人です。既存 owner の再作成やパスワード再設定にこのコードは使えません。メールによるパスワード復旧も未実装です。[owner ログイン](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/docs/login.md)

### ポートや URL を変える場合

デフォルトでは環境ファイルは不要です。Compose の上書きはリポジトリ直下の `.env` に書きます。`.env.local` は開発用です。

```dotenv
ORI_PORT=3000
ORI_ORIGIN=http://localhost:3000
```

`ORI_ORIGIN` は実際にブラウザで開く origin と完全一致させ、末尾の `/` は付けません。HTTPS リバースプロキシを使う場合はその HTTPS origin に変えます。標準のホスト公開先は `127.0.0.1` です。コンテナ内の `localhost` はコンテナ自身を指すため、外部サービスの URL にはそのコンテナから到達できるアドレスを指定してください。[compose.yaml](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/compose.yaml)

### 公開範囲

**`/mcp` はブラウザログインを迂回し、独自の MCP 認証は未実装です。公開インターネットへ匿名公開しないでください。** 信頼できる単一 owner のプライベートネットワーク／トンネル内に限定します。Web UI を公開する場合も公開プロキシで `/mcp` を遮断します。`TWITTER_LITE_AUTH_MODE=none` は外側の Tailscale identity check を無効にする設定で、ブラウザの owner ログインを省略する設定ではありません。[MCP のアクセス境界](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/docs/http-mcp.md#access-boundary)

## 3. Secure MCP Tunnel を用意し、ChatGPT に登録する

この節は 2026-10-13 時点の OpenAI 公開ドキュメントと Ori の [HTTP MCP 手順](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/docs/http-mcp.md)に基づきます。公開 `openai/tunnel-client` は [`459013c6fc389be6077efc8ebda4a7074f021c66`](https://github.com/openai/tunnel-client/commit/459013c6fc389be6077efc8ebda4a7074f021c66) を確認しました。トンネル作成、キー発行、認証、ChatGPT への実登録は実行していません。ここで扱うのは自分の Ori をカスタム MCP プラグインとして使う手順で、一般公開のプラグイン審査・配布とは別です。

### A. まず分けておく三つのアクセス境界

1. **Ori のブラウザログイン**: Web UI を使う owner のログイン。
2. **Secure MCP Tunnel のアクセス**: OpenAI の組織・workspace・トンネル権限と、`tunnel-client` の runtime API key。
3. **MCP サーバー側の認証**: この Ori の `/mcp` はブラウザログインを迂回し、独自認証は未実装。

トンネルを使っても Ori にユーザー認証や複数ユーザーの権限分離が追加されるわけではありません。`/mcp` を信頼する単一 owner のプライベート境界に保ち、公開プロキシからは到達させません。トンネル用のキーは ChatGPT の会話や Ori のログイン画面に入力するものではありません。[Ori の境界](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/docs/http-mcp.md#access-boundary)、[公式トンネルの仕組み](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#security-and-networking)

### B. 権限・トンネル・runtime key を用意する

1. [Platform の Tunnels](https://platform.openai.com/settings/organization/tunnels)で Ori 用のトンネルを作成する。既存の専用トンネルがあるなら設定を確認して再利用する。
2. トンネルに、所有・管理する Platform organization と、実際に使う ChatGPT workspace を関連付ける。Platform organization だけの関連付けで別の ChatGPT workspace に自動表示されるとは限らない。
3. 表示された完全な tunnel ID を手元に控える。以下の `tunnel_YOUR_ID` は説明用 placeholder なのでそのまま実行しない。
4. [Runtime API keys](https://platform.openai.com/settings/organization/api-keys)で必要な実行用キーを用意する。新規発行する場合は **Restricted** とし、Tunnels の **Read + Use** を付ける。キーを作る主体にも対象トンネルの Read + Use が必要。
5. キー本文を秘密管理サービスや、リポジトリ外の実行ユーザーだけが読める秘密ファイルに保存する。Unix ではファイルの mode 0600 を目安にし、サービスの実行ユーザーが読めることを確認する。

トンネルの作成・編集には **Read + Manage**、利用には **Read + Use** が必要です。権限不足なら対象 Platform organization の管理者へ確認します。管理操作用の `OPENAI_ADMIN_KEY` を常駐 daemon に渡さないでください。プランごとの利用可否はこの文書では断定せず、利用アカウントで表示される機能と workspace の許可を確認します。[公式権限手順](https://github.com/openai/tunnel-client/blob/master/docs/permissions.md)、[組織・workspace の関連付け](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#associate-tunnels-with-the-right-organizations-and-workspaces)

### C. tunnel-client を配置して Ori へ向ける

`tunnel-client` は Ori のプライベートな `/mcp` に到達できるホストで動かします。標準 Docker の Ori と同じホストなら、転送先は `http://127.0.0.1:3000/mcp` です。別コンテナで動かす場合の `127.0.0.1` はそのコンテナ自身なので、同じ Compose network 上の Ori service など、実際に到達できる内部 URL を使います。

macOS の公式インストール経路:

```sh
brew install openai/tools/tunnel-client
tunnel-client --version
tunnel-client help quickstart
```

Linux/VM 等では [公式リリース](https://github.com/openai/tunnel-client/releases/latest)と [deployment guide](https://github.com/openai/tunnel-client/blob/master/docs/deployment/overview.md)から環境に合う配布物を選びます。macOS で手動ダウンロード物が Gatekeeper に止められた場合、警告を迂回せず公式 Homebrew 経路を使います。[公式インストール案内](https://github.com/openai/tunnel-client#install-with-homebrew)

Ori は HTTP MCP なので、stdio やデモ用 stub ではなく HTTP 用プロファイルを作ります。

```sh
tunnel-client init --sample sample_mcp_remote_no_auth \
  --profile personal-workspace \
  --tunnel-id tunnel_YOUR_ID \
  --mcp-server-url http://127.0.0.1:3000/mcp
tunnel-client profiles edit personal-workspace
```

生成したプロファイルの `control_plane.api_key` を、実際の秘密ファイルへの参照に変更します。次は該当箇所の例で、完全な設定ファイルではありません。`/absolute/private/tunnel-runtime-key` も自分の配置先に置き換えます。

```yaml
control_plane:
  api_key: file:/absolute/private/tunnel-runtime-key
```

サービス管理機構から環境変数を渡す運用では、代わりに `api_key: env:CONTROL_PLANE_API_KEY` も使えます。どちらもキー本文をプロファイルに直接書きません。キーを含む `export` コマンド、ターミナル履歴、スクリーンショット、ログ、プロンプト、Git へのコピーを避けてください。[設定参照](https://github.com/openai/tunnel-client/blob/master/docs/configuration.md)

### D. 起動と readiness を確かめる

```sh
tunnel-client doctor --profile personal-workspace --explain
tunnel-client run --profile personal-workspace --health.listen-addr 127.0.0.1:8080
```

この `run` は前景プロセスです。初回確認中はそのターミナルを閉じず、別ターミナルで確認します。8080 が使用中なら別の loopback ポートを指定し、以下も合わせます。

```sh
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
```

ローカルの `http://127.0.0.1:8080/ui` でも状態を確認できます。管理 UI は公開しません。常用時は公式 deployment guide に従い systemd 等で監督し、再起動後の readiness も確認します。`doctor` の設定検証、プロセスの生存、readiness、実 MCP 呼び出しは別々に確認します。[起動・検証手順](https://github.com/openai/tunnel-client/blob/master/docs/onboarding.md)

Linux / Nix の導入経路では、初回確認に使った前景の `run` を Ctrl+C で停止し、同じユーザーで以下の常駐サービスを作れます。`init` した同じユーザーのプロファイルと、そこから参照する秘密ファイルを使います。既存の同名unitは上書きせず確認してください。

```sh
TUNNEL_BIN="$(command -v tunnel-client)"
test -n "$TUNNEL_BIN" && test -x "$TUNNEL_BIN" || exit 1
install -d -m 700 "$HOME/.config/systemd/user"
(set -C; cat > "$HOME/.config/systemd/user/ori-tunnel.service" <<UNIT
[Unit]
Description=Ori Secure MCP Tunnel
After=ori-web.service

[Service]
ExecStart=$TUNNEL_BIN run --profile personal-workspace --health.listen-addr 127.0.0.1:8080
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=default.target
UNIT
)
systemctl --user daemon-reload
systemctl --user enable --now ori-tunnel.service
systemctl --user status ori-tunnel.service
journalctl --user -u ori-tunnel.service --since '5 minutes ago'
curl -fsS http://127.0.0.1:8080/readyz
```

接続完了前はreadyzが失敗することがあるため、ログを確認して待ってから再確認します。ログアウト後・再起動後も動かす場合は、[native手順のlinger設定](native-event-setup.md#3-web-と-worker-を別サービスで動かす)も確認します。このunit例も構文・設定の静的確認のみで、実ホストでの起動は未検証です。

ネットワークは、tunnel-client から `api.openai.com:443` への外向き HTTPS と Ori への内部到達性が必要です。control-plane mTLS を使う構成では公式案内の `mtls.api.openai.com:443` を確認します。MCP Events の callback 配信はこのトンネルとは別の外向き HTTPS 通信です。[ネットワーク要件](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#network-requirements)

### E. ChatGPT web に MCP プラグインを登録する

1. 利用する workspace を確認し、[ChatGPT Plugins](https://chatgpt.com/plugins)を開く。
2. **+** → **Add custom MCP server**。
3. Name を `Personal Workspace` など分かる名前にする。Description は任意。
4. **Connection** → **Tunnel**。用意したトンネルを選ぶか、完全な tunnel ID を指定する。
5. **Authentication** は、この Ori の private prototype では **No authentication**。OAuth を実装していないサーバーに OAuth を選ばない。
6. リスク警告を確認し、**I understand and want to continue** → **Create as a plugin**。
7. 発見されたツールを確認し、作成したプラグインを **Install** して利用可能にする。
8. 新しい会話で `@` から対象プラグインを選び、次の読み取りテストを依頼する。

> Personal Workspace の get_activity_context で現在の Activity を読み、接続できていることを確認してください。このテストでは内容の作成・変更・送信はしないでください。

登録・利用には workspace の権限や Lockdown 等の制限が適用されます。表示されない操作を別の未確認の設定経路で代用せず、管理者と現行の公式案内を確認してください。[公式カスタム MCP 登録手順](https://developers.openai.com/api/docs/guides/custom-mcp-server)

### F. ツールやイベントの変更を再読み込みする

1. 更新した Ori をデプロイ／再起動し、tunnel-client が同じ正しい `/mcp` を向いていることを確認する。
2. [ChatGPT Plugins](https://chatgpt.com/plugins)で対象接続を開き、**Refresh** を選ぶ。
3. ツール一覧とメタデータが変わったことを確認する。イベントはプラグインページでツールと並んで表示されることを確認する。
4. 新しい会話で影響する読み取りテストをやり直す。

この Refresh が、Ori の手順でいう接続の「再スキャン」に対応します。再読み込みは既存の監視指示や追加イベントの購読を自動作成する操作ではありません。[公式 Refresh 手順](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata)

### G. 次にイベントを設定する場合

プラグインの登録・Refresh後に、[イベント配信側](#4-イベント配信側を準備する)、[クライアント側の購読](#5-クライアント側で監視を設定する)、[動作確認](#6-接続から動作までを分けて確認する)へ進みます。通常のMCP読み取りが成功しただけでは、自動化の購読やイベント実行は作られません。

## 4. イベント配信側を準備する

[Linux / Nixのnative手順](native-event-setup.md)でwebとworkerを準備済みなら、ここで別構成を追加せず[第5節](#5-クライアント側で監視を設定する)へ進みます。

### 重要: Docker の基本起動だけでは監視は完成しない

標準 `compose.yaml` は web のみ、`compose.ai.yaml` が追加するのは AI runtime です。Beeper CLI のインストール・認証やイベント worker のサービス定義は含まれません。イベント worker の JavaScript は web イメージにビルドされますが、常駐起動や外部 CLI・認証ファイルの準備は別です。

また現行 worker は起動時に Beeper adapter を無条件で作るため、**Activity イベントだけを利用したい場合でも `TWITTER_LITE_BEEPER_TARGET` の設定がないと起動しません**。Beeper 非依存のイベント配信構成はこのコミットの標準手順にはありません。Beeper を使わない最小構成では、まず dots からの手動 MCP 利用までを確認してください。[worker 実装](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/scripts/events-worker.ts)、[adapter 実装](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/src/features/beeper/adapter.server.ts)

### Beeper と worker の設定

1. [Beeper 公式 CLI](https://github.com/beeper/cli#connecting-a-target)に従って Desktop または headless Server を用意し、必要なネットワークの認証を本人が完了する。既存 target が使えるなら再作成しない。
2. 実際に web と worker を動かすユーザー・コンテナから、その CLI・target 設定・認証情報・Beeper endpoint にアクセスできるようにする。ホストで動くだけではコンテナからの利用確認にならない。
3. web と worker に同じ SQLite と暗号鍵を指定し、次の設定を渡す。

| 設定 | 内容 |
| --- | --- |
| `TWITTER_LITE_DB_PATH` | 同一の SQLite ファイル。各実行環境から見える絶対パス |
| `TWITTER_LITE_CREDENTIAL_KEY_FILE` | 同一の暗号鍵ファイル。base64 で表した 32 random bytes |
| `TWITTER_LITE_BEEPER_CLI` | 実際の CLI 実行ファイルの絶対パス |
| `TWITTER_LITE_BEEPER_TARGET` | 用意済みの認証済み target 名。既定値なし |

現行 Beeper 公式 CLI の npm パッケージ名は `beeper-cli`、インストールされるコマンド名は `beeper` です。Ori の既定の実行名 `beeper-cli` に頼らず、`TWITTER_LITE_BEEPER_CLI` を実物に合わせます。CLI の資格情報は本人の安全なセットアップ経路で保存し、Ori の環境変数にトークン本文を貼る手順にはしません。[Beeper CLI](https://github.com/beeper/cli#install)

暗号鍵は webhook の署名 secret の保存にも使われます。Mastodon を使わなくても MCP Events の購読には必要です。鍵の作成・マウント・バックアップは [Ori の鍵管理手順](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/docs/storage-and-oauth.md#runtime-configuration)を参照し、既存鍵を上書きしないでください。[購読の暗号化処理](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/src/features/mcp-events/events.server.ts)

4. 必要なファイルと実行依存が揃った環境で、web と別プロセスとして worker をサービス管理する。ビルド済み配置の起動エントリは以下です。これは標準 Compose への自動追加コマンドではありません。

```sh
node .output/server/tools/events-worker.js
```

Nix パッケージでは対応するコマンドが `twitter-lite-events-worker` です。新しい Docker 環境には、CLI の配置、認証設定の安全なマウント、共有 volume、環境変数、worker サービスを定義する追加のデプロイ作業が必要です。Beeper変数を`.env`に書くだけでは標準Composeのwebへ渡りません。環境変数の明示マッピング、UID/GID 1000が読める鍵、WALも含む共有DBディレクトリ、workerに合ったhealthcheckが必要です。すべての起動手順がある経路は[Linux / Nix版](native-event-setup.md)を参照してください。[ビルドエントリ](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/scripts/build-tools.mjs)、[Nix パッケージ](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/flake.nix)

5. web からは購読 callback 検証、worker からはイベント配送の外向き HTTPS を許可する。イベント用の新しい inbound ポートは不要。`beeper status --json` 等の生出力には認証情報が含まれ得るため公開ログに出さない。[イベント運用](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/docs/beeper-mcp-events.md)

## 5. クライアント側で監視を設定する

MCP Events の利用先は公式案内上、ChatGPT web の Work chat、desktop の Work + Cloud、または dots です。MCP 2.0（protocol `2026-07-28`）を使い、プラグインとイベント起動タスクの workspace 制御が適用されます。単にサーバーを起動したりプラグインを接続しただけでは、購読も自動処理も作られません。[OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events)

1. Ori の接続を再スキャンし、必要なツールとイベントが出ることを確認する。
2. Beeper を使う場合は `list_beeper_chats` で一覧を取得し、監視したい具体的なチャットを選ぶ。ID は実際の結果を使い、公開手順書へ記録しない。
3. dots に、監視対象・イベント・やってよい処理・終了条件を伝える。
4. 実際の購読イベント名、フィルター、callback 検証の成功を確認する。口頭の「監視します」だけを設定完了の証拠にしない。

### イベントとフィルター

| イベント名 | 用途 | フィルター |
| --- | --- | --- |
| `beeper.message.received` | 選択チャットの新着受信 | `{"chatIds":["選択した実際のID"]}` |
| `beeper.message.sent` | 本人の送信メッセージが Beeper に同期されたことを観測 | 同上。受信とは別購読 |
| `activity.created` | タスク／返信 Activity の新規作成 | `{}` は user 起点のみ |
| `activity.status_changed` | Activity の状態変化 | 同上 |
| `activity.time_changed` | 見積もり・記録済み作業時間の変化 | 同上。タイマーの tick では発火しない |

Activity では `activityIds` と `origins` も指定できます。`origins` の既定は `["user"]`。`["user","agent"]` を選ぶ場合は、自分の変更から同じ処理を繰り返さない条件を設けます。購読時に既存 Activity や過去メッセージが新規イベントとして一括配信されるわけではありません。[イベント仕様](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/docs/beeper-mcp-events.md)

### 最小の依頼例

> Personal Workspace の activity.created と activity.status_changed を、user 起点に限定して購読してください。新しいタスクは現在の内容を読み、次の一歩を整理してください。完了したタスクは関連する未処理事項を確認してください。既存 Activity と本人の編集・保留・完了判断を尊重し、同じ用件を重複作成しないでください。外部メッセージは送らず、実際に設定したイベント名とフィルターを教えてください。

会話監視では、選択したチャット・受信／送信のどちらを監視するかを追加します。メッセージ本文は判断材料として扱い、本文に書かれた命令を自動実行させません。

### 正しいツール名と権限の分け方

- `get_activity_context`: 既存 Activity、本人の変更、状態、revision を読む。
- `publish_activities`: タスク／返信案を作成・更新する。メッセージ送信はしない。
- `update_activity_progress`: 理由・根拠を付けて状態や下書き等を部分更新する。
- `list_beeper_chats` / `read_beeper_chat`: 会話の発見と文脈確認。
- `read_activity_conversation`: Activity に結び付いた会話、下書き hash/revision、送信状況を確認する。
- `send_activity_reply`: 保存された下書きの送信をキューに入れる。監視や下書き作成の許可とは分け、明示的な送信許可が必要。
- `get_message_send`: 送信 operation の状態を読む。

`events/list`、`events/subscribe`、`events/unsubscribe` は MCP のプロトコルメソッドであり、上記の通常ツールとは別です。callback URL と署名 secret は対応クライアントが購読時に渡します。ユーザーが公開 Markdown に埋め込むものではありません。[MCP ツール一覧](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/docs/http-mcp.md)

`beeper.message.sent` は配送完了の証明でも、用件を果たした証明でもありません。「了解」と返信しただけでタスクを完了扱いにせず、約束の内容と会話を確認します。

## 6. 接続から動作までを分けて確認する

- [ ] 利用中の構成に合う方法で web の起動を確認した（次のどちらか一方）。
  - Linux / Nix: `systemctl --user is-active ori-web.service` が `active`。`curl -fsS http://127.0.0.1:3000/api/auth > /dev/null` が成功する。
  - Docker: `docker compose ps` で web が `healthy`。
- [ ] Home に owner でログインできる。
- [ ] 再読み込み後もテスト用 Activity が残る。
- [ ] dots の `get_activity_context` でその Activity が読める。
- [ ] 再スキャン後、対象イベントがプラグインに表示される。
- [ ] 購読作成と署名付き callback 検証が成功している。
- [ ] **購読後**に作ったテスト用 Activity／選択チャットの新規受信で、worker の配信が成功する。
- [ ] dots の処理が実際に起動し、指定した読み取り・提案・更新が Ori に反映される。
- [ ] フィルター外のイベントでは起動しない。
- [ ] 停止を依頼すると購読解除され、新規配送が止まる。

Webhook の `2xx` は受領の確認です。dots の処理完了や Activity 更新まで証明するものではありません。ローカルテストの成功も本番 ChatGPT 接続での一連の動作確認の代わりにはなりません。[公式テスト手順](https://developers.openai.com/plugins/build/mcp-events#test-in-chatgpt)

## 7. よくある問題

| 症状 | 確認すること |
| --- | --- |
| ビルドで依存を取得できない | `.npmrc` の Gitea Packages、npm、Docker base image への接続。まだ配布イメージの pull に置き換えられる前提ではない |
| UI は開くが保存に失敗 | `ORI_ORIGIN` と実際のブラウザ origin。`localhost` と `127.0.0.1` は別 origin |
| `/health` は通るが準備完了しない | Docker の healthcheck は `/api/auth` で DB 初期化も確認する。`/health` だけでは不十分 |
| トンネルが見えない | 対象 ChatGPT workspace との関連付けと Tunnels Read + Use 権限 |
| tunnel-client に401/403 | runtime keyとその主体の権限・対象組織。管理キーへの置き換えはしない |
| 接続作成やツール発見に失敗 | `doctor --explain`、`readyz`、Oriの起動と内部URL、サーバーエラー |
| MCP ツールが古い／イベントがない | 新しい app のデプロイ、トンネルが指すポート、再スキャン |
| ツールは呼べるがイベントが来ない | worker の別起動、共有 DB、鍵、callback 検証、購読期限、外向き HTTPS、対象フィルター、新規イベントで試したか |
| `TWITTER_LITE_BEEPER_TARGET` エラー | web と worker の両方に認証済み target を指定。現行 worker は Activity のみでもこの設定が必要 |
| CLI が見つからない／Beeper の読み取り失敗 | 実行ファイル名 `beeper` とパス、サービス実行ユーザーの設定・認証、コンテナから Beeper への到達性 |
| 配信成功だが Activity が変わらない | dots 側のタスク実行結果・権限・指示を確認。配信 ACK と処理成功を分ける |
| タスクが増え続ける | agent-origin を含む購読や、毎回新規 ID を作る処理によるループを確認 |

Linux / Nix 版の基本ログは次で確認できます。

```sh
systemctl --user status ori-web.service ori-events.service
journalctl --user -u ori-web.service -u ori-events.service --since '5 minutes ago'
```

Docker 版の基本ログは次で確認できます。認証情報、callback URL、署名secret、個人のtunnel/workspace ID、会話本文を公開 issue に貼らないでください。TLSの警告や認証チェックを無効化して解決しないでください。

```sh
docker compose ps
docker compose logs --tail=100 web
```

## 8. 任意: Ori 内の Codex 実行

```sh
docker compose -f compose.yaml -f compose.ai.yaml up -d --build --wait
docker compose -f compose.yaml -f compose.ai.yaml exec runtime codex login --device-auth
```

ログインは本人が完了します。ホストの認証情報を自動取り込みする構成ではありません。利用可能なモデルに合わせて `ORI_CODEX_MODEL` を指定します。以後の `logs` / `exec` / `restart` / `down` も二つの `-f` を付けます。runtime が healthy でも Codex のログインや実タスク成功までは保証しません。

内部接続は web → `http://runtime:4318`、Codex → `http://web:3000/mcp`。runtime port は標準構成でホスト公開されず、認証 token と作業レポートは必要な volume だけ共有されます。[AI Compose](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/compose.ai.yaml)、[runtime Dockerfile](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/runtime/Dockerfile)

その他の任意連携は X の `TWITTER_RELAY_BASE_URL`、Reddit の `RDT_GATEWAY_URL`、Mastodon の `TWITTER_LITE_MASTODON_ORIGINS` と暗号鍵です。使うものだけ設定します。秘密ファイルはイメージへ焼き込まず、必要なコンテナへ安全にマウントします。[設定項目](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/.env.example)

## 9. バックアップと更新

以下はDocker版の操作です。Linux / Nix版では[nativeのバックアップ手順](native-event-setup.md#6-バックアップと更新)を使います。

既存バックアップ名と重ならない保存先を選んで実行します。

```sh
docker compose exec web node .output/server/tools/backup-database.js /data/backup.sqlite
docker compose cp web:/data/backup.sqlite ./backup.sqlite
```

使用中の SQLite は WAL を含むため main DB ファイルだけをコピーせず、付属バックアップツールを使います。暗号鍵、必要な Beeper 設定、任意 AI volume は別途保護してバックアップします。秘密を含むバックアップを公開リポジトリに置かないでください。

`docker compose down` はデータ volume を残します。**`docker compose down --volumes` はデータを削除するため、通常の更新には使いません。** ソース更新後の再ビルド前に、利用中の revision と復元可能なバックアップを確保してください。[保存と復元](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/docs/storage-and-oauth.md#backups-and-restore)

## 現時点の限界

- MCP は信頼された単一 owner 向けのプライベート境界。マルチユーザーや公開 MCP 向けの認証設計ではありません。
- 標準 Docker は core と任意 AI まで。Beeper／イベント監視を含む turnkey 構成ではありません。
- カレンダー連携、life / Rensheng との自動読み書きは未実装・計画段階です。Journal、Reader、Vitals、routines にもプロトタイプの制限があります。Home の永続タスクや返信 Activity と混同しないでください。[README の実装状況](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/README.md#workspaces-and-current-status)

