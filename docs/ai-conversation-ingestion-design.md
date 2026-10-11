# AI会話の収集と、gbrain・Rensheng・Personal Workspaceの境界

2026-10-11。調査＋実装案、未実装。ユーザーの「brain」はGarry Tanのgbrainを指すと確認済み。
確認commit: Workspace `c512708`、gbrain `af7dffc812b6e67f6cf71383c39f560f5258b9c5`、Rensheng `d0397ccd7fa7e35c8546201c3b01b27137276f71`。
公式資料・公開ソース・ローカル設定コードを確認。実会話のアップロード、Cookie取得、gbrain導入はしていない。

関連: [生活観測の設計案](personal-observability-design.md)、[製品境界の調査](product-boundaries-research.md)、[gbrain open loops](gbrain-open-loops-research.md)。

## 結論

全体の目標は[生活全体のトレース](architecture.md)。AI会話は生活の中で相談・判断・意図が生まれる過程として記録し、実行や改善につながらない会話も検索・振り返りの対象にする。本書はその収集経路と製品間の境界を扱う。

**Codex・ChatGPTの会話をPersonal Workspaceのデータソースに加える。元記録、検索用の会話、長期記憶を別に保持する。**

gbrainは会話の取り込み・版管理・検索・記憶抽出の有力な参考実装。ただし既存パーサーは読みやすい会話を作るために情報を選別するので、「全部アップロードして後から解釈する」という目的には、それだけでは足りない。まず取得できる元記録を私有アーカイブへ保存し、gbrain型の処理はそこから作る派生データとする。

「全部」は、指定したアカウント・端末から取得できた記録を、要約で置き換えず残すという要件。削除済みの会話、取得されない添付、記録されない内部処理まで復元できるという意味ではない。収集できた範囲と欠けた範囲を表示する。

## 3つの役割と重なり

| 観点       | gbrain                                                  | Rensheng / life                                  | Personal Workspace                                          |
| ---------- | ------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| 主眼       | 複数エージェントから使う記憶・検索・訂正・取り込み      | 出典のある個人文脈を、小さく読めるMarkdownへ整理 | 身体・環境・デジタル行動・会話・意図・実行を統合する方向    |
| 会話の扱い | transcript→会話ページ→任意のfacts/embedding             | 必要な事実・選好・目標等を選別して記録           | 元会話を保存・探索し、タスクや観測・auditへリンクする案     |
| 正本       | gbrain自身のpage/fact等。取り込みは必ずしも無損失でない | 人物・関係・選好・採用済み目標・手順等の個人文脈 | 実装済みのActivity・実行状態・audit。外部原本の保存は拡張案 |
| 推論       | 既存agentから利用でき、追加の抽出・自動処理も持つ       | 外部agentが文脈を編集・検証する                  | 外部agentへ根拠を提供し、構造化した提案・注釈を受け取る     |
| 観測と評価 | 汎用memory/retrievalが中心。日次支援やtask機能もある    | 長期文脈・手順・意味のある結果を保持             | Aurboda型の計測＋Timelinize型の履歴＋実行・介入評価を目指す |

会話検索・個人記憶・日次brief・task管理はgbrainにもあり、それ自体をPersonal Workspaceの独自性としない。今回の差分は、会話で表明された意図と、PC/身体/場所の観測、本人の操作、後日の結果を結び付けること。まだ検証するべき製品仮説である。

lifeを第二の会話データベースにしない。会話をlifeへ全量複製する代わりに、外部agentが引用箇所とともに選好・目標・手順の更新案を作る。AIの提案や仮定を本人の意思へ自動昇格させない。lifeには明示的に残すraw snapshotの運用もあるため、「原文を一切保存できない」とは扱わない。[Rensheng README][rensheng]、[recordsの方針][records]。

## gbrainが実際に取り込むもの

