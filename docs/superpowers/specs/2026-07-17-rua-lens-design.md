# RUA Lens 設計書

- 作成日: 2026-07-17
- リポジトリ: `NadjaSenpai/rua-lens`
- ライセンス: MIT License
- Copyright: `Copyright (c) 2026 Nadja`
- 対象リリース: `v0.1.0`

## 1. 概要

RUA Lensは、DMARC aggregate report（RUA）を人間が読みやすい形へ変換し、複数期間・複数ドメインを横断して分析するセルフホスト型Webアプリケーションである。

利用者はDMARC XML、gzip、ZIPをブラウザーからアップロードする。RUA LensはファイルをCloudflare Workerのメモリ上で展開・解析し、正規化した結果だけをCloudflare D1へ保存する。元XML、圧縮ファイル、メール本文は永続保存しない。

初期リリースは手動アップロードに限定する。Google Workspace、Gmail API、Cloudflare Email Routingなどを使った自動受信は対象外とする。

## 2. 目的

- DMARC XMLを直接読まなくても、認証状況と問題のある送信元を把握できるようにする。
- レポートを期間・対象ドメイン横断で集計し、成功率と失敗傾向を可視化する。
- Dmarcianに近い基本的な分析体験を、Cloudflare上で無料または低コストにセルフホストできるようにする。
- 企業・個人を問わず利用できる汎用OSSとして公開する。
- 利用者のDMARCデータを外部SaaSやテレメトリーへ送信しない。

## 3. 対象外

`v0.1.0`では以下を実装しない。

- メールからの自動取り込み
- Gmail API、IMAP、Email Routingとの連携
- 元XMLや圧縮ファイルの保存・再ダウンロード
- IPアドレスのASN・組織名・メールサービス自動判別
- アラート通知
- DMARCポリシーの自動提案
- 複数組織を同一環境へ収容するSaaS型マルチテナント
- Cloudflare以外へのデプロイ対応
- 削除データの復元

## 4. 公開・プライバシー方針

RUA Lensは`NadjaSenpai/rua-lens`で公開する汎用OSSとし、リポジトリとGit履歴へ特定企業・個人の運用情報を含めない。

### リポジトリへ含めない情報

- 実在する管理対象ドメイン
- 社内メールアドレスや管理者一覧
- 実物のDMARCレポート
- Cloudflare account ID、D1 database ID
- Cloudflare Accessのteam domainやaudience
- API token、JWT、シークレット
- 実際のデプロイURL
- 社内限定の運用手順

設定値は環境変数、Cloudflare Secret、D1 bindingとしてデプロイ時に注入する。テストfixtureとREADMEの画面例には、`example.com`、予約済みIPアドレス、架空の組織名だけを使用する。

テレメトリー、アクセス解析、外部CDN、外部フォント、外部のIP解析APIは使用しない。

## 5. 全体アーキテクチャ

```text
社員・個人利用者のブラウザー
          │
          ▼
  Cloudflare Access
  - IdP認証
  - 未認証アクセス遮断
          │
          ▼
  Cloudflare Worker
  ├─ React SPA / Static Assets
  └─ Hono API
      ├─ Access JWT検証
      ├─ ファイル展開
      ├─ DMARC XML解析・検証
      ├─ 正規化・判定
      ├─ 集計API
      └─ 管理者限定削除API
          │
          ▼
      Cloudflare D1
```

フロントエンドとAPIは1つのCloudflare Workerとしてデプロイする。SSRは使用せず、React + ViteのSPAをWorkers Static Assetsから配信する。APIは同じWorker内のHonoで実装する。

MVPではKV、R2、Queues、Durable Objectsを使用しない。集計性能に実測上の問題が出るまではキャッシュ層を追加しない。

## 6. 認証と認可

本番環境はCloudflare Accessで保護する。Worker側でもAccess JWTを検証し、Accessの前段設定だけに認証を依存しない。

### 一般利用者

- ダッシュボード閲覧
- レポート一覧・詳細の閲覧
- XML、gzip、ZIPのアップロード

### 管理者

一般利用者の操作に加えて、レポートを削除できる。

管理者メールアドレスはデプロイ時の設定として注入し、ソースコードへ記載しない。UIで削除ボタンを隠すだけでなく、API側で管理者判定を行い、権限がなければ`403`を返す。

本番ではAccess JWTが未設定または不正な場合にfail closedとする。ローカル開発用のテストユーザー注入は本番設定から分離する。

## 7. 画面構成

