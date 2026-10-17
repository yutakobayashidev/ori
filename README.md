# Ori

Ori は、タスク・返信案・作業の進み具合を一か所に置く個人用ワークスペースです。Home で次にやることを選び、Board で進捗を整理し、Focus で作業を進められます。dots と接続すると、許可した会話から用事を取り込み、本人の返信や操作に合わせて状態を更新できます。

この README は、**新規導入から dots のイベント自動化が動くところまで**を案内します。機能の詳細や開発用コマンドは[技術リファレンス](docs/technical-reference.md)へ分けています。

## まず選ぶ

- **dots の自動化まで使う**: 下の「セットアップ」を 1 → 6 の順に進める。Linux + Nix の構成です。
- **画面とタスク管理だけ試す**: [Docker で試す](#docker-で試す)へ。後から手動 MCP 接続も追加できます。

イベントの配信 worker が必要なため、完全な導入経路には既存の Nix パッケージを使います。標準 Docker Compose には worker と Beeper CLI の常駐構成がまだありません。

## セットアップの前提

この導入経路は **Linux（x86_64 / aarch64）+ systemd** 用です。実際の操作に入る前に、次を用意してください。

- Git、flakes が使える Nix、Beeper CLI を入れる Node.js / npm
- 接続したいメッセージアカウントと Beeper の利用環境
- Secure MCP Tunnel を作成・利用できる OpenAI 側の権限
- カスタム MCP プラグインとイベント起動を使える ChatGPT / dots の環境

macOS の Docker 単体から、この手順で Linux サービスが自動作成されるわけではありません。既存の Ori がある場合は DB・鍵・接続先を確認し、新規手順で上書きしないでください。

**安全上の前提:** Ori の `/mcp` はブラウザの owner ログインを迂回します。信頼できる単一 owner の private な接続に限定し、公開インターネットへ匿名公開しないでください。鍵・会話 ID・住所・個人用 URL は公開設定に入れません。

## AI にセットアップを頼む

次をそのまま AI に渡せます。操作する端末と、既存の Ori があるかも添えてください。下の番号付き手順は、AI に任せず自分で進める場合にも使えます。

```text
この README がある https://github.com/yutakobayashidev/ori のブランチを対象に、
README とリンク先の文書を読み、Ori と dots の接続・イベント動作確認まで手伝ってください。

最初に対象端末の OS、利用できる操作権限、既存の Ori・DB・鍵・Beeper・
トンネル・ChatGPT プラグインを確認してください。既存構成は再利用し、
上書き、削除、別 DB への無断移行はしないでください。

新規の Linux + Nix 構成は文書の完全導入経路を使ってください。
他の OS や Docker だけの構成では対応範囲と不足を先に示し、
動いていない worker を導入済みと扱わないでください。
必要な公式ソフトの導入やサービスの常駐化は、対象と変更内容を説明して確認してください。

パスワード、API key、ログイン、権限付与は本人が安全な画面で行います。
秘密をチャット・Git・公開ログへ貼らせず、/mcp を匿名公開しないでください。
対象チャット、通知先、時刻、タイムゾーンは推測せず確認してください。
継続監視や外部投稿の許可はセットアップと分けて確認し、
この依頼だけで Slack 投稿・メッセージ送信・予定変更を始めないでください。

本人が許可した範囲で作業し、owner ログイン、タスクの永続化、MCP 読み取り、
worker、購読、テストイベント、dots の起動、期待する結果を順に確認してください。
各段階で完了条件を確かめ、最後に「完了」「本人の操作待ち」「未検証」を
分けて、次に必要な操作を具体的に教えてください。
```

## セットアップ

### 1. Ori と Beeper を準備する

[Linux / Nix の手順 1〜2](docs/dots/native-event-setup.md#1-パッケージと-beeper-を用意する)に従い、ソース取得、ビルド、Beeper CLI の導入・認証、保存先と鍵、共通設定、owner 用セットアップコードを準備します。Beeper は web と worker と同じ Linux ユーザーで使います。

### 2. web と worker を動かし、owner でログインする

続けて[Linux / Nix の手順 3](docs/dots/native-event-setup.md#3-web-と-worker-を別サービスで動かす)で、同じ DB・鍵を使う web と worker を別サービスとして起動します。ブラウザで owner を作成してログインし、テスト用タスクが再読み込み後も残ることを確認してください。

現行 worker は Activity の変化だけを監視する場合も Beeper target が必要です。web と worker の両方が起動し、同じ保存先を参照できたら次へ進みます。

### 3. OpenAI Secure MCP Tunnel を起動する

[Secure MCP Tunnel の手順 A〜D](docs/dots/setup.md#3-secure-mcp-tunnel-を用意しchatgpt-に登録する)で、次を順に行います。

1. トンネルを作り、利用する ChatGPT workspace と関連付ける
2. 必要な権限に限定した runtime key を秘密ファイルへ保存する
3. `tunnel-client` を Ori の private な `/mcp` へ向ける
4. `doctor`、`healthz`、`readyz` を確認し、常駐させる

トンネルの準備完了と、次の ChatGPT への登録は別の手順です。

### 4. ChatGPT に MCP プラグインを登録する

[登録手順 E〜F](docs/dots/setup.md#e-chatgpt-web-に-mcp-プラグインを登録する)に従い、ChatGPT Plugins で対象トンネルを選び、カスタム MCP プラグインを作成して Install します。Ori の更新後は同じ接続を Refresh します。

新しい会話で `get_activity_context` を読み取り専用で呼び、手順 2 のテスト用タスクが返ることを確認します。ツール一覧だけが表示された状態で先へ進めないでください。

### 5. 必要なワークフローを登録する

[ワークフロー一覧と設定項目](docs/dots/workflow-templates.md)を開き、使うものだけ選びます。最初は小さな対象から始めます。

- 用事の取り込みと本人送信後の進捗同期
- 対象会話の定期見直し
- Slack の進捗・余力共有と依頼受付
- 日次の予定、翌日のルート、持ち物の案内

対象チャット／チャンネル、通知先、タイムゾーン、実行時刻、変更・送信の許可範囲を埋め、既存設定との重複を確認してください。Gmail・Slack・Calendar を使うテンプレートは、それぞれの接続も別途必要です。

イベント起動では[購読手順](docs/dots/setup.md#5-クライアント側で監視を設定する)も行い、実際のイベント名・フィルター・callback 検証の成功を確認します。プラグインの Install だけでは自動化は始まりません。

### 6. 新しいイベントで最後まで確かめる

[動作確認チェックリスト](docs/dots/setup.md#6-接続から動作までを分けて確認する)を使い、**購読後**にテスト用 Activity または選択したチャットで新しいイベントを起こします。

次のすべてを確認できたら、そのワークフローの導入完了です。

- Ori のデータを dots から読める
- worker からのイベント配送が成功する
- dots の処理が実際に起動する
- 許可した更新や案内が期待した場所へ反映される
- 対象外のイベント、重複イベント、停止依頼を正しく扱える

webhook の `2xx` は受領確認です。処理完了や Activity 更新の確認まで進めてください。困ったら[切り分け表](docs/dots/setup.md#7-よくある問題)へ戻ります。

## Docker で試す

Docker Engine/Desktop と Docker Compose があれば、Web UI と永続タスクを先に試せます。Git を使わない場合はソースをダウンロードして展開してください。

```sh
git clone https://github.com/yutakobayashidev/ori.git
cd ori
docker compose up -d --build --wait
docker compose exec web node .output/server/tools/account-setup.js
```

`http://localhost:3000` を開き、表示されたセットアップコードで owner を作成します。コードは秘密として扱ってください。

設定・更新・バックアップは [Docker ガイド](docs/docker.md)へ。手動で dots から読む場合は、上の手順 3 → 4 へ進めます。イベント自動化には手順 2 相当の追加配備が必要で、標準 Compose だけでは完了しません。Docker の既存データを Linux / Nix の新しい DB へ自動移行する手順ではありません。

## 使い始めたら

- [Linux / Nix のバックアップと更新](docs/dots/native-event-setup.md#6-バックアップと更新) / [Docker のバックアップ](docs/dots/setup.md#9-バックアップと更新): 構成に合った方法で DB と鍵を保護する
- [Ori 内の Codex 実行](docs/docker.md#add-ai-execution): 外部 dots とは別の任意機能。Home 上部でアカウントの利用枠とリセット時刻も確認できます
- [HTTP MCP とアクセス境界](docs/http-mcp.md): ツール・接続・認証の詳細
- [Workspace MCP Events](docs/beeper-mcp-events.md): イベント、購読、配送の仕様
- [開発コマンド](docs/technical-reference.md#commands) / [実装と運用の詳細](docs/technical-reference.md): 開発・SNS 連携・NixOS など

<a id="workspaces-and-current-status"></a>

## 現在の機能と確認範囲

Home は今日の完了を元の位置にコンパクトに残し、過去分は検索できる完了履歴から確認・復元できます。Board の Done 列は今日の完了を初期表示し、過去分も開けます。当日の判定には端末のローカル日付を使います。

タスク・返信 Activity、owner ログイン、Board、Focus は永続化されています。Journal、Reader、Vitals、routines にはプロトタイプの制限があります。カレンダー同期や life / Rensheng との自動連携は未実装です。[機能別の状況](docs/technical-reference.md#workspaces-and-current-status)を確認してください。

この導線は公開ドキュメントとコードを静的照合したものです。新規環境でのインストール、認証、トンネル登録、実イベント配送を通した動作試験は未実施です。各段階の確認を省略せず、自分の環境で手順 6 まで確かめてください。
