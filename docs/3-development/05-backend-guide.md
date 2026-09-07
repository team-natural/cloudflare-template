---
doc-id: DEV-05
title: バックエンド実装ガイド
phase: 3
status: draft-ai
owner: Tech Lead
last-updated: 2026-08-30
related-docs:
  - DEV-01: 技術スタック決定書・アーキテクチャ原則
  - DEV-04: API 仕様
  - DEV-07: DB 物理設計
  - DEV-09: 状態遷移
  - DEV-10: 統合・外部 API
  - PRD-01: ドメインモデル
  - OPS-01: 契約ポリシー（付録のデータエクスポート要件）
  - CLAUDE.md: コード例・実装パターンの正本（`.claude/rules/backend.md` のような分割ファイルはこのテンプレートには無い）
---

# 05-backend-guide.md — バックエンド実装ガイドテンプレート

## このセクションの目的

バックエンド実装のディレクトリ構成、レイヤー責務、トランザクション方針、非同期処理設計方針、
ログ・観測方針、命名規約の「原則」を定義する。

- 技術スタックの選定は本書には書かない（DEV-01 が唯一の正本）。
- **コード例・実装パターンの正本: `CLAUDE.md`**（DEV-01 §9 参照）。
  本書は「何を守るか」を定義し、「どう書くか」は同ファイルに委ねる。

## 0-H. ハイブリッド編集ガイド（要点）

- 推奨モード: Human-first または Hybrid
- 人間確認必須: 責務分離の妥当性、N+1 対策、ログ方針、認可チェックの網羅性

---

## 1. ディレクトリ構成（標準）

このモノレポでは `apps/public`（公開サイト）と `apps/admin`（管理 CMS）が独立した Cloudflare Worker であり（DEV-01 §1「リポジトリ構成」参照）、以下のツリーは **`apps/admin` 配下**のバックエンド構成を示す（`apps/public` も同じ構成の `lib/server/` を持つ — 標準では Member 認証とお問い合わせ送信。軽量 EC（FG-05）採用時はここに増える）。`apps/admin/src/lib/server/` 以下の内部構成は Inquiry を例にした参照実装で確定済み（Confirmed）。新規リソースはこの構成・命名にそのまま従う（`scaffold` スキルが参照実装を指す — `.claude/skills/scaffold/`）。

```text
apps/admin/src/
├── pages/
│   ├── api/v1/**/*.ts               # API Route（入出力ハンドリングのみ。/api/v1/ でバージョニング — DEV-04 §1）
│   └── **/*.astro                   # 管理画面ページ（src/layouts/Layout.astro）。apps/admin は
│                                     #   サブドメインで丸ごと管理画面のため URL に /admin 接頭辞は
│                                     #   付けない（DEV-01 §1、DEV-06 §1・§4-4）
├── lib/
│   ├── components/                  # Svelte island + shadcn-svelte（$lib エイリアス）
│   ├── server/                      # 確定済み。参照実装: apps/admin/src/lib/server/services/inquiries.ts 等
│   │   ├── services/                #   業務ロジック・トランザクション境界（ドメイン別ファイル。例: inquiries.ts, media.ts, activity-log.ts）
│   │   ├── db/                      #   Drizzle クライアント（DEV-01 §1）。スキーマ本体は packages/schema（下記）
│   │   ├── auth/                    #   セッション検証 + requireRole（DEV-02 参照。例: session.ts）
│   │   ├── http/                    #   レスポンス整形・エラークラス・カーソルページネーション（DEV-04 §3・§4・§8）
│   │   └── validation/              #   drizzle-zod で導出した Zod スキーマ（DEV-01 §2）
│   └── hooks/                       # shadcn-svelte 用フック
└── middleware.ts                    # セキュリティヘッダーのみ（確定。認証はここでは行わない — 下記参照）

# Cloudflare バインディングの型（`Cloudflare.Env` として DB / BUCKET / KV）は `wrangler types` が
# 各アプリ直下に `worker-configuration.d.ts` を生成する（`pnpm typecheck` の第 1 段階）。gitignore
# 済みの生成物なので、手書きの `env.d.ts` は作らない。

packages/schema/
├── src/schema.ts                    # Drizzle スキーマ本体（DEV-07 から生成。apps/public・apps/admin 双方から参照される共有パッケージ）
└── migrations/                      # D1 migrations（Drizzle Kit 生成 SQL。apps/admin からのみ適用）

apps/public/src/
├── pages/
│   ├── api/v1/inquiries.ts          # お問い合わせ送信（認証不要 — DEV-04 §5-3b）
│   └── **/*.astro                   # 公開ページ（Layout.astro）
├── lib/server/                      # 公開側の Service / D1。admin 側とコードを共有しない
├── components/                      # Svelte island（公開側）
└── middleware.ts                    # セキュリティヘッダーのみ
```