### 7.1 ダッシュボード `/`

- 対象期間の総メッセージ数
- DMARC成功率
- 正常・要確認・失敗の件数
- 日別の成功・失敗推移
- disposition内訳
- 対象ドメイン絞り込み
- 失敗送信元IPランキング
- 直近に取り込んだレポート

### 7.2 レポート一覧 `/reports`

- レポート提供元
- 対象ドメイン
- 集計期間
- メッセージ数
- DMARC成功率
- 取り込み日時
- 取り込んだユーザー
- 管理者限定の削除操作

### 7.3 レポート詳細 `/reports/:id`

- レポートメタデータ
- 公開されていたDMARCポリシー
- 送信元IP別の件数
- `header_from`、`envelope_from`、`envelope_to`
- policy-evaluated DKIM・SPF
- 実際のDKIM・SPF認証結果
- `none`、`quarantine`、`reject`
- ポリシー上書き理由

アップロードは専用ページを設けず、全画面共通のボタンからダイアログを開く。

## 8. コンポーネント境界

### フロントエンド

```text
AppShell
├─ Header
│  ├─ ProductName
│  ├─ UploadButton
│  └─ UserMenu
├─ DashboardPage
│  ├─ DomainFilter
│  ├─ SummaryCards
│  ├─ DailyTrendChart
│  ├─ StatusBreakdown
│  └─ FailureSourceTable
├─ ReportsPage
├─ ReportDetailPage
└─ UploadDialog
```

Reactコンポーネントは表示と操作に限定する。XML解析、DMARC判定、D1集計をフロントエンドへ持ち込まない。

### バックエンド

```text
server/
├─ auth/
│  ├─ Access JWT検証
│  └─ 管理者判定
├─ ingest/
│  ├─ ファイル形式判定
│  ├─ ZIP・gzip展開
│  ├─ XML解析
│  ├─ DMARC構造検証
│  └─ 正規化
├─ domain/
│  ├─ DMARC型
│  └─ 正常・要確認・失敗判定
├─ repositories/
│  ├─ reports
│  └─ dashboard
└─ routes/
   ├─ reports
   ├─ dashboard
   └─ uploads
```

各単位は明確な入力・出力を持ち、XMLライブラリ固有の構造やD1 APIをroutesとUIへ漏らさない。

## 9. D1データモデル

### `reports`

- 内部ID
- レポート提供組織
- レポートID
- 対象ドメイン
- 集計開始・終了日時
- `p`、`sp`、`pct`、`adkim`、`aspf`
- 取り込み日時
- 取り込んだユーザー
- 重複検出用fingerprint

### `report_records`

- 親レポートID
- 送信元IP
- メッセージ件数
- disposition
- policy-evaluated DKIM・SPF
- `header_from`
- `envelope_from`
- `envelope_to`

### `dkim_results`

- 親レコードID
- domain
- selector
- result
- human_result

### `spf_results`

- 親レコードID
- domain
- scope
- result

### `policy_overrides`

- 親レコードID
- override type
- comment

DMARC XMLで単一値にも配列にもなり得る要素は、取り込み時に配列へ正規化する。複数のDKIM署名、SPF結果、policy overrideを捨てない。

外部キーと削除時のcascadeを使用し、親レポート削除後に孤児レコードを残さない。検索・集計対象となる対象ドメイン、期間、親ID、送信元IPには必要なindexを作成する。

## 10. 重複判定

以下を連結した値からfingerprintを生成し、`reports`の`UNIQUE`制約で二重登録を防止する。

```text
レポート提供組織
+ レポートID
+ 対象ドメイン
+ 集計開始日時
+ 集計終了日時
```

同じレポートの再アップロードはエラーではなく「登録済みのためスキップ」として扱う。

## 11. アップロードと処理フロー

```text
ファイル選択
  ↓
ブラウザーで拡張子・サイズを事前確認
  ↓ multipart/form-data
POST /api/uploads
  ↓
Access JWTと利用者メールを検証
  ↓
magic bytesを含む内容ベースの形式判定
  ├─ XML
  ├─ gzip
  └─ ZIP
  ↓
安全性検査
  ↓
XML解析・DMARC構造検証
  ↓
正規化・fingerprint生成
  ↓
XMLレポート単位のD1 transaction
  ↓
ファイル別処理結果
```

バッチ全体を1つのtransactionにはしない。5件中1件が不正でも、正常なレポートは登録する。1件のXMLについては親・子データを同一transactionで登録し、半端な状態を残さない。

