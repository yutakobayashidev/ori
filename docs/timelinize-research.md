# Timelinize：生活アーカイブの設計とPersonal Workspaceへの応用

調査日: 2026-10-11。公式サイトと公開コードを確認。対象コミットは [`11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d`](https://github.com/timelinize/timelinize/commit/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d)。静的調査であり、実データの取り込み・性能・認識精度は未検証。

関連: [Aurbodaと生活データソース](aurboda-data-sources-research.md)、[生活データソースの比較](personal-data-source-comparison.md)。

両プロジェクトと既存auditを組み合わせる具体案は、[生活観測・履歴・実行の統合設計案](personal-observability-design.md)に整理した（検討中）。

## 位置づけ

[Timelinize](https://timelinize.com/)は、写真・メッセージ・位置履歴などを自分のコンピューターへ取り込み、一つの時間軸で閲覧する個人・家族向けアーカイブ。既存アプリからのエクスポートを繰り返し取り込む使い方が中心。タイムライン、地図、会話、ギャラリーという異なる画面で同じ記録を探索する。

Personal Workspaceにとって特に参考になるのは、異なるソースの人物・出来事を結び付けるモデルと、履歴を後から読み直せる保存設計。現状のOwnTracks収集サーバーをそのまま置き換える製品ではない。

| 観点 | Aurboda（既存調査） | Timelinize（今回確認） | Personal Workspaceで狙う役割 |
| --- | --- | --- | --- |
| 中心対象 | 健康・活動・位置等の計測と分析 | 写真・会話・位置等の長期アーカイブ | 観測から文脈理解、実行、評価まで |
| 取り込み | API、端末Push、Webhook、ファイル | エクスポート・ファイルのインポート中心 | 継続収集と過去データの取り込みを併用 |
| モデル | Metrics、Activities、Tags等 | Item、Entity、Relationship | 計測値・行動区間と、その根拠・関係 |
| 保存 | PostgreSQL / PostGIS | SQLite＋通常のデータファイル | 生データと再生成可能な派生結果を分離 |
| 解釈 | ルール・統計、MCPからの利用 | 時間・人物・関係による整理、意味検索 | ルール＋必要な場面のVLM注釈＋外部エージェント |

比較は用途の整理であり、実測による品質順位ではない。

## 取り込みから閲覧まで

```text
サービスのエクスポート / 端末バックアップ / ファイル
  → データソースの認識・インポート計画
  → ソース別のFileImporter
  → Graph（Item / Entity / Relationship）を共通パイプラインへ送信
  → 重複判定・既存項目の更新・人物の照合・ファイル保存
  → SQLite＋メディアファイル
  → サムネイル / 埋め込み生成ジョブ
  → HTTP API / CLI → タイムライン・地図・会話・ギャラリー
```

Goのバックエンドにフロントエンド資産を埋め込む構成。意味検索用にPythonの補助サーバーを使用する。ソースごとの実装を共通グラフへ変換することで、閲覧側が個々のエクスポート形式へ依存しない。[main.go][main]、[データソース契約][datasource]、[処理パイプライン][processing]。

## データソース：ディレクトリの存在と動く連携を分ける

| ソース・形式 | 主な取得対象・経路 | 今回の判断 |
| --- | --- | --- |
| 写真・動画、Google Photos、Apple Photos/iCloud | ファイル・サービス側エクスポートのメディアとメタデータ | インポーターあり。クラウドの常時同期とは別 |
| X、Facebook、Instagram、Telegram、WhatsApp | エクスポートされた投稿・会話・添付等 | ソース別インポーターあり。形式ごとの制約あり |
| iPhoneバックアップ、SMS Backup & Restore | メッセージ等のバックアップ | 対応する取り込み経路あり。Android全体を自動収集するものではない |
| Firefox | `places.sqlite`の訪問履歴 | アプリの前面時間やAFKの計測ではない |
| Google Location History、GPX、GeoJSON、KML、NMEA | エクスポートされた位置・移動データ | ファイルの認識・変換・位置処理を行う |
| Strava | エクスポートの活動一覧と経路 | ファイル取り込み。Gravlのセット詳細や健康データ全般とは別 |
| メール、連絡先、カレンダー、GitHub | 対応するファイル・アーカイブ | 具体的な形式は各インポーターで確認が必要 |
| Gmail API | パッケージは存在 | 標準の`main.go`では登録されず、WIP。完成した常時API同期とは数えない |
| OwnTracks、ActivityWatch、MPRIS、Oura、Health Connect | 今回の収集候補 | 確認コミットの登録済みソースに専用インポーターなし |
| Home Assistant、Health、Music played | 公式サイトに記載 | **planned**。実装済みとして数えない |

根拠: [登録されるインポーター][main]、[ソース実装一覧][sources]、[公式のデータ準備案内](https://timelinize.com/docs/data-preparation)、[公式サイト](https://timelinize.com/)。

`DataSource`には`NewFileImporter`と`NewAPIImporter`の両方が定義されている。ただし、APIのインターフェースがあることと、各サービスのAPI同期が稼働していることは別。`APIImporter`には未使用かを問うTODOも残る。[datasource.go][datasource]。

OwnTracksのネイティブJSONをそのまま受けるHTTP endpointは今回確認できていない。GPX等へ変換する連携は考えられるが、その際に精度・出入りイベント・端末情報等を落とし得るため、元JSONの収集を先に確保する。

ソース別に確認できた制約:

- **Firefox**: URL・タイトル・説明・訪問時刻をpage-viewとして取り込む。SQLiteの本体だけを一時コピーする実装なので、評価時はブラウザ稼働中の不完全なコピーを避け、整合したスナップショットを用意する。[実装][firefox]。
- **Strava**: `activities.csv`と`profile.csv`を読み、距離・時間・カロリー・心拍の要約等を扱う。活動ファイルをGPXデコーダーへ直接渡しており、FIT/TCXへの振り分けはない。経路を持たない活動も完全に取り込めるとは判断しない。[実装][strava]。
- **GPX / GeoJSON**: GPXはtrack pointとwaypointに対応するが、`rtept`の分岐はない。GeoJSONの時刻プロパティ候補には`time`や`timestamp`がある一方、OwnTracksの`tst`はない。拡張子を変えるだけでは互換にならない。[GPX][gpx]、[GeoJSON][geojson]。
- **iCloud**: 写真の処理がある一方、認識されるアカウント情報・連絡先アーカイブの処理にはTODOが残る。対応ブランド名から全データを取り込めると考えない。[実装][icloud]。

## 共通モデルの参考点

| 概念 | 実装が持つ情報 | Personal Workspaceへの示唆 |
| --- | --- | --- |
| `Item` | 元ソースID、分類、時刻、内容、所有者、位置、メタデータ | 出来事を検索できる共通の形と、ソース固有情報を両立 |
| `Timespan` | 開始から終了までの区間 | 行動・再生・作業の継続時間を表す |
| `Timeframe` / `TimeUncertainty` | 発生時刻の候補範囲・誤差 | 「継続した時間」と「いつ起きたか不確か」を混同しない |
| `Entity` / `Attribute` | 人物等と、サービスID・識別属性 | 同じ人物の複数サービス上の記録を照合 |
| `Relationship` | ItemやEntity間の関係。値、開始・終了、メタデータ | メッセージの送信先・返信・添付等を横断的に扱う |
| 来歴 | 元のパス、取り込み時のパス、ソース、初回・更新ジョブ | 「どこから来た記録か」を確認可能にする |

根拠: [graph.go][graph]、[entities.go][entities]、[schema.sql][schema]。

人物照合は識別属性に基づく処理で、万能な人物認識AIではない。名前が似ているだけで同一人物と決めつける設計として模倣しない。会話は送信先などの関係から取得する構成になっている。[entities.go][entities]、[conversations.go][conversations]。

## 保存、再取り込み、ジョブ

- SQLiteに項目・関係・メタデータを置き、メディア等を通常のファイルとして保存する。グラフモデルだが専用グラフDBは必須としていない。
- 元ID、内容ハッシュ、設定された一意性条件などで既存項目を検索し、更新ポリシーで再取り込みを制御する。重複を全件完全に解決するという保証ではない。
- `Graph.Checkpoint`と永続化されたジョブ状態で再開を支援する。ソース側が適切なcheckpointを渡す必要があり、全インポーターの完全な再開を検証したわけではない。
- インポート、サムネイル、埋め込みをジョブとして管理する。収集完了と重い派生処理の完了を分けられる。

根拠: [schema.sql][schema]、[processing.go][processing]、[graph.go][graph]、[jobs.go][jobs]。

公式READMEはスキーマ変更に伴うタイムライン再作成の可能性と、元データの保持を明記する。取り込まれたメディアの保存と、エクスポート元の全フィールド・全ファイルの無損失保存は同義ではない。元アーカイブは別途残す。[README][readme]。

## AIと位置処理：VLM注釈の仮説との関係

Pythonサーバーは`google/siglip2-base-patch16-naflex`を使い、画像・文章の埋め込みと候補ラベルによる画像分類を提供する。Go側は画像・文章を対象に埋め込みジョブを実行し、SQLiteとsqlite-vecを使う。[Python実装][python]、[ml.go][ml]。

これは「関連する画像・文章を探す」ための実装であり、「この画面は調査作業」「会議後に作業が中断した」といった説明文をVLMで生成し、生活文脈として保存する仕組みとは異なる。モデル出力の精度ベンチマークは今回の確認範囲では見つけていない。

位置処理には、デコード→重複除去→ノイズ除去→クラスタリング→任意の経路簡略化というパイプラインがある。クラスタは時間幅を持つItemとして表現できる。OwnTracksの生データから滞在区間を派生させる設計の参考になる。ただし作者の主観的な他サービス比較を精度検証と扱わない。[locproc.go][location]。

Personal Workspaceでは、検索用埋め込み、構造化された行動注釈、生データを別々に持つ案がよい。注釈には根拠ID・モデル/ルールのバージョン・生成時刻・本人の訂正を残し、元データから再生成できるようにする。これは今回の提案であり、Timelinizeの実装済み機能という意味ではない。

## 統合方針と次の実験

1. OwnTracks・ActivityWatch・MPRIS等の収集を進め、元データを保存する。Timelinizeの導入を収集開始の前提にしない。
2. 過去データ用に、少量のFirefox履歴・GPX・写真を別の評価用タイムラインへ取り込み、日単位で振り返りやすいか試す。
3. 共通モデルには、ソースID・元ID・計測時刻・受信時刻・時間幅・時刻の不確実性・人物/端末識別子・根拠参照を検討する。最初から全グラフスキーマを移植しない。
4. 「再取り込みで増殖しないか」「時差を誤らないか」「元データに戻れるか」「手動訂正が消えないか」を確認する。表示の豊富さだけで採用を決めない。
5. Aurbodaの計測・区間分析と、Timelinizeの来歴・人物関係・探索UIを参考に、Personal Workspaceで提案と実行結果を結び付ける。

HTTP APIとCLIは共通のコマンド定義から公開される。将来の外部連携口として参考になるが、既定の管理listenerは`127.0.0.1:12002`で認証なし。外部エージェントから利用する場合の認証・公開範囲は別途設計が必要。[endpoints.go][endpoints]、[server.go][server]。

Linux向けの実装・Dockerfileがある。ただしGoだけで完結する構成ではなく、メディア処理やPython依存を含むため、NixOS上の導入は未検証。[Dockerfile][docker]、[go.mod][gomod]。

ライセンスはAGPL-3.0。設計の参考とコードの取り込みを分け、コードを組み込む場合はライセンスの適合性を確認する。現時点ではフォークの全面マージより、必要な契約とUI設計を個別に評価する。[LICENSE][license]。

[main]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/main.go
[sources]: https://github.com/timelinize/timelinize/tree/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/datasources
[datasource]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/timeline/datasource.go
[graph]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/timeline/graph.go
[entities]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/timeline/entities.go
[schema]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/timeline/schema.sql
[conversations]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/timeline/conversations.go
[processing]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/timeline/processing.go
[jobs]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/timeline/jobs.go
[readme]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/README.md
[python]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/tlzapp/python/server/server.py
[ml]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/timeline/ml.go
[location]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/datasources/googlelocation/locproc.go
[endpoints]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/tlzapp/endpoints.go
[server]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/tlzapp/server.go
[docker]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/Dockerfile
[gomod]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/go.mod
[license]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/LICENSE
[firefox]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/datasources/firefox/firefox.go
[strava]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/datasources/strava/strava.go
[gpx]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/datasources/gpx/gpx.go
[geojson]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/datasources/geojson/geojson.go
[icloud]: https://github.com/timelinize/timelinize/blob/11ecc5af75a5b0e0250c6197eb213e2b2b7f7c7d/datasources/icloud/icloud.go