> Laravel の `Jobs/` / `Events/` / `Listeners/` / `Notifications/` / `StateMachines/` / `Enums/` に相当する専用ディレクトリは無い。非同期処理は `ctx.waitUntil()` と Cron Triggers（Queues は不採用 — DEV-01 §1/§3）、状態遷移はドメイン別 Service 内の単一関数（DEV-01 §4）、列挙値は TypeScript の string literal union 型で代替する。

> **認証検証は各 API ルートハンドラの冒頭で行う**（DEV-04 §2、決定済み）。フレームワーク提供のミドルウェアスタックが無いため、`apps/admin/src/middleware.ts` に認証を集約しない — 同ファイルはセキュリティヘッダー専用（CLAUDE.md 参照）。各ルートは `requireSession(cookies, db)`（`apps/admin/src/lib/server/auth/session.ts`）を呼んでセッションを取得し、必要に応じて `requireRole(session, role)` を続けて呼ぶ。

> Cloudflare バインディング（`env.DB` 等）は `Astro.locals.runtime.env` ではなく `import { env } from "cloudflare:workers"` で取得する（`Astro.locals.runtime.env` は Astro v6 で削除済みの旧 API であり、採用バージョンの v7 — DEV-01 §1 — にも存在しない。型は `wrangler types` が生成する `worker-configuration.d.ts` の `Cloudflare.Env` を使う）。

> **AdminUser と Member のセッションは完全に分離する**（DEV-02 §1-1・§1-2）。テーブル（`admin_sessions` / `member_sessions`）、クッキー名（`admin_session` / `member_session`）、照合コード（各アプリの `src/lib/server/auth/session.ts`）を共有しない。両アプリが同じ D1 を読むため、この分離だけが「片方で発行したトークンがもう片方で通らない」ことを保証している（`apps/public/tests/unit/inquiries.test.ts` の session isolation テストで検証）。
>
> 共有するのは `packages/server-kit` の**規則**だけ：トークン生成（`newSessionToken`）、TTL 検証（`sessionExpiresAt`）、有効期限と `status` の判定（`isActiveSession`）。ここは 2 つの実装でズレてはいけない部分であり、逆に保管場所は絶対に共有しない。ロール判定（`requireRole`）とログインの組み立て（`login`）は各アプリに残す — admin はロールを持ち Member は持たないため、共通化すると分岐だらけになる。

---

## 2. レイヤー責務と実装原則

各レイヤーの配置と責務の一覧は DEV-01 §5-3 を正とする。実装時の原則：