| 経路                   | 確認した実装                                                                        | 全量保存に対する制約                                                      |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `transcripts ingest`   | Codex、Claude Code、Hermes等のsessionログ、ChatGPT/Claudeのexportを会話ページへ変換 | 元形式の無損失バックアップではない                                        |
| Codex archive adapter  | ユーザー入力とassistant本文を抽出。CLIの新旧user message形式に対応                  | 注入context、tool出力、reasoning等を除外。サイズ上限ではhead/tailのみ扱う |
| ChatGPT export adapter | `mapping`と`current_node`から選択中の分岐をたどる                                   | 別分岐、system/tool role、画像等の非文字列partsを落とす                   |
| Codex SessionEnd hook  | transcriptを読んでローカルのdream用corpus等へ保存する経路                           | archive ingestとは別。短期保持・読み込み上限があり、全量uploadではない    |
| ChatGPT live connector | ブラウザ用の非公開backendから取得し、exportと同じ変換経路へ渡す                     | 公開APIとしての安定契約はない。実装自体がprovisionalと記載                |
| facts / embeddings     | 明示的なオプションで抽出・検索用処理を追加                                          | 生の会話保存と別の処理。初回backfillで全件LLM処理を要求しない             |

出典: [Codex adapter][codex-parser]、[ChatGPT adapter][chatgpt-parser]、[CLI取り込み][ingest]、[hook処理][hook]、[ChatGPT provider][provider]。

さらに、live connectorの取得JSONは一時spoolで、取り込み後に削除される。archiveの`raw_data`も元rollout全体ではなく秘匿化したsession metadataである。「raw」という列名だけで完全な原本が残ると判断しない。[spool][spool]、[archive保存処理][archive-ingest]。

特にCodexはhookに来るsession IDと、rolloutヘッダーのthread IDが同じとは限らない。gbrainはthreadごとの`payload.id`を識別に使い、親とsubagentをまとめて潰さない工夫を持つ。ヘッダー・イベントの形式はversion付きfixtureで管理している。[Codex adapter][codex-parser]。

## gbrainから取り入れたい実装

| 実装上の工夫                               | こちらでの使い方                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| parserごとの対応形式・確認version・fixture | Codex更新でuser発言だけ消える等の障害を検出。unknown eventを黙って消さない |
| 内容hashで同じ会話の再取り込みを省略       | rawの受領と正規化の冪等性を別々に確保。新しい版では古い索引も更新          |
| 長い会話をページ分割、古いpartを整理       | 検索chunkを再生成しても原本・message IDは維持                              |
| redactionを保存前の共通処理にする          | 検索・モデル開示用の派生本文に適用。元記録を変えた場合は加工済みと明示     |
| 同期watermarkと末尾の再走査                | 更新された会話を取り直す。単に最新時刻以降だけを見る方式にしない           |
| 失敗ledger、retry、partial状態             | 1件失敗しても所在を失わず、未収集を可視化。成功件数だけで完了としない      |
| receiptとembedding完了を分ける             | 受領後に検索処理が止まっても元記録は保全。再処理できる                     |

gbrainのChatGPT同期は、既定7日の重複期間を走査し、通常一覧とarchived一覧を扱う。失敗項目は隔離後もledgerで再試行し、未解決ならpartialとする。このような仕組みは参考になるが、7日やretry回数を理由なく同じに固定しない。[同期処理][sync]、[connector guide][connectors]。

gbrainのhook設定writerには、特定の旧Codex版に依存したtrust hashやdetach処理もある。現行dotnixの宣言的設定に、そのwriterをそのまま実行しない。参考にするのは既存hookの保持、短時間で受付を終えること、欠落の検出である。[hook writer][hook-writer]。

## Codex：hookは収集の通知、永続キューを本体にする

