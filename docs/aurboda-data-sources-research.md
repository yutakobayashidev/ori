# Aurbodaと生活データソースの調査メモ

調査日: 2026-10-10。
Aurbodaの確認対象は [257fa0a5d68fc5012fdec5dce76744b5a2149bcd](https://github.com/fiddur/aurboda/commit/257fa0a5d68fc5012fdec5dce76744b5a2149bcd)。
公開ドキュメントとコードの静的調査に基づく。導入・動作検証はしていない。

Personal Workspaceを、身体・生活空間・デジタル活動を観測し、理解・実行・振り返りまで扱える場所へ育てるための参考資料。
「人間OpenTelemetry」は構想の比喩であり、OpenTelemetry自体の採用方針ではない。
観測機能をPersonal Workspaceへ統合したいという意向があり、汎用の推論エンジンは外部のエージェントを利用する方向。
以下の連携は、このプロジェクトに実装済みという意味ではない。

## サービスと仕組みの一覧

アプリ、機器、連携基盤、通信規格は役割が異なる。名前だけで混同しないよう整理する。

| 名前と公式資料                                                                                                                          | 何をするものか                                                                   | 生活の観測に使える情報                                     |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [Gravl](https://gravl.ai/)                                                                                                              | 筋トレのメニュー作成・実施記録アプリ。目標や器具に応じて種目・重量・回数を提案   | 種目、セット、重量、回数など                               |
| [OwnTracks](https://owntracks.org/)                                                                                                     | iOS・Android向けの位置記録OSS。自分で保存先を管理できる                          | 位置履歴、訪れた場所、移動                                 |
| [ActivityWatch](https://activitywatch.net/)                                                                                             | ローカル保存を基本とするOSSの自動時間記録ツール                                  | アプリ・ウィンドウの利用時間、離席状態                     |
| [RescueTime](https://help.rescuetime.com/article/245-how-rescuetime-works)                                                              | アクティブなアプリやWebサイトを自動計測・分類するサービス                        | 利用時間、活動カテゴリ                                     |
| [Cronometer](https://cronometer.com/)                                                                                                   | 食事・栄養記録アプリ。カロリーや三大栄養素に加えビタミン・ミネラルも扱う         | 食べたもの、量、栄養素の摂取記録                           |
| [Last.fm](https://www.last.fm/about)                                                                                                    | 音楽の再生履歴を蓄積して好みや傾向を見られるサービス。記録の送信をScrobbleと呼ぶ | 再生時刻、曲名、アーティスト                               |
| [Strava](https://support.strava.com/en-us/articles/15402137-how-do-i-record-an-activity-on-strava)                                      | ランニング・サイクリングなどの運動記録アプリ                                     | 運動時間、距離、GPS経路など                                |
| [Oura](https://ouraring.com/how-it-works)                                                                                               | 指輪型デバイスと健康管理アプリ                                                   | 心拍、睡眠・活動の推定、各種スコアなど                     |
| [Garmin Connect](https://connect.garmin.com/)                                                                                           | Garmin機器の健康・運動記録を管理するサービス                                     | 睡眠、運動、心拍、GPSなど                                  |
| [Health Connect](https://developer.android.com/health-and-fitness/health-connect)                                                       | Androidの健康データ共有基盤。対応アプリ間で許可したデータを読み書きする          | 複数アプリが記録した心拍、歩数、体重、睡眠など             |
| [MPRIS](https://specifications.freedesktop.org/mpris/latest/)                                                                           | 対応メディアプレーヤーの状態・メタデータを照会し、再生を操作するD-Bus規格        | タイトル、再生状態、位置など。録音・映像解析ではない       |
| [Livsmedelsverketの食品DB](https://www.livsmedelsverket.se/livsmedel-och-innehall/naringsamne/livsmedelsdatabasen/sok-naringsinnehall/) | スウェーデン食品庁の食品成分データベース                                         | 食品100gあたりの栄養情報。本人の観測ではなく参照用マスター |

ActivityWatchとRescueTimeはPC利用の記録という役割が近い。
Gravlは筋トレの詳細、StravaはGPSを含む運動記録、OwnTracksは日常の位置履歴を扱う。
BLEはセンサーとの通信方式であり、単独のサービスではない。ICSもカレンダー交換形式であり、特定サービスを指さない。

## Aurbodaへの取り込み

次の表はAurbodaが持つ連携を示す。各サービス一般のAPI保証や、Personal Workspaceの採用決定ではない。

| 入力             | 取得経路                                                              | 主な変換先                           |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------ |
| Health Connect   | Androidアプリが読み取りHTTP送信。変更トークンで追加・更新・削除を同期 | 数値は時系列、睡眠・運動は活動区間   |
| BLEセンサー      | Androidアプリが対応機器に直接接続                                     | 心拍・心拍間隔・歩数などの測定データ |
| Oura             | API取得とWebhook更新通知                                              | 時系列、睡眠・瞑想などの活動         |
| Garmin Connect   | セッションを使った取得                                                | 時系列、活動、GPS経路                |
| Strava           | API取得とWebhook                                                      | 活動、心拍・GPSなどの詳細            |
| Gravl            | API取得。Health Connect到着からの詳細取得もある                       | 筋トレ活動とセット情報               |
| OwnTracks        | スマホからHTTP送信                                                    | 位置履歴と登録地点                   |
| ActivityWatch    | PC上の送信スクリプト、またはAurboda Androidアプリ                     | 利用記録とカテゴリ別の活動区間       |
| RescueTime       | API取得                                                               | ActivityWatchと共通の利用記録モデル  |
| Last.fm          | API取得                                                               | 再生履歴とルールによる分類           |
| MPRIS            | Linux上のロガーが記録し、送信スクリプトでアップロード                 | メディア再生履歴                     |
| カレンダー       | ICS URLから取得                                                       | `calendar_event` 型の活動            |
| Cronometer       | CSVインポート                                                         | 食事・栄養記録                       |
| 食品DB           | 一括インポート                                                        | 食品の栄養マスター                   |
| 本人・外部ツール | Web、REST、MCP                                                        | 測定値、活動、食事、メモ             |

出典: [データソース一覧](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/docs/data-sources.md)、
[Health Connect](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/docs/health-connect.md)、
[メディア連携](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/docs/media.md)。
一覧ドキュメントには旧Tagsモデルの記述が残るため、上表のカレンダー保存先は実装に合わせた。

## 複数の記録を組み立てる方法

基本の流れは、ソース別の取得 → 正規化 → 時間による照合・集計 → TimelineやMCPでの参照。
数値、時間区間、位置、PC利用をそれぞれのモデルで保持し、すべてを一つの汎用イベントへ押し込んではいない。

### 同じ活動へ詳細を補う

Health Connectから届いたGarmin・Gravlのセッションを、元アプリと外部IDから識別する。
元サービス由来の活動として保存し、詳細取得ジョブを起動する。
後から元サービスの記録が届くと、同じ活動に筋トレのセットや運動の詳細を補える。

出典: [ソース識別と詳細補完](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/docs/health-connect.md#source-identity)。

### 細かいPC利用を活動区間にする

ActivityWatchのアプリ名・タイトル・開始時刻・継続時間を利用記録へ変換する。
分類ルールでカテゴリを付け、同じソース・同じカテゴリの記録は隙間が2分以内なら結合する。
1分未満の区間は活動として生成しない。細かい元の利用記録も残る。
「開発」などの分類は、本人が集中していたことの証明ではない。

出典: [取り込み](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/apps/backend/src/integrations/activitywatch/sync.ts)、
[区間生成](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/apps/backend/src/services/screentime-activities.ts)。

### 身体側の記録とメディアを照合する

公式の例では、Garminのヨガ活動と、その時間にPCで再生したヨガ動画を照合し、動画タイトルを活動の `session_name` に付ける。
実再生時間や再生率も条件にできる。時計が運動の区間を、PCが取り組んだ内容を補う構造。

Deduction Rulesは条件に合う時間区間の積集合などを計算し、活動生成・属性補完・再分類を行う。
ここはLLMによる判定ではなく、決定論的なルール処理。

出典: [メディア条件の例](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/docs/media.md#rules)、
[行動推定エンジン](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/apps/backend/src/services/deduction-engine.ts)。

## 実装を参考にするときの境界

- 同じ出来事の重複統合、同じ時間帯の表示、条件による派生活動の生成は別の処理。
- カレンダーの予定は参加・実施の証拠ではない。センサー値、機器やAIの推定、本人の申告も区別したい。
- `raw_records` は同じ外部IDの更新で上書きする。過去の全バージョンを保持するイベントストアではない。
- ActivityWatchは直接正規化テーブルへ保存するため、すべての入力が原形のまま保存されるわけではない。
- 現在のTagsはActivitiesへ統合され、旧Tagsテーブルは移行用に残っている。
- 欠測を考慮する分析はあるが、記録がない活動を「活動なし」と扱う経路もある。収集停止と実際の不活動の区別は別途必要。
- 主要な既存連携は身体・運動・PC利用・移動・メディア・予定・食事。部屋カメラ、音声文字起こし、スマートグラスの統合は今回の構想側の拡張領域。

根拠: [原データ更新](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/apps/backend/src/db/raw-records.ts)、
[活動スキーマ](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/apps/backend/src/schema/activities.ts)、
[欠測判定](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/apps/backend/src/services/correlations/selectors.ts)。

## Personal Workspaceで参考にしたいこと

以下は調査からの提案であり、実装順序や技術選定は未決定。

- OwnTracks、ActivityWatch、MPRIS、Health Connectは、それぞれ場所・PC利用・再生内容・身体記録を供給する入口になる。
- 観測には時刻・ソース・外部IDを持たせ、再同期と本人の訂正を両立させる。
- 既存のActivityはタスクや返信を表す。Aurbodaの観測された活動区間とは意味が違うので、同じモデルへ無理に統合しない。
- 共通時間軸で複数領域を見られるTimelineと、外部AIが使える検索・集計機能を重視する。
- すべての観測をタスクに変えず、思い出す・理解する用途だけでも成立させる。
- 生活改善へつなぐ場合は、提案・実施・その後の観測を関連づける。汎用推論エンジンの自作を前提にしない。

関連資料: [実行支援](execution-support.md)、[時間と集中](activity-time-and-calendar-design.md)、[Vitalsの現状](vitals-preview.md)。