レスポンスは成功・登録済み・失敗の結果を含む通常の`200`とし、`207 Multi-Status`は使用しない。

## 12. ファイル制限と安全性

初期値は以下とする。

- 1回のアップロード: 最大20ファイル
- 1回のアップロードに含まれる圧縮前ファイルの合計: 最大25 MiB
- 圧縮前の1ファイル: 最大10 MiB
- 展開後のXML: 1件最大20 MiB
- 1つの圧縮ファイルから展開するデータの合計: 最大30 MiB
- 1回のアップロードで展開するデータの合計: 最大50 MiB
- ZIP内エントリー: 最大100件
- ZIP内はXMLだけ処理
- パスワード付きZIPは非対応

以下を拒否する。

- ZIP内の絶対パス、`../`、不正な正規化後パス
- `DOCTYPE`、entity宣言、外部参照を含むXML
- DMARC aggregate reportではないXML
- 必須要素が欠落したレポート
- 制限を超えるサイズ、エントリー数、過剰な構造

拡張子、ブラウザーが送信するMIME typeだけを信用せず、magic bytesと実際の内容を確認する。XMLをHTMLとして描画しない。

## 13. DMARC判定

集計は`report_records.count`で重み付けする。

表示区分は以下の優先順で1つに決定する。

### 要確認

1. policy overrideが存在するレコード
2. DKIMとSPFが両方failで、dispositionが`none`のレコード

転送などの理由で認証評価が上書きされた場合や、監視段階・未適用ポリシーでブロックされていない場合を、即座に「正常」または「失敗」と断定しない。

### 正常

要確認に該当せず、以下のどちらかを満たすレコード。

- `policy_evaluated.dkim = pass`
- `policy_evaluated.spf = pass`

aligned DKIMまたはaligned SPFのどちらか一方が成功すればDMARC成功とする。

### 失敗

要確認と正常のどちらにも該当せず、以下を両方満たすレコード。

- DKIMとSPFが両方fail
- dispositionが`quarantine`または`reject`

DMARC成功率は表示区分とは独立して、aligned DKIMまたはaligned SPFがpassしたメッセージ数を総メッセージ数で割って算出する。policy overrideにより表示上「要確認」となったレコードでも、aligned認証がpassしていればDMARC成功数へ含める。

## 14. API

### `POST /api/uploads`

XML、gzip、ZIPを受け取り、ファイル・XMLレポートごとの成功、登録済み、失敗結果を返す。

### `GET /api/dashboard`

主なquery parameter:

- `domain`
- `from`
- `to`

D1上で以下を集計して返す。

- 総メッセージ数
- DMARC成功数・成功率
- 正常・要確認・失敗
- 日別推移（レポートの集計開始Unix時刻をUTC日付へ変換して集約）
- disposition内訳
- 失敗送信元IP上位
- 対象ドメイン一覧

ブラウザーへ全レコードを送ってから集計しない。

### `GET /api/reports`

期間、対象ドメイン、ページング条件に基づくレポート一覧を返す。

### `GET /api/reports/:id`

レポートメタデータ、ポリシー、送信元IP別レコード、DKIM・SPF結果、policy overrideを返す。

### `DELETE /api/reports/:id`

管理者だけが利用できる。対象レポートと子データをtransactionで削除する。

## 15. エラー処理

| 状況 | HTTP | 処理 |
|---|---:|---|
| 未認証 | 401 | Accessでの再認証を案内 |
| 権限不足 | 403 | 操作権限がないことを表示 |
| サイズ超過 | 413 | 許容サイズを表示 |
| 不正なXML・圧縮ファイル | 422 | ファイル単位の理由を表示 |
| 登録済み | 200 | スキップとして表示 |
| D1・内部エラー | 500 | 一般化した文言とrequest IDを表示 |

アップロード結果はファイルごとに成功・スキップ・失敗を表示する。解析途中のXML本文、内部スタックトレース、JWTをレスポンスへ含めない。

ネットワーク切断やAPI失敗時は画面状態を維持し、利用者が再試行できるようにする。削除失敗時はUI上のデータを先に消さない。

## 16. セキュリティヘッダーと通信

- Content Security Policyを設定する。
- `X-Content-Type-Options`などの基本的なセキュリティヘッダーを付与する。
- APIは同一originからのみ利用する。
- 不要なCORS許可を追加しない。
- UIライブラリ、フォント、グラフライブラリはビルドへ同梱する。
- 外部CDNへDMARCデータを送信しない。
- 独自Cookie認証は実装しない。