公式hooksでは`transcript_path`を受け取れるがnullの場合があり、形式の安定性は保証されない。SessionEndは同期実行で最大3秒、subagentでは発火しない。subagent hookの共通session IDは親のID。クラウドorchestrationではローカルcommand hook非対応の制約もある。[公式hooks](https://learn.chatgpt.com/docs/hooks)。

したがって、SessionEnd内で全ファイルを圧縮してネットワーク送信する設計にはしない。提案する経路:

```text
Codex Stop / SessionEnd / その他必要な通知
  → ローカルspoolへ短い収集要求をatomicに保存
  → systemd user workerがrolloutの確定部分を収集
  → 認証付きHTTPSで私有アーカイブへ送信
  → durable receiptを確認して送信cursorを進める
  → 正規化・索引作成は別処理

起動時・定期再走査 → hook漏れ・強制終了・archived移動を補う
```

Stopを低遅延の通知候補、SessionEndを最終確認候補とし、既存TTSと併存させる。通知だけでは書き込みのflush時点やファイル消失を保証できないため、ソースの保持期間内にworkerが取得できることを測る。保存完了まで元ファイルが残る運用を確認し、必要なら定期checkpoint収集を併用する。

dotnixの`modules/features/coding-agents/codex/default.nix`には既にSessionStart/Stop/PermissionRequest/UserPromptSubmit/SubagentStartのhook設定がある。新hookをそのリストへ追加し、既存のTTSを置き換えない。実行version・hook有効状態は配置先で検証する。今回その変更はしていない。

送信単位は全文の毎回転送ではなく、source instance＋thread＋file generation＋byte range＋hashを持つchunkを候補にする。末尾の未完JSONLも原本のbyte列として保存し、解析だけを次回へ持ち越す。書き手の終了やファイル消失で完結しなかった場合はincompleteとして残す。再送は同一receiptに収束させる。truncate/rewriteされたときは別generationにし、単純なoffset再開で取りこぼさない。hook入力の任意pathを読ませず、設定したCodexログroot内のファイルに限定する。

subagentを含む場合は、hookの親IDだけでは不足する。rolloutヘッダーのthread IDと親子関係を保持し、live/archived storeの再走査で補う。sessionの正規化に失敗してもrawの受領を取り消さず、parser未対応として一覧に残す。

## ChatGPT：まずexport、その後にlive同期の可否を検証

公式の履歴exportはZIPとして会話等を取得でき、`conversations.json`または分割JSONを含む経路がある。プラン・workspaceで可否が異なる。削除済み会話を復元できる仕組みではない。[公式export](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data)、[会話JSONの案内](https://help.openai.com/en/articles/9106926-transfer-exported-conversations-between-chatgpt-accounts)。

| 経路                          | 推奨する扱い                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| 公式export ZIP                | 最初のbackfill。ZIPとmanifestを保持してから解析。分岐と添付の取り込み率を検証          |
| gbrain型のlive connector      | 少量で接続・一覧・詳細・archived・更新・失敗を検証する独立実験。実用性を確認後に定期化 |
| ChatGPTへWorkspaceのMCPを接続 | 選択した記録の検索・書き込みには使えるが、それだけで全会話が自動転送されるとは扱わない |
| OpenAI APIのconversation管理  | ChatGPTアカウントの全履歴APIと同一視しない                                             |

gbrainの実装はCookieを使う`/api/auth/session`と`/backend-api/conversations`等へのアクセス。providerソースは実アカウントで未検証の暫定形式と明記し、Cloudflare等で取得できない可能性も記載している。公開ドキュメントで保証されたChatGPT全履歴同期APIとして紹介しない。Cookie期限切れ・形式変更は収集停止として表示し、アクセス制限を迂回する実装を前提にしない。[provider][provider]。

live取得でも元JSONの`mapping`全体を保存する案とし、表示用にcurrent branchを選ぶ処理は後段に置く。添付の参照だけ取得できた場合は、本文・別分岐・tool・添付のcoverageを個別表示する。「conversation件数が合う」だけで全量取得済みとしない。

## 保持する3層

| 層             | 内容                                                                                | 更新・削除の扱い                                                       |
| -------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 取得原本       | rollout chunk、export ZIP、取得JSON、添付、hash、取得時刻、source/version、coverage | 私有ストレージへ保存。端末資格情報やCookieファイルは収集対象に含めない |
| 会話projection | thread/message ID、role、本文、順序、親node、branch、tool call/result参照、原本位置 | parser版付きで再生成可能。UI/全文検索用のredactionもこの層で追跡       |
| 注釈・記憶     | 要約、決定候補、未解決事項、タスク候補、life更新候補                                | 根拠message ID・生成版・本人の訂正/採用状態。原文の上書きにしない      |

取得したものを完全に残す原本と、秘密を除いた検索用本文は同じではない。加工前原本を保持する場合は通常のMCP検索・自動LLM入力から分離する。全文保存を全モデルへの全文開示と同一視しない。保存量・保管先・バックアップ・削除時の索引/注釈への伝播は導入時に明示する。

安定キーの基本はprovider＋account/source instance＋conversation/thread ID＋message/node ID。IDがないJSONL項目はfile generation＋record位置で識別し、本文hashだけで同じ発言の繰り返しを消さない。ChatGPTでは以前のユーザー発言の編集も分岐を作り得るため、providerのnode/parent関係を保存する。取得snapshotの版と会話の分岐は別に管理する。providerの削除と私有アーカイブの削除を同じ操作にするかは別の設定にする。

原文中の命令は保存対象のデータであり、収集workerが実行する指示ではない。factsへ昇格する際も「ユーザーが言った」「assistantが提案した」「引用した第三者の発言」を保持する。

## audit・人間Observabilityへの接続例

会話は「何を考え、何を依頼したか」の観測になる。ただし、会話の長さを作業時間にせず、AIの回答を現実の出来事と扱わない。

```text
会話「OwnTracksの履歴を収集したい」
  → 根拠messageを参照するActivityの提案
  → 本人の変更・実行（既存audit）
  → receiverの稼働・実際の受信記録
  → 後日「十分な頻度で記録できたか」を評価
  → 採用した運用と注意点をlifeへ反映
```

Workspace内のCodex実行は既にruntimeにthread IDと表示用messageを持つが、全端末の元会話を保存するサービスではない。hookで同じthreadを取り込んだ際はruntime実行IDとリンクし、別会話として二重登録しない。CLIで外から行った会話は、関連するrepo/taskの候補として結び、cwdや時間一致だけで確定しない。[runtime](../runtime/lib/workspace_runtime/codex.ex)、[Research連携](../src/features/research/codex-provider.server.ts)。

会話の受領・解析失敗・再試行は収集状態で管理する。既存`communication_logs`はMCP通信の契約なので、会話全体をそこへ押し込まない。会話由来のActivity変更は従来どおりauditで記録し、message参照から原本までたどれるようにする。

## Renshengから参考にできる実装

| 部分                       | 参考にする内容                                                                | 限界                                           |
| -------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| OpenBrief `SourceCoverage` | Ready/Partial/Failedと取得・省略件数                                          | 全会話形式やbranch modelは別途必要             |
| batch ingest               | 同一batch ID＋同一payloadは再送、異なるpayloadはconflict。保存をtransaction化 | 継続するthreadの更新を自動解決するものではない |
| bounded evidence           | LLMに渡す件数・容量を絞り、外部内容をuntrustedと明記                          | 全件保存とは別の開示方針                       |
| life索引のreceipt/hash     | 文脈の編集・検証・索引の時点を区別                                            | 会話の全文検索や収集cursorの代替ではない       |

出典: [coreモデル][rensheng-core]、[batch保存][rensheng-store]、[agent host][rensheng-host]、[life索引][rensheng-index]。

現在のOpenBriefはPC metadata収集とAttention Handoffの実装を持つが、agent transcript永続保存は対象外と明記する。将来は画面captureデータソースへ絞る方向が記載されているものの、capture追加・役割移行は未完了。既存OpenBriefをそのまま会話archiveや第二の実行台帳にしない。[OpenBrief][openbrief]、[比較と方向性][rensheng-comparison]。

## 採用・取り込み・ライセンス

gbrainはMIT LICENSE本文とpackage.jsonの宣言を確認した。AGPLのAurboda/Timelinizeより、コードを選択移植する際のライセンス条件は異なる。コピーするコードの著作権・許諾表示を保持し、依存物とテストfixtureの来歴も確認する。[gbrain LICENSE][license]。

RenshengはCargo.tomlでMITを宣言しているが、確認commitにtracked LICENSE本文は見つからなかった。宣言と本文確認を区別する。今回Renshengやgbrainのコードはコピーしていない。[Cargo.toml][rensheng-cargo]。

| 案                                               | 判断                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| gbrain一式を記憶基盤として利用                   | 横断記憶を早く使いたい場合に有力。ただしlossyなarchiveとは別にraw保存が必要。lifeやActivityの二重正本を作らない |
| parser・fixture・redaction・再試行設計を選択利用 | **今回の第一候補**。取得原本は自前の契約、会話projectionは必要な部分を参考/移植                                 |
| gbrainのhook installerをそのまま実行             | dotnix管理と衝突し得る。今回は不採用、宣言的なhook追加とuser serviceにする                                      |
| gbrainのDB・scheduler・推論基盤を全面移植        | 現段階では不採用。会話収集のために第二のagent frameworkを持ち込まない                                           |

選択移植時は元commit、ファイル、変更理由、ライセンス、fixtureを台帳へ記録する。gbrainのパーサーが意図的に落としている項目を、そのまま「全量対応」として使わない。元データを残し、provider更新時にfixtureを足して再解析する。[既存の取り込み方針](personal-observability-design.md#ライセンスと取り込み方針)。

## 次に実装する単位

1. **Codexの私有アーカイブ受付**: 元chunk保存、hash照合、冪等receipt、coverageを実装。まず合成fixtureで検証する。
2. **dotnixのspool＋worker**: 既存hookへ追加し、1台で送信。ネットワーク停止・再送・強制終了・archived移動・subagent・大きいログで検証する。
3. **会話projectionと検索**: 原本から再生成。ユーザー/assistant/tool、分岐、編集を区別。全文検索から始め、embeddingは任意の後処理。
4. **ChatGPT export取り込み**: ZIPを保持し、分割JSON・長文・別分岐・画像/添付の不足を検証。既存会話と安定IDで統合する。
5. **live connectorの少量実験**: 接続できることと全量同期できることを分け、期限切れ・partial・更新漏れを確認してから定期化。
6. **Activity・audit・lifeへ接続**: 決定候補に根拠を付け、採用したものだけ実行や長期文脈へ進める。

最初の成功条件は「ネットワークを切っても会話が失われず、再送で増殖せず、検索結果から該当の原文・branchへ戻れる」。gbrainを導入したことやhookが1回動いたことだけでは完了としない。

[codex-parser]: https://github.com/garrytan/gbrain/blob/af7dffc812b6e67f6cf71383c39f560f5258b9c5/src/core/transcripts/codex.ts
[chatgpt-parser]: https://github.com/garrytan/gbrain/blob/af7dffc812b6e67f6cf71383c39f560f5258b9c5/src/core/transcripts/chatgpt-export.ts
[ingest]: https://github.com/garrytan/gbrain/blob/af7dffc812b6e67f6cf71383c39f560f5258b9c5/src/commands/transcripts.ts
[hook]: https://github.com/garrytan/gbrain/blob/af7dffc812b6e67f6cf71383c39f560f5258b9c5/src/commands/hook.ts
[hook-writer]: https://github.com/garrytan/gbrain/blob/af7dffc812b6e67f6cf71383c39f560f5258b9c5/src/core/bootstrap/codex-hooks.ts
[provider]: https://github.com/garrytan/gbrain/blob/af7dffc812b6e67f6cf71383c39f560f5258b9c5/src/core/connectors/providers/chatgpt.ts
[sync]: https://github.com/garrytan/gbrain/blob/af7dffc812b6e67f6cf71383c39f560f5258b9c5/src/core/connectors/sync.ts
[connectors]: https://github.com/garrytan/gbrain/blob/af7dffc812b6e67f6cf71383c39f560f5258b9c5/docs/guides/chat-connectors.md
[license]: https://github.com/garrytan/gbrain/blob/af7dffc812b6e67f6cf71383c39f560f5258b9c5/LICENSE
[rensheng]: https://github.com/yutakobayashidev/rensheng/blob/d0397ccd7fa7e35c8546201c3b01b27137276f71/README.md
[records]: https://github.com/yutakobayashidev/rensheng/blob/d0397ccd7fa7e35c8546201c3b01b27137276f71/template/records/README.md
[rensheng-core]: https://github.com/yutakobayashidev/rensheng/blob/d0397ccd7fa7e35c8546201c3b01b27137276f71/crates/openbrief-core/src/attention.rs
[rensheng-store]: https://github.com/yutakobayashidev/rensheng/blob/d0397ccd7fa7e35c8546201c3b01b27137276f71/crates/openbrief-store/src/attention.rs
[rensheng-host]: https://github.com/yutakobayashidev/rensheng/blob/d0397ccd7fa7e35c8546201c3b01b27137276f71/crates/openbrief-app/src/agent_host.rs
[rensheng-index]: https://github.com/yutakobayashidev/rensheng/blob/d0397ccd7fa7e35c8546201c3b01b27137276f71/template/scripts/index.py
[openbrief]: https://github.com/yutakobayashidev/rensheng/blob/d0397ccd7fa7e35c8546201c3b01b27137276f71/docs/openbrief.md
[rensheng-comparison]: https://github.com/yutakobayashidev/rensheng/blob/d0397ccd7fa7e35c8546201c3b01b27137276f71/COMPARISON.md
[rensheng-cargo]: https://github.com/yutakobayashidev/rensheng/blob/d0397ccd7fa7e35c8546201c3b01b27137276f71/Cargo.toml
[spool]: https://github.com/garrytan/gbrain/blob/af7dffc812b6e67f6cf71383c39f560f5258b9c5/src/core/connectors/spool.ts
[archive-ingest]: https://github.com/garrytan/gbrain/blob/af7dffc812b6e67f6cf71383c39f560f5258b9c5/src/core/transcripts/ingest.ts