| レイヤー | 原則 |
| --- | --- |
| Astro Page / Svelte Island | 表示状態管理・ユーザー操作受付・Service または API Route への委譲のみ。D1 に直接アクセスしない |
| API Route | 入出力ハンドリングのみ。業務ロジックを書かない |
| 入力検証 | Service 層の入口（または API Route）で実施。検証は Zod で統一する（DEV-01 §2「リクエストバリデーション」、決定済み）。Drizzle スキーマから `drizzle-zod` で自動導出することを優先し、手書きの重複定義は避ける |
| Service | 業務ロジック・トランザクション境界・後処理の起動（`ctx.waitUntil()`）・認可チェック関数の呼び出し |
| 認可チェック | Policy クラスに相当する仕組みは無い。ロールを検証するエクスポート関数 `requireRole(session, role)`（`apps/admin/src/lib/server/auth/session.ts`、DEV-02 §3-2）を Service の入口で呼ぶ。Inquiry には所有者チェック（Member の「本人のみ」相当）が無いため、リソース単位の `canEditInquiry(...)` のような関数は作らない — ロール検証のみで足りる場合は増やさない |
| D1 アクセス | Drizzle のクエリビルダ（`drizzle-orm`、D1/SQLite dialect。DEV-01 §1、決定済み）経由。Service 内で `@app/schema/client` の `createDb(env.DB)` と Drizzle スキーマ（`@app/schema`）を使う。Drizzle 自体は内部でプリペアドステートメントにコンパイルされるため、SQL Injection 対策（文字列連結禁止）の原則は変わらない（DEV-01 §3） |
| 状態遷移 | 単一の遷移関数/モジュールに集約（DEV-01 §4）。status の直接更新禁止 |
| 共有基盤（`packages/server-kit`） | 2 つ目の利用者が現れた規則だけを置く。パスワードハッシュ（PBKDF2）、ロックアウト、セッション規則、HTTP エンベロープ（`jsonItem` / `jsonCursorCollection` / `toErrorResponse` / `AppError` 群）。**アプリ固有の判断（ロール、ドメインロジック）は置かない** |

- 依存方向は Astro Page/Svelte Island/API Route → Service → D1 の一方向のみ。
- URL キーは `public_id`（ULID）。内部 `INTEGER PRIMARY KEY AUTOINCREMENT` を外部に出さない（DEV-07 §1）。

---

## 3. トランザクション方針

| 項目 | 方針 |
| --- | --- |
| 境界 | Service 層に置く。Astro Page / Svelte Island / API Route では直接 D1 の書き込みをまとめない |
| 単位 | 1 業務操作 = 1 トランザクション。複数ステートメントの原子性は Drizzle の `db.batch([...])`（内部で D1 の `env.DB.batch()` を呼び、単一トランザクションとして実行される。DEV-01 §1）でまとめる。逐次に `.run()` を個別実行すると原子性が保証されない |
| 状態遷移関数での適用 | 状態遷移関数（DEV-09）が本体の UPDATE と付随する INSERT（`activity_log` への記録等）のように複数テーブルを更新する場合も、必ず `batch()` で 1 トランザクションにまとめる（遷移だけ成功しログだけ失敗する不整合を防ぐ） |
| 外部 I/O | LLM・外部 API・メール送信をトランザクション（`batch()`）内で同期実行しない。DB 書き込み完了後に `ctx.waitUntil()` で起動する（§4） |

---

## 4. 非同期処理設計方針

Cloudflare Queues は不採用（`Confirmed` — DEV-01 §1/§3）。重い処理はレスポンスをブロックしない形で以下の 2 手段に振り分ける（DEV-01 §4「レスポンスをブロックしない」）。

| 手段 | 用途 |
| --- | --- |
| `ctx.waitUntil()` | リクエスト起点の後処理（メール送信、監査ログ以外の付随処理、長時間の LLM ジョブ）。レスポンス返却後も Worker の実行を継続させる |
| Cron Triggers（Scheduled Worker） | 定期処理（データ保管期限の自動削除 — OPS-02 §4-3、集計バッチ等） |

| 区分 | 方針 |
| --- | --- |
| リトライ | Queues のような自動リトライ基盤は無い。外部 API 呼び出しは DEV-10 §1 の共通パターン（指数バックオフで最大 3 回）を呼び出し関数内で実装する |
| 失敗時 | `failed_jobs` 相当のテーブルは持たない。関連エンティティの状態を `failed` へ更新し（AI は `ai_jobs.status` — DEV-07 §6）、構造化ログ（§9）にエラーを出力する |
| ユーザー通知 | リトライ失敗が利用者影響を持つ場合はメール通知（Resend、DEV-01 §1） |
| 実装漏れの検出 | 失敗処理の実装漏れを静的解析で強制する仕組みは無いため、コードレビュー必須観点とする（DEV-03 §4） |

### 4-1. 通知はメール一律（PRD-03 FG-06）

