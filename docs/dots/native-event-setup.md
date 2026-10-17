# Linux / Nix で Ori とイベント worker をセットアップする

以下は、web と worker と Beeper CLI を**同じ Linux ユーザー**で動かす、新規導入用の構成例です。Docker の中へホストの認証情報をコピーする必要はありません。Ori の公開 Nix パッケージと Beeper の公式 CLI 手順を照合した例であり、この文書の作成時には実ビルド・ログイン・配送を実行していません。

前提は x86_64-linux または aarch64-linux、flakes が有効な Nix、systemd のユーザーセッション、Git、OpenSSL、Beeper CLI をインストールするための Node.js/npm です。Nix と Node.js は各公式手順（[Nix](https://nixos.org/download/)、[Node.js](https://nodejs.org/en/download)）で導入してください。macOS・Windows 向けの systemd 手順ではありません。Beeper は公式の [導入手順](https://github.com/beeper/cli#install) と [headless setup](https://github.com/beeper/cli/blob/main/packages/cli/docs/setup.md#headless-server-setup) も確認します。

この例は Docker と**別の新しい DB**を使います。既に Docker に実データを保存した場合、そのまま進むと別の空の Ori が起動します。既存データを移す場合は [バックアップと復元](../storage-and-oauth.md#backups-and-restore) に従い、同じ鍵も移してから進めてください。実行中の SQLite main ファイルだけをコピーしません。Docker 版を停止して同じポートを空ける場合は `docker compose stop web` とし、volume は削除しません。

## 1. パッケージと Beeper を用意する

新規 checkout を作る場合は次から始めます。既存 checkout がある場合はそこへ移動し、clone を繰り返しません。以下の手順を終えるまでこのシェルを使います。

```sh
git clone https://github.com/yutakobayashidev/ori.git
cd ori
# ビルドに使う版を記録する（checkout は変更しない）:
git rev-parse HEAD
```

表示されたコミットIDを控え、このREADMEと`docs/dots/`が存在するcheckoutのまま進めます。末尾の参照コミットは実装を照合した根拠であり、そこへcheckoutを戻す手順ではありません。

Nix flakes と systemd user セッション、Node.js/npm が利用可能か先に確認します。失敗する前提があれば、その公式導入手順を完了してから進みます。

```sh
nix --version
node --version
npm --version
systemctl --user --version
systemctl --user show-environment > /dev/null
```

ビルド時は Nix の取得先、npm、`.npmrc` が指定する Gitea Packages の `@yuta/bird` へ到達する必要があります。GitHub のソースだけで全依存が完結する構成ではありません。

この Nix パッケージは Node.js 22 を内包して Ori を実行します。Beeper の npm launcher 用 Node.js は、ユーザーサービスでも利用できる継続的なインストールを使います。

```sh
nix build .#default
ORI_PACKAGE="$(readlink -f result)"
# result は GC root でもあるため、運用中は削除しない

npm install --global --prefix "$HOME/.local" beeper-cli
export PATH="$HOME/.local/bin:$PATH"
beeper --version
```

Beeper の npm パッケージは `beeper-cli`、実行名は `beeper` です。npm 版 launcher が利用する Node.js のパスも後でサービスへ渡します。既に公式 CLI を導入済みなら再インストールは不要です。

同じユーザーで本人が認証を完了します。以下は新しい headless Server を作る場合です。既存 Desktop / Server target を使う場合は、それを再作成せず `beeper setup` または公式の接続手順を使います。

```sh
beeper setup --server --install
beeper accounts add
beeper targets enable server
```

ブラウザがない環境は `beeper setup --server --install --email 自分のメールアドレス` を使い、メールコードとデバイス承認を本人が行います。認証コード・回復キー・トークンを公開ログや文書へコピーしないでください。`accounts add` は必要な会話ネットワークを一つずつ接続する操作です。

`server` はこの新規 Server 例での target 名です。既存 target なら実際の名前に置き換えます。設定場所は `beeper config path` で確認できます。以下の API 読み取りが成功してから進みます。出力には個人の会話情報が含まれるため共有しません。

```sh
BEEPER_TARGET=server
beeper api get '/v1/chats?limit=1' \
  --target "$BEEPER_TARGET" --read-only --json --timeout 20s
```

## 2. 共通 DB と鍵を指定する

新規インストール用ディレクトリを作り、まだ鍵がないときだけ作成します。鍵は Git や Nix store の外に保持します。

```sh
install -d -m 700 "$HOME/.config/ori" "$HOME/.local/state/ori"
if [ ! -e "$HOME/.config/ori/credential-key" ]; then
  (umask 077; set -C; openssl rand -base64 32 > "$HOME/.config/ori/credential-key")
fi
```

新しい設定例を生成します。既存ファイルがある場合は自動上書きせず、内容と既存 DB の場所を確認してから手動で統合します。この例は、ホーム・CLI パスに空白や引用符がない標準的な Linux 環境を想定します。

```sh
command -v node >/dev/null || exit 1
command -v beeper >/dev/null || exit 1
BEEPER_BIN="$(command -v beeper)"
NODE_BIN_DIR="$(dirname "$(command -v node)")"
test -n "$BEEPER_BIN" && test -n "$NODE_BIN_DIR"
(umask 077; set -C; cat > "$HOME/.config/ori/runtime.env" <<ENV
HOST=127.0.0.1
PORT=3000
TWITTER_LITE_AUTH_MODE=none
TWITTER_LITE_ORIGIN=http://localhost:3000
TWITTER_LITE_DB_PATH=$HOME/.local/state/ori/workspace.sqlite
TWITTER_LITE_CREDENTIAL_KEY_FILE=$HOME/.config/ori/credential-key
TWITTER_LITE_BEEPER_CLI=$BEEPER_BIN
TWITTER_LITE_BEEPER_TARGET=$BEEPER_TARGET
PATH=$NODE_BIN_DIR:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
ENV
)
```

ここへトークン本文は入れません。Beeper の認証はこのユーザーの既存 CLI 設定で管理します。`BEEPER_CLI_CONFIG_DIR` を変更して認証した場合は、同じ変数と絶対ディレクトリを `runtime.env` にも追加してください。ブラウザの origin を変更する場合は `TWITTER_LITE_ORIGIN` も一致させます。Docker 用の `ORI_ORIGIN` とは変数名が違います。

設定を読み込んだ同じ shell で owner setup を実行します。web と worker もこの同じファイルを使うため、DB と鍵の不一致を避けられます。

```sh
set -a
. "$HOME/.config/ori/runtime.env"
set +a
"$ORI_PACKAGE/bin/twitter-lite-setup"
```

表示されたセットアップコードは次のログインに使います。チャットやサービスログへ貼らないでください。既存 owner がある DB では作り直しません。

## 3. web と worker を別サービスで動かす

同じ shell でユーザーサービスを作ります。既存ファイルがある場合、この例は上書きを拒否します。`ORI_PACKAGE` には上でビルドした package の絶対 store path が入ります。

```sh
install -d -m 700 "$HOME/.config/systemd/user"
(set -C; cat > "$HOME/.config/systemd/user/ori-web.service" <<UNIT
[Unit]
Description=Ori web

[Service]
EnvironmentFile=%h/.config/ori/runtime.env
ExecStart=$ORI_PACKAGE/bin/twitter-lite
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=default.target
UNIT
)
(set -C; cat > "$HOME/.config/systemd/user/ori-events.service" <<UNIT
[Unit]
Description=Ori MCP Events worker
After=ori-web.service

[Service]
EnvironmentFile=%h/.config/ori/runtime.env
ExecStart=$ORI_PACKAGE/bin/twitter-lite-events-worker
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=default.target
UNIT
)
systemctl --user daemon-reload
systemctl --user enable --now ori-web.service ori-events.service
systemctl --user status ori-web.service ori-events.service
curl -fsS http://127.0.0.1:3000/api/auth > /dev/null
journalctl --user -u ori-events.service --since '5 minutes ago'
```

`http://localhost:3000` を開き、先ほどのコードで owner を作成して onboarding を完了します。新しい Activity を作成し、再読み込み後も残ることを確認してください。リモート Linux ホストなら、本人のブラウザから loopback へ安全に届く経路（例: SSH のローカルポート転送）を用意します。`/mcp` のために公開 inbound ポートを開けません。

worker ログの `Beeper MCP Events worker ready` はプロセスが起動したことだけを示します。購読や新規イベントの配送成功はまだ確認していません。Beeper の接続とイベント配送は別に検証します。

ログアウト後やホスト再起動後もユーザーサービスを動かす場合は、管理者にこのユーザーの linger 有効化を確認してもらいます。自分で管理するホストなら `sudo loginctl enable-linger "$USER"` です。Beeper 側も `targets enable` が設定したサービスの起動を確認してください。

この web の `/mcp` は `http://127.0.0.1:3000/mcp` です。同じホストの tunnel-client をそこへ向け、[Secure MCP Tunnel と ChatGPT 登録](setup.md#3-secure-mcp-tunnel-を用意しchatgpt-に登録する)に進みます。callback 検証には web から、イベント配送には worker から外向き HTTPS が必要です。購読前に作ったタスクが後からまとめて配送されるわけではありません。

## 4. トンネル・プラグイン・購読へ進む

[setup.md の第3節](setup.md#3-secure-mcp-tunnel-を用意しchatgpt-に登録する)で tunnel-client を起動し、ChatGPT にプラグインを登録します。web と worker は本手順ですでに準備したため、同文書第4節の別構成を重ねて作らず、[第5節の購読](setup.md#5-クライアント側で監視を設定する)へ進みます。その後、[ワークフローテンプレート](workflow-templates.md)から必要な処理を選びます。

## 5. 購読後の最小受け入れテスト

1. プラグインで `get_activity_context` を呼び、上で作ったタスクを読めることを確認する。
2. `activity.created` を user 起点で購読し、購読名・フィルター・callback 検証結果を確認する。
3. Home で新しいテスト用タスクを**本人が**作成する。agent 起点の作成は既定フィルターから除外される。
4. `journalctl --user -u ori-events.service --since '5 minutes ago'` に `mcp-event-delivery` の `attempted` と `delivered` が現れるか確認する。これは配送数であり、dots の処理完了ではない。
5. dots の実行結果と Ori の `/history`・対象 Activity を開き、期待した処理が反映されたことを確認する。
6. Beeper の試験は `list_beeper_chats` で具体的なチャットを選んで受信イベントを別途購読し、購読後の新しい受信で試す。監視のためだけに他人へテストメッセージを無断送信しない。
7. 不要になったテスト購読を停止し、解除結果を確認する。

## 6. バックアップと更新

この native 構成では Docker の backup コマンドを使いません。ビルドしたパッケージと同じ設定で、付属の SQLite backup ツールを実行します。鍵・Beeperの設定・トンネルの設定と秘密ファイルも別途安全なバックアップ対象にします。

```sh
# Ori checkout に移動して実行する
ORI_PACKAGE="$(readlink -f result)"
set -a
. "$HOME/.config/ori/runtime.env"
set +a
BACKUP_DIR="$HOME/.local/state/ori/backups/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$BACKUP_DIR"
test ! -e "$BACKUP_DIR/workspace.sqlite" || exit 1
"$ORI_PACKAGE/bin/twitter-lite-backup" "$BACKUP_DIR/workspace.sqlite"
```

更新は DB と鍵をバックアップしてからビルドします。`nix build` で `result` が変わっても上のサービスは以前の絶対 store path を保持するため、両方の `ExecStart` を新しい同一 package に更新し、daemon-reload と再起動が必要です。元の package と復元可能なバックアップを確保してから更新してください。新しいバージョンが DB schema を変更した場合、単純な旧版起動で戻せるとは限りません。

根拠: Ori の [flake.nix](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/flake.nix)、[worker](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/scripts/events-worker.ts)、[Beeper adapter](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/src/features/beeper/adapter.server.ts)、[共有DB](https://github.com/yutakobayashidev/ori/blob/bf9587b7c25518209da8d26057bc0905cc304c58/src/features/storage/database.server.ts)。