## 17. ログ

Workerログへ記録する情報を最小化する。

### 記録する情報

- request ID
- 処理時間
- 成功・スキップ・失敗の件数
- 一般化したエラーコード

### 原則として記録しない情報

- XML本文
- 添付ファイル
- 送信元IP一覧
- DKIM selector
- 利用者メールアドレス
- Access JWT、token、secret

取り込んだユーザーのメールアドレスはレポート一覧の監査情報としてD1へ保存するが、通常ログには出力しない。

## 18. 削除

- 管理者だけが削除できる。
- UIでは対象ドメイン、レポート提供元、期間を示す確認ダイアログを表示する。
- API側でAccess JWTと管理者権限を再確認する。
- 削除後の復元機能は実装しない。
- 元ファイルを保存しないため、復元が必要な場合は手元のファイルを再アップロードする。

## 19. 空状態

データがない場合は空のグラフを並べず、以下を表示する。

1. 対応形式の説明
2. DMARCレポートをアップロードするボタン
3. 元ファイルを永続保存しない旨
4. 合成サンプルを使ったローカル確認方法へのリンク

## 20. テスト

### 単体テスト

- XML、gzip、ZIPの読み込み
- ZIP内の複数XML
- 単一・複数のrecord、DKIM、SPF、policy override
- 任意項目の欠落と未知の追加要素
- 不正XML、DMARC以外のXML
- `DOCTYPE`、entity、ZIP Slip、サイズ超過
- fingerprintと重複判定
- 正常・要確認・失敗判定

### API統合テスト

- アップロードからD1登録まで
- 複数ファイルの部分成功
- 同一レポートの再アップロード
- ドメイン・期間フィルター
- 日別集計と成功率
- 一般利用者の削除拒否
- 管理者の削除とcascade
- 不正なAccess JWTの拒否

### UIテスト

- 初回の空状態
- アップロード結果
- ドメイン・期間フィルター
- データなしグラフ
- レポート詳細
- 管理者だけに削除操作を表示
- APIエラー後の状態維持

### E2Eテスト

Playwrightで以下の代表経路を確認する。

```text
ログイン済み状態
  → XMLをアップロード
  → ダッシュボードへ反映
  → 詳細を確認
  → 管理者として削除
  → ダッシュボードから消える
```

## 21. CI

GitHub ActionsでpushとPull Requestごとに以下を実行する。

- lint
- typecheck
- unit test
- integration test
- build

Cloudflareへの自動デプロイは`v0.1.0`の必須要件にしない。Cloudflare tokenがなくてもfork先のCIが通る状態を維持する。

## 22. OSSファイル構成

```text
rua-lens/
├─ src/
├─ migrations/
├─ test/
│  └─ fixtures/
├─ docs/
├─ .github/
│  └─ workflows/ci.yml
├─ README.md
├─ CONTRIBUTING.md
├─ SECURITY.md
├─ LICENSE
├─ wrangler.jsonc.example
└─ .dev.vars.example
```

- `.dev.vars`、D1 ID、Access設定、secretを`.gitignore`する。
- example設定には架空値だけを記載する。
- GitHub Security Advisoriesを脆弱性報告経路として案内する。
- Dependabotを有効化する。
- 依存ライブラリのライセンスを確認する。

## 23. ライセンスと謝辞

RUA LensはMIT Licenseで公開する。

```text
Copyright (c) 2026 Nadja
```

DMARCyのソースコードはコピーせず、DMARC仕様と画面上の着想だけを参考にして独立実装する。READMEのAcknowledgementsでDMARCyを紹介する。

将来Apache-2.0のコードを直接取り込む場合は、該当部分の著作権表示、ライセンス、NOTICE要件を別途維持する。

## 24. `v0.1.0`の完了条件

- XML、gzip、ZIPを取り込める。
- 元ファイルを保存せず、解析結果をD1へ保存する。
- 同一レポートを重複登録しない。
- 複数ドメインを横断管理できる。
- 実用ダッシュボードを表示できる。
- レポート一覧と詳細を確認できる。
- 管理者だけがレポートを削除できる。
- Cloudflare Access認証を検証する。
- セキュリティ系テストを含むCIが成功する。
- E2Eテストを合成データだけで通過する。
- READMEのセルフホスト手順を第三者が再現できる。
- リポジトリとGit履歴に特定企業・個人の運用情報が含まれない。
