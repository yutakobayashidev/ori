# Xiaomi Smart Scale S200 コレクター

S200 → 常時稼働Linux端末のBluetooth → ローカルSQLite送信待ちキュー → Oriの認証付きHTTP受信口 → 元データ保存・体重グラフ、という構成。AndroidとHome Assistantは日々の受信経路に不要です。

実装・合成パケットとHTTPの自動テストは完了。2026-10-21に製品ID `0x4DCC`（`xiaomi.scales.ms114`）の実機で復号・時刻検証・プロフィールIDの取得を確認しました。S200のMiBeacon v5、製品ID `0x45C9` / `0x4C04` / `0x4DCB` / `0x4DCC`、確定測定オブジェクト `0x4E16` に限定しています。旧Mi Scale、S400、任意のBLE機器には対応しません。

## 保存するもの

- 体重kg、測定日時、最初の受信日時、MAC、体重計のプロフィールID
- 復号前のMiBeacon service data（hex）、測定を識別するUUID
- Ori側では `source: xiaomi-s200`、取り込み時点のルーティンへの対応を追加保存

BLE受信はBleak、認証付き復号はcryptographyのAES-CCMを利用します。小さなS200専用デコーダーは[ESPHomeの形式説明](https://next.esphome.io/components/sensor/xiaomi_body_scale/)と[xiaomi-ble v1.21.1](https://github.com/Bluetooth-Devices/xiaomi-ble/blob/v1.21.1/src/xiaomi_ble/parser.py)を参照しています。Home Assistant本体への依存はありません。

SQLiteはコレクターのローカル記録兼outboxです。Oriへ送信する前に永続化し、失敗時は10秒間隔で再試行。HTTP 200と同じ測定IDの応答を確認するまで送信済みにしません。送信済みの行も残し、MAC・プロフィール・機器の測定時刻から作るIDで再起動後の再放送を排除します。同じ体重でも測定時刻が違えば別の測定です。

Oriは測定ごとのJSONを変更せず保存してからルーティン記録を追記します。途中失敗は同じHTTP本文の再送で回復します。保存済みルーティンの取り消しを再送で復活させません。測定時刻から既存の予定選択ルールで予定枠を選び、Homeの記録済み表示へ反映します。「朝」は推奨タイミングなので、朝の予定が1つなら昼や夜の測定でもその日の体重を記録済みにします。遅れて届いた測定も受信日ではなく測定日の予定へ紐づきます。測り直しは別の測定履歴として残り、Homeの同じ予定行は記録済みのままです。他の必須項目の完了は捏造しません。変更前に保存済みの記録は自動で付け替えず、次の新しい測定から適用します。

## 1. 受信環境

Nix環境では `nix build .#xiaomi-s200` でPython・依存ライブラリを含むパッケージをビルドできます。ビルド時にコレクターのテストも実行します。常駐サービスのExecStartにはこのパッケージの `bin/ori-xiaomi-s200` を指定し、開発用venvには依存させません。秘密の設定JSONはNixストアへ入れず、実行時に絶対パスで指定します。

Linux、稼働中のBlueZ、利用可能なBluetoothアダプター、Python 3.11以上、uvが必要です。コレクターの実行ユーザーがsystem D-Bus経由でBlueZを利用できることを確認します。

```sh
uv sync --locked --project collectors/xiaomi-s200
collectors/xiaomi-s200/.venv/bin/ori-xiaomi-s200 discover --seconds 30
```

NixOSでPython/uvがPATHになければ、先に `nix shell nixpkgs#python3 nixpkgs#uv` を実行します。discoverはスキャン開始と10秒ごとの受信件数を表示し、鍵なしでS200のMACと製品IDを表示します。30秒の間に体重計を起動してください。ペアリングや設定変更はしません。

## 2. 鍵とプロフィール

S200は暗号化されているためbindkeyは必要です。Xiaomi Homeへ初期登録し、[Xiaomi Cloud Tokens Extractor](https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor)等で本人のアカウントからBLE KEYとMACを取得します。Xiaomiのパスワードや復号鍵をチャット・Git・コマンド引数へ貼らず、下記の0600ファイルに保存します。初期登録と機器時刻の同期には公式アプリを使いますが、常駐運用ではスマホを必要としません。

機器の時刻が未設定（2020年より前）または受信時刻より5分以上未来の場合、測定として取り込みません。再放送を「今の新しい測定」と誤認しないためです。電池交換・リセット後は時刻を確認し、必要なら公式アプリで同期してください。受信機停止中に行われた測定の履歴回収は実装していません。

プロフィールIDは体重計が送る値です。本人のIDだけを設定し、受信API側でも照合します。複数人のデータを体重範囲で推測して本人に割り当てません。run時には初めて観測したプロフィールIDをログ表示します。本人が測定して `S200 profile … observed` を確認し、両方の設定のprofileIdを合わせて再起動してください。

## 3. Oriの保存先とルーティン

Oriで体重の記録用ルーティンを作ります。数値項目のmetricが `body_weight`、単位が `kg` である必要があります。通常の体重ルーティンはこの指標を使用します。定義のUUID、現在のversion、step ID、field IDをルーティン定義から確認します（[ルーティンの保存形式](routine-builder.md)）。

Gitの外に秘密ファイルと保存先を作成します。以下の `/absolute/private/path/s200` は実際の絶対パスへ置き換えます。コレクターとOriは別プロセスで、それぞれの保存先を所有します。

```sh
install -d -m 700 /absolute/private/path/s200
install -d -m 700 /absolute/private/path/s200/outbox
install -d -m 700 /absolute/private/path/s200/archive
openssl rand -hex 32
```

最後のコマンドで生成したランダム値を共有のtokenにします。bindkeyとは別の秘密です。

Ori側の `ingest.json`（chmod 600）:

```json
{
  "token": "REPLACE_WITH_RANDOM_HEX_TOKEN",
  "deviceId": "AA:BB:CC:DD:EE:FF",
  "profileId": 1,
  "routineId": "REPLACE_WITH_ROUTINE_UUID",
  "routineVersion": 1,
  "stepId": "measure",
  "fieldId": "weight"
}
```

Oriのwebプロセスに次を設定し再起動します。未設定なら受信口は404です。

```sh
WORKSPACE_XIAOMI_SCALE_ARCHIVE_DIR=/absolute/private/path/s200/archive
WORKSPACE_XIAOMI_SCALE_CREDENTIAL_FILE=/absolute/private/path/s200/ingest.json
```

既存のルーティン保存先は `TWITTER_LITE_ROUTINE_DIR`（既定は `~/.local/state/twitter-lite/routines`）です。通常のOriと同じ保存先を使います。受信口は厳密に `/api/collect/xiaomi-scale` のみで、専用Bearer認証を使います。ブラウザのログインをコレクターに要求しません。機器の復号鍵はOriには渡しません。

コレクター側の `collector.json`（chmod 600）:

```json
{
  "deviceId": "AA:BB:CC:DD:EE:FF",
  "bindkey": "REPLACE_WITH_32_HEX_DIGITS",
  "profileId": 1,
  "endpoint": "http://127.0.0.1:3000/api/collect/xiaomi-scale",
  "token": "REPLACE_WITH_RANDOM_HEX_TOKEN",
  "stateDir": "/absolute/private/path/s200/outbox",
  "adapter": "hci0"
}
```

`profileId: 1`、step/field名、portは例です。実機・ルーティンの値へ置き換えます。ローカルHTTPはループバック宛てのみ許可し、別ホストならHTTPSを使います。HTTPリダイレクトには追従しません。

## 4. 検証・常駐

```sh
collectors/xiaomi-s200/.venv/bin/ori-xiaomi-s200 check --config /absolute/private/path/s200/collector.json
collectors/xiaomi-s200/.venv/bin/ori-xiaomi-s200 run --config /absolute/private/path/s200/collector.json
```

checkは設定形式・秘密ファイル権限のみ検証します。鍵が正しいか、Oriに到達できるか、ルーティン設定が正しいかは実測送信で確認します。

体重計に乗り、`Final measurement saved locally` → `Measurement acknowledged by Ori` とOriの体重グラフを確認してください。ログに体重・鍵・HTTP応答本文は出しません。同じ測定を再放送しても記録が増えないこと、Ori停止中に測定し再起動後に送れることも確認します。

[user systemd unitの例](../collectors/xiaomi-s200/ori-xiaomi-s200.service.example)の絶対パスを埋め、`~/.config/systemd/user/ori-xiaomi-s200.service` に配置します。常時ログイン不要の運用ではユーザーサービスのlingerまたは適切なsystem service設定が必要です。

```sh
systemctl --user daemon-reload
systemctl --user enable --now ori-xiaomi-s200.service
journalctl --user -u ori-xiaomi-s200.service -f
```

秘密の設定・outbox・Ori archiveと既存ルーティンJSONLをバックアップ対象に含めます。outboxを消すと受信済みIDの記録も失われます。同じ保存先へ複数のコレクター／複数のOriサーバーを起動しません。

## トラブル時

- `No S200 found`: 測定で体重計を起動、Bluetoothの電源・距離・BlueZ権限を確認。
- `Measurement rejected`: bindkey、体重計の時刻を確認。リセット／再登録で鍵が変わる場合は設定更新後に再起動。
- 401/403: Oriとコレクターのtoken、MAC、プロフィールIDを照合。
- 404: Ori側の2つの環境変数と接続先を確認。
- 409: 同じ測定IDで異なる本文。キューを消して回避せず、元記録を比較して原因を調べる。
- 503: 保存先の権限やルーティン設定を確認。ルーティンを編集したら新規測定用のversion・項目IDも更新。既に受理済みの測定の再送は最初の対応を使用。

API設定エラーでもレコードはキューに残ります。先頭のレコードの問題を解消するまで後続も送信待ちになるため、運用時はサービスログを確認してください。

## 自動テスト

2026-10-21の実機確認では、製品ID `0x4DCC`、プロフィールID `1` の測定をSQLiteへ保存し、HTTPS経由でOriの既存「体重」ルーティンへ1件記録しました。送信前にコレクターを再起動してもキューから回復し、同じ実測本文の再送後も記録は1件でした。Nix環境でTLS検証に失敗する場合はサービスの `SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt` を確認します。

UM790-Proのサービス定義はdotnixの `homes/nixos/UM790-Pro/twitter-lite.nix` で管理します。初回適用ではローカルOriをinput overrideしてHome Manager generationをビルドし、そのうちwebとコレクターのunitのみ適用しました。両方のExecStartはNixストアを参照し、手動ExecStart drop-inは撤去しています。通常の再構築では、dotnixの `twitter-lite` inputをこのコレクターを含むOriのリビジョンに固定してください。

```sh
collectors/xiaomi-s200/.venv/bin/python -m unittest discover -s collectors/xiaomi-s200 -v
pnpm test src/features/telemetry/xiaomi-scale/http.server.test.ts
pnpm typecheck
```

合成MiBeaconの4製品ID、MACあり／なし、認証タグ改変、誤った鍵、時計異常、同じ体重で別時刻の測定、再起動後の再送、誤ACK、HTTP失敗・リダイレクト、認証・プロフィール照合、原記録保存後の投影失敗からの回復を検証します。実機テストの代用ではありません。
