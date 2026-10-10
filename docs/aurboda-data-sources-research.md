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

## PC記録ツールのLinux対応

確認日: 2026-10-10。公式ドキュメントと各プロジェクトのREADMEに基づく。
この環境でのインストール・収集動作の検証はしていない。
Linux版があることと、Wayland上でウィンドウ名・離席・画面・音声を取得できることは分けて判断する。
screenpipeは会話で挙がった追加候補であり、上記のAurboda連携一覧に含まれるものではない。

| ツール                    | Linux対応                                       | 記録の範囲                                                     | Waylandや導入時の条件                                                                                                                                  |
| ------------------------- | ----------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ActivityWatch             | 対応。ローカル保存のOSS                         | アプリ・ウィンドウ利用時間、離席。ブラウザ拡張で閲覧情報も収集 | 標準の `aw-watcher-window` はX11向け。Waylandでは対応watcherを選ぶ必要がある [L1]                                                                      |
| awatcher                  | Linux向け。ActivityWatch用のwindow/idle watcher | アクティブウィンドウと離席                                     | X11、Sway、Hyprland、COSMICなどに対応。GNOMEは拡張、KDEは内蔵KWinスクリプトを使用する。通常はActivityWatchサーバーと組み合わせる [L2]                  |
| aw-watcher-window-wayland | 一部のWayland環境に対応                         | ウィンドウと離席                                               | READMEではSway・niri・phoshに対応。GNOME・KDEは非対応。awatcherとは別実装 [L3]                                                                         |
| RescueTime                | 現行の公式対応OS一覧にLinuxの記載なし           | 対応OSでのアプリ・Web利用記録                                  | 過去のLinux対応情報から現在も利用可能と判断しない。Firefox拡張の存在だけではLinux全体の記録を保証しない [L4]                                           |
| screenpipe                | Linux x86_64版あり。AppImageとソースビルド      | 画面・文字情報・音声などの記録と検索、API/MCP連携              | 公式READMEはディストリビューション・デスクトップ環境・権限による差を明記。Waylandの全環境・全機能対応とは扱わず、画面取得と音声取得を個別検証する [L5] |
| MPRIS＋ロガー             | Linuxの対応プレーヤーで利用可能                 | タイトル、URL、再生状態などから再生履歴を作る                  | D-Bus経由でありX11のウィンドウ取得には依存しない。ただしプレーヤーが公開する情報に依存。MPRIS自体は履歴保存アプリではない [L6]                         |

### ActivityWatchの選び方

ActivityWatchは保存・表示を担うサーバーと、収集を担うwatcherが分かれている。
Linuxでは本体の対応だけでなく、使用するコンポジターに合うwatcherを選ぶ。

- X11: 標準のwindow watcherを候補にする。
- Sway・Hyprland: awatcherの対応表を参照する。Swayにはaw-watcher-window-waylandという選択肢もある。
- niri: aw-watcher-window-waylandのREADMEに対応の記載がある。
- GNOME Wayland: awatcherとFocused Window D-Bus拡張を使う手順がActivityWatch公式にある [L7]。
- KDE Wayland: awatcherのKWinスクリプト経路を候補にする。別実装のaw-watcher-window-waylandは非対応。

ブラウザの詳細は `aw-watcher-web` などの拡張を別途組み合わせる。
アプリ名・ウィンドウタイトルだけから、閲覧中の正確なURLや本人の目的を常に復元できるとは考えない [L1]。

### Personal WorkspaceとNixOSでの検討順

まずActivityWatchと環境に合うwatcherで、アプリ名・ウィンドウ名・離席が実際に取れるか確認する案がある。
再生内容も必要ならMPRISロガーを加え、画面の内容や会話の検索まで必要になったらscreenpipeを別途評価する。
これは用途による提案であり、導入決定ではない。

screenpipeの現行READMEはライセンス形態をsource-availableと説明しているため、単純にOSSと呼ばない。
Linux版AppImageの提供はNixOSでそのまま動く保証ではない。採用前に、使用中のnixpkgsでの提供状況・起動方法・収集権限を確認する。
今回NixOS固有の導入手順までは検証していない。