Laravel の Mailable / Notification のような二重の抽象化機構は無い。アプリ内通知（ベル・バッジ・WebSocket 配信）の基盤は本テンプレ標準では持たず、通知はメール一律（Resend、DEV-01 §1）で送信する。永続化する通知履歴テーブル（`notifications` 等）は無い — 送信結果は必要に応じて `activity_log`（DEV-07 §4-4）に記録する。

| 宛先 | 機構 |
| --- | --- |
| 運営（admin）向けアラート | Resend（`resend` npm）で直接メール送信（F-06-01: Inquiry 受信、F-06-02: Order 受信） |
| 利用者向け（Inquiry/Order 送信者） | Resend で自動返信メール送信（F-06-03） |

- 本番はいずれも `ctx.waitUntil()` 経由で送信し、レスポンスをブロックしない（§4）。実装パターンの正本は `CLAUDE.md`。

---

## 5. 認可チェックの多層防御

マルチテナント境界（Organization 単位のデータ分離）は本テンプレートに存在しない（単一運営が前提。00_README §0-1・§2-2）。その代わりに、管理系操作が `admin` / `editor` のいずれのロールに許可されているかを Service 層で確実に検証する（DEV-01 §4「認可チェックの徹底」）。単層に頼らず重ねる：

| 層 | 強制方法 |
| --- | --- |
| D1 アクセス | Drizzle クライアント（`@app/schema/client` の `createDb(env.DB)`）とスキーマ（`packages/schema/src/schema.ts`、DEV-07 生成、`@app/schema` としてインポート）経由でアクセスし、文字列連結の Raw SQL を禁止する（DEV-01 §1・§3）。単一運営前提のためテナントスコープの引数化は不要 |
| Service | 全メソッドの入口で `requireRole(session, "admin" \| "editor")`（DEV-02 §3-2）のようなロール検証関数を必ず通す |
| 認可チェック関数 | `admin_users.role`（DEV-07 §4-1）を確認。`admin` は `editor` 専用操作も実行できる（上位ロールが下位ロールの権限を包含する） |
| API Route / Astro Page | 操作前に認可チェック関数を必ず呼ぶ |

---

## 6. AI 機能の実装方針（採用時のみ、PRD-05 参照）

- LLM 呼び出しは Vercel AI SDK（`ai` + `@ai-sdk/*`、DEV-01 §2）経由のみ。独自 HTTP クライアント・独自抽象
  レイヤー（`LlmClient` 等）を作らない。
- 対話的な機能はストリーミング応答（AI SDK の `streamText`）を第一候補とし、長時間ジョブは `ctx.waitUntil()` +
  `ai_jobs` のステータスポーリングで非同期化する（§4、DEV-01 §8）。レスポンスを同期ブロックする呼び出しは禁止。
- AI ジョブは `ai_jobs` テーブル（DEV-07 §6）で状態（queued / processing / completed /
  failed）とトークン使用量を記録する。
- モデル ID は環境変数（`wrangler.jsonc` の `vars` / Secrets）で管理。各プロバイダが公表する正式なモデル ID を
  完全な形で指定する（省略形・独自に構成した ID を使わない。ID の体系はプロバイダごとに異なるため、採用時に
  必ず公式ドキュメントで確認する — PRD-05 §4-3）。

---

## 7. 決済連携（軽量 EC 採用時のみ — PRD-03 FG-05）

詳細は DEV-10 §2 参照（決済プロバイダの選定は DEV-01 §2、Stripe）。本テンプレは Organization 単位のサブスク課金を持たないため、決済は `orders` の 1 回払いチェックアウトのみ（DEV-07 §7）。要点：

- ホスト型チェックアウト（Stripe Checkout Session）によるゲスト注文の決済
- Webhook は `stripe_event_logs` テーブル（DEV-07 §7-3）に記録し、冪等性を保証
- 注文状態は決済プロバイダ → D1（`orders` テーブル、DEV-07 §7-1）へ同期（pending/paid/fulfilled/cancelled）

---

## 8. パフォーマンスガイドライン

| 項目 | 方針 |
| --- | --- |
| N+1 防止 | Drizzle の `with`（リレーション先の一括取得）を使い、ループ内で `.get()` / `.first()` 相当を N 回呼ばない。JOIN またはまとめて取得するクエリに書き換える。複数 ID の一括取得は `inArray(...)` や `db.batch()` を使う（DEV-01 §1） |
| インデックス | 外部キー全カラム（`author_id` / `handled_by` / `uploader_id` 等）、`status`、`public_id` は必須（DEV-07 §8） |
| キャッシュ | リクエスト内で繰り返し参照するデータは Service 層でリクエスト単位に memoize。リクエストを跨いだキャッシュが必要な場合は Cloudflare KV（採用済み — DEV-01 §1）を使えるが、D1 が十分高速なため導入は実測で必要が確認できた箇所に限る |
| 集計クエリ | KPI 等は集計テーブルで事前計算（更新は Cron Triggers の日次バッチ — §4） |
| 重い処理 | `ctx.waitUntil()` で後処理化、定期処理は Cron Triggers（§4）。レスポンスを同期ブロックしない |

---

## 9. ログ・観測方針

全処理・API に request_id + admin_user_id を構造化ログ出力する（DEV-01 §4）。

| ログ種別 | 出力先 | 必須コンテキスト |
| --- | --- | --- |
| アプリケーション | Cloudflare Workers 標準ログ（DEV-01 §6。保持: Paid 7 日 / Free 3 日） | request_id, admin_user_id |
| AI ジョブ | 同上 + ai_job_id, provider | LLM の入出力は最初の 100 文字のみ |
| 監査（重要操作） | `activity_log` テーブル（自前実装 — DEV-01 §2、DEV-07 §4-4。永続。単一運営前提のため `organization_id` は持たない） | causer（actor）, subject（target）, event, properties（before/after） |
| 決済 Webhook | `stripe_event_logs` テーブル（DEV-07 §7-3。軽量 EC 採用時のみ） | event_id, type, processed_at |
| エラー監視 | Cloudflare Workers 標準ログ/メトリクスで開始 → 必要時 `@sentry/cloudflare`（DEV-01 §2、導入時） | 5xx / タイムアウト |

### 9-1. 監査ログの必須記録操作（`activity_log` テーブル — DEV-01 §2、DEV-07 §4-4。単一運営前提のため `organization_id` は持たない）

- 意味のある状態遷移を行う Service の関数 — 承認 / 却下、停止 / 再開、解決 / 棄却、削除、
  金銭・プラン変更 — は必ず `activity_log` へ 1 件記録する。専用パッケージ（spatie/laravel-activitylog 等）は
  使わないため、共通の薄い記録用ヘルパー関数（`logActivity(...)`、`apps/admin/src/lib/server/services/activity-log.ts`）を
  経由して INSERT する。免除する場合は理由をコメントで明記する。
- 記録は Service 内にインラインで行う（ヘルパー関数の呼び出し程度は可）。横断的な単一の「AuditLogService」に
  判定ロジックそのものを持たせない。コード例は `CLAUDE.md` 参照。
- **テストや静的解析では「呼び出しの欠落」を検出しにくい**（Vitest / `eslint-plugin-boundaries` でも記録漏れ自体は捕捉できない）。状態を変更する
  Service の関数の新設・レビュー時に「`activity_log` への記録はどこか」を必ず確認するコードレビュー
  必須観点とする（DEV-03 §4）。手本にした兄弟 Service にログがないと漏れが連鎖するため、
  最初の 1 件から徹底する。
- 人間の actor が存在しないシステム処理（定期バッチ・自動削除等）では、「system ユーザー」の
  User レコードを発明して causer に据えない。`causer_id` を NULL のまま記録し、発生源は
  `log_name` / `properties`（例: `source: system`）で示す（OPS-02 の自動削除記録もこの方式）。
  呼び出し元が未実装で actor が確定しない段階では、コメントを残して記録を保留し、
  呼び出し元の実装時に再訪する。

---

## 10. 命名・コーディング規約の原則

- 全関数・変数に型を明示する（`any` 禁止。`tsconfig.json` は `astro/tsconfigs/strict` を継承）。列挙値は
  TypeScript の string literal union 型（`"active" | "suspended" | "archived"` 等）で表現する