確認時には、再ログイン後の起動、ネイティブWaylandアプリの名前、離席、ブラウザ情報をそれぞれ試す。
screenpipeでは画面・複数モニター・マイク・システム音声を個別に確認し、記録できない期間を「活動なし」に変換しない。

出典:

- [L1 ActivityWatch Watchers](https://docs.activitywatch.net/en/latest/watchers.html)
- [L2 awatcher 対応環境](https://github.com/2e3s/awatcher#supported-environments)
- [L3 aw-watcher-window-wayland Compatibility](https://github.com/ActivityWatch/aw-watcher-window-wayland#compatibility)
- [L4 RescueTime公式対応OS](https://help.rescuetime.com/article/56-what-operating-systems-does-rescuetime-support)
- [L5 screenpipe公式README](https://github.com/screenpipe/screenpipe#platform-support)
- [L6 MPRIS仕様](https://specifications.freedesktop.org/mpris/latest/)、[playerctl](https://github.com/altdesktop/playerctl)、[Aurbodaのロガー連携](https://github.com/fiddur/aurboda/blob/257fa0a5d68fc5012fdec5dce76744b5a2149bcd/docs/media.md)
- [L7 ActivityWatch Running on GNOME](https://docs.activitywatch.net/en/latest/running-on-gnome.html)

## Home Assistantと生活データを組み合わせる案

以下はPersonal Workspaceへの応用案。取得できる信号は機器・アプリ・権限に依存し、連携の実装は未決定。
Home Assistantなどが扱う家や機器の状態に、本人の意図・予定・作業記録を組み合わせ、生活の途中から再開しやすくする。

| 場面                     | 組み合わせるデータ                                 | 支援の案                                                      |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------- |
| 部屋が繰り返し散らかる   | 同じ場所の画像、本人が決めた定位置、過去の収納変更 | 蓄積する場所を確認し、収納位置の変更を試す                    |
| 帰宅後に何をするか迷う   | 帰宅イベント、今日のタスク、中断した作業           | 外出前の文脈と、家でできる次の行動を表示                      |
| 作業への復帰が難しい     | PCの離席・復帰、Focus、作業メモ、予定              | 中断前の状況と次の一手を提示。復帰だけでFocusを自動開始しない |
| 家事が途中で止まる       | 家電の状態変化、本人の開始記録、在宅状態           | 洗濯終了後の「干す」などを、再開できる状態で残す              |
| 外出準備が直前に集中する | 予定、行き先、持ち物、充電状態                     | 必要な準備をまとめ、時間のかかる充電などを先に提示            |
| 作業環境が合っていない   | 温湿度・CO₂・照度、Focus、本人の感想               | 不快だった状況を振り返り、換気や照明変更を一つずつ試す        |
| 夜の作業を切り上げづらい | 本人が決めた終了目安、PC利用、翌日の予定           | 区切りと翌日の再開メモを支援                                  |
| 物を探すことが多い       | 置き場所メモ、写真、将来のカメラ入力               | 最後に確認できた場所を、根拠と時刻付きで表示                  |

例えば洗濯は「開始 → 洗濯機が停止 → 干す → 取り込む → しまう」という複数段階を持つ。
機器が停止したことと家事全体の完了は別であり、同じ終了イベントからタスクを何度も作らず、未完了の家事の状態と関連づける。
電力低下だけで洗濯終了を確定したり、在席だけで集中を断定したりしない。

最初の実験候補は、一つの家事を開始から次の行動・完了まで追うこと。
通知を一度見逃してもHomeで再開できるか、本人の手間が減るかを確認する。

## MIT PALの研究から参考にしたいこと

PALは、ウェアラブルのカメラ・マイク・心拍などを使い、本人の状況に応じた支援を行う研究プラットフォーム。
2019年の論文はデバイス、モバイルアプリ、データベース、可視化、機械学習基盤の構成と応用例を扱う。
2024年のMina Khanの博士研究では、細かな行動文脈に合わせた介入を、時刻・位置・一定間隔などによる介入と比較している。

| 実験                   | 規模・期間                         | 博士論文の要旨で報告された結果                                                                                 |
| ---------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 現実世界のウェアラブル | 10人、4週間。終了1週・10週後に追跡 | 視覚的な文脈を使う群で、一部の習慣形成・自動性指標の改善率が大きかった。両群で介入後の習慣維持を報告           |
| PC上の介入             | 31人、6週間の介入と2週間の追跡     | サイトへのアクセスを契機にする群で介入終了時の改善率が大きかった。追跡時は平均と中央値で最も改善した群が異なる |

参加者の定性的評価では、細かな文脈に合わせる介入は適切な瞬間に届き、邪魔になりにくいと報告された。
評価には自己報告の習慣形成・自動性指標（SRHI・SRBAI）が使われている。
小規模な探索研究であり、文脈を詳しく取れば生活改善に成功するという保証ではない。
また、生活全体から問題を自律発見するAIや、収納変更の有効性を直接実証した研究としては扱わない。

出典: [PALシステム論文 2019](https://arxiv.org/abs/1905.01352)、
[Investigating Interventions in Fine-grained Contexts for Habit Formation 2024](https://dspace.mit.edu/entities/publication/7eb81430-5d75-4fd8-b2af-23b7493fbd5e)。

PALの公式説明では、本人が目標・介入方法・文脈のトリガー・センサーを選び、誤認識を訂正できることを重視している。
状況の認識・予測・介入提案を分ける構成も参考になる。
出典: [PAL公式説明](https://www.media.mit.edu/projects/pal/overview/)。

## 文脈に応じた支援の設計案

以下はPALからの示唆をPersonal Workspaceへ応用した案であり、研究でそのまま検証された機能ではない。
Aurbodaからは記録・照合・分析を、PALからは働きかける状況と評価の考え方を学び、既存の実行支援へつなげる。

### 困っている状態と働きかけてよい状態を分ける

部屋が散らかっていても、締切直前の作業中なら片付けを勧めるタイミングとは限らない。
「何が起きているか」の判定と、「今、何をどう伝えるか」の判断を分ける。

| 観測                 | 追加で考慮したい文脈           | 支援の候補                           |
| -------------------- | ------------------------------ | ------------------------------------ |
| 床に書類がある       | 作業中か、区切りがついたか     | 区切りで「この束だけトレーへ」と提示 |
| 洗濯が終わった       | 在宅か、今の作業を中断できるか | 今知らせる、またはHomeに置いておく   |
| 長時間PCを使っている | 本人が継続を望んでいるか       | 休憩候補を表示、または何もしない     |
| 帰宅した             | 疲れているか、何を再開したいか | 再開情報を表示、または休息を優先     |

通知だけでなく、静かに画面へ置く、次の区切りまで待つ、今回は何もしないことも選択肢とする。
本人の状態が分からない場合は推定を確定扱いせず、訂正・保留できるようにする。

### 本人の意図を解釈に使う

同じ動画視聴でも、休息・学習・本人が減らしたい脱線では意味が異なる。
センサーだけで良し悪しを決めず、既存のタスクやFocus、本人の説明と照合する。
支援のために新しい目標を毎回入力させるより、既に表明された意図を利用する。

### その場の行動と環境の変更を両方扱う

「今この書類を片付ける」という支援と、「毎回ここに置くなら、ここを定位置にする」という提案を区別する。
後者は配置・手順・通知・予定の組み方を変え、今後必要になる努力を減らす実験になる。
ほかにも、充電場所を変える、洗濯の終了時刻を在宅時間に合わせる、作業終了時に再開メモを残す、といった案がある。

### 完了数だけで評価しない

支援が役立ったか、邪魔だったか、本人の手間が減ったか、同じ支援を繰り返し必要としているかを見る。
無反応を意欲の欠如と扱わず、気づかなかった・タイミングが悪かった・提案が合わなかった可能性を残す。
家事などへの継続的な補助自体を失敗とはせず、本人にとっての有用性を基準にする。

最初の比較案は、同じ支援を固定時刻に出す場合と、本人の行動の区切りで出す場合を試すこと。
対象には、作業終了時の再開メモや家事の次の一手が考えられる。
提示した文脈・方法、本人の反応、実行、その後の観測を関連づけ、負担の小さいフィードバックで調整する。
単純な前後比較は予定や生活状況の違いも影響するため、効果の確定ではなく次の改善を選ぶ材料として扱う。