- 早期 return でネストを浅く。1 関数 20 行以下を目安
- ファイル生成のスキャフォールディング CLI は使わない（`npm create astro@latest` 等の再実行は
  `.devcontainer/` / `.claude/` / `.mcp.json` を破壊するため禁止 — DEV-01 §3）。既存のディレクトリ構成に
  手動でファイルを追加する
- デバッグ用の一時的な `console.log` / `debugger` を残さない（構造化ログ出力のための `console.log`
  呼び出しは対象外 — DEV-01 §4「可観測性優先」）
- 業務上の可変パラメータ（上限値・期間・レート・試用日数等の閾値）は Service にハードコード
  しない。非機密の値は `wrangler.jsonc` の `vars`、機密の値は Cloudflare Workers Secrets
  （`wrangler secret put`）で管理し、ローカル開発は `.dev.vars`（gitignored）に記載する
  （デプロイなしに環境ごとの再調整を可能にするため）。外部サービスの ID・認証情報も同様の
  方式とし、`.astro` / `.svelte` / `.ts` への直書きを禁止する
- 詳細な規約とコード例は `CLAUDE.md` を正本とする

---

## 11. 付録（任意機能）: データエクスポート

**OPS-01 §4-2（解約時のデータ取扱い）の契約条項が確定してから着手する任意機能。**
契約上の義務が発生しないプロジェクトでは実装しない。要件概要：

| 項目 | 要件 |
| --- | --- |
| 内容 | 解約後 90 日以内にサイトデータを CSV / JSON で一括エクスポート |
| 実行方式 | `ctx.waitUntil()` による非同期処理（§4。Workers の実行時間上限に注意し、大規模データは分割処理する） |
| 配信方式 | Cloudflare R2（DEV-01 §1）上の一時ファイルを署名付き URL（72 時間）でメール通知。署名付き URL の発行方式（R2 presigned URL か API Route 経由のトークン検証か）は **Open**（案件実装時に確定。DEV-10 §4 と合わせて Media 参照実装時に確定） |
| 実行権限 | `admin` ロールのみ。1 日 1 回まで |
| 保管期限 | 一時ファイルは 72 時間後に自動削除。実行は監査ログ（`activity_log`）に記録 |

エクスポート対象テーブルはプロジェクトの主要テーブルを列挙して確定する（DEV-07 と整合させる）。
実装スケルトン・API エンドポイントは `CLAUDE.md` 参照。
運用手順（実施フロー・問い合わせ対応）は OPS-02（運用ハンドブック）参照。

---

## 12. 記入時チェックポイント

- ディレクトリ構成が §1 の確定済み参照実装（Post を例にした構成）に従っているか
- Service / D1 アクセスの責務が明確か（Astro Page / API Route から D1 を直接呼び出していないか）
- 認可チェック（D1 アクセス層 + Service + 認可チェック関数 + API Route/Astro Page における `admin` / `editor` ロール検証）が多層で網羅されているか
- トランザクション境界が Service 層（`batch()`）に統一されているか
- AI / 状態遷移の実装方針が採用方針（PRD-05 / DEV-09）と整合しているか
- N+1 対策・キャッシュ戦略が PRD-02 と整合しているか
- 状態を変更する Service の関数に監査ログ記録（§9-1）が漏れていないか
- 通知がメール一律（§4-1）になっており、アプリ内通知の基盤を作り込んでいないか
- 業務閾値・外部サービス ID が `vars` / Secrets 化（§10）されているか
- DEV-04 のエンドポイントと API Route / Astro Page が対応しているか
- 技術名の選定を本書に書いていないか（DEV-01 参照になっているか）
- D1 アクセスが Drizzle のクエリビルダ経由になっているか（`env.DB.prepare()` の直呼びが Service に残っていないか。§2・§5）
- このリポジトリが担う利用者種別（AdminUser または Member）以外を前提にした汎用 auth ヘルパーを書いていないか（§1、DEV-02 §1-2）
- 付録のデータエクスポートは OPS-01 の契約条項確定前に着手していないか
