---
doc-id: DEV-01
title: 技術スタック決定書・アーキテクチャ原則
phase: 3
status: draft-ai
owner: Tech Lead
last-updated: 2026-08-30
related-docs:
  - PRD-02: システム構成
  - PRD-05: AI 機能（任意）
  - DEV-02: セキュリティ
  - DEV-05: バックエンド実装
  - DEV-09: 状態遷移
  - DEV-10: 統合・外部 API
---

# 01-architecture-rules.md — 技術スタック決定書・アーキテクチャ原則

## 0. 本書の位置づけ（重要）

本書は docs/ 全体で **技術選定を記載する唯一の文書** である。

- 他の文書（BIZ / PRD / DEV / OPS）は、フレームワーク名・ライブラリ名・インフラ名を **選定として記述してはならない**。技術に言及する必要がある場合は「DEV-01 参照」とする。
- 技術スタックを変更する場合、修正対象は本書と `CLAUDE.md` / `.claude/` 配下の実装規約のみで完結させる。仕様文書（何を作るか）には波及させない。
- AI がコード・文書を生成する際、技術判断に迷ったら必ず本書に従う。本書にない選定は §2 のルールに従い勝手に行わない。
- 本書は本テンプレート（Astro SSR + Svelte islands + Tailwind v4、Cloudflare Workers 上で動く Dev Container テンプレート）を土台にしたプロジェクトを前提とする。テンプレート自身の詳細な実装規約は `CLAUDE.md` が正本であり、本書はそれと矛盾しないこと。
- 本書で `Confirmed` と記載した項目はテンプレート標準として確定済み。「案件実装時に確定」と記載した項目は、採用する案件が GOV-02 で追跡し GOV-01 で確定する。**実案件がテンプレ標準から逸脱する場合**も案件側の GOV-01 に記録する（ラベルの意味は 00_README §6 参照）。

---

## 1. 確定スタック（全プロジェクト共通・必ず使う）

| Layer | 決定 | Version / 備考 |
| --- | --- | --- |
| Infra | **Cloudflare Workers** | ホスティング・デプロイ・オートスケールすべて。`astro build` の出力自体が Worker になる（`@astrojs/cloudflare` アダプタ）。`./dist` は `ASSETS` バインディング経由で配信 |
| リポジトリ構成 | 1 リポジトリ内の pnpm workspaces + Turborepo モノレポ（`Confirmed` — DEV-01 §1） | `apps/public`（公開サイト）・`apps/admin`（管理 CMS）を独立した Cloudflare Worker として別々にデプロイし、`packages/schema`（Drizzle スキーマ + migrations）・`packages/server-kit`（パスワードハッシュ、ロックアウト、セッション規則、HTTP エンベロープ）・`packages/content`（開発者が更新する Markdown）を両者が参照する。`apps/admin` は専用サブドメイン（例: admin.example.com）に割り当て、アプリ丸ごとが管理画面となるため、`apps/admin` 内のページ URL に `/admin` のような接頭辞は付けない（`Confirmed`。DEV-06 §1・§4-4 参照）。2 リポジトリ構成（公開サイト用・管理サイト用）から移行した経緯は DEV-01 §1 参照。共有パッケージは「2 つ目の利用者が現れてから作る」方針を取る。`packages/server-kit` は Member 認証の追加で AdminUser 側と同じセッション規則が 2 箇所必要になった時点、`packages/content` は Content Collections を採用した時点で切り出した。逆に `packages/config`（ESLint/TS の共有設定）・`packages/ui`（共有コンポーネント）・`packages/types`（schema からの型再エクスポート専用パッケージ）は見送っている：ESLint のレイヤー境界ルールはパスパターンでアプリごとにスコープできるためルート 1 ファイルの `eslint.config.js` で足り、TypeScript も各アプリが外部共有 config（`astro/tsconfigs/strict`）を `extends` して重いオプションを共有済みで、アプリ固有の差分（`include`/`exclude`・`paths`・`types`）を各 `tsconfig.json` に数行書くだけで済むため現状の 2 アプリ規模では共有パッケージ化の利得が間接参照コストを上回らず（アプリが 3 つ以上に増える・共有設定が数行を超える・ドリフトが実際に発生する、のいずれかが起きた時点で `packages/config` 導入を再検討する）、`packages/ui` は public 側にコンポーネントライブラリを持たない方針（本表の「UI コンポーネント（公開画面）」参照）・shadcn-svelte の `components.json` が 1 アプリのスタイルシートと 1:1 対応する設計のため共有すべき実体がなく、`packages/types` は実際の利用者（`apps/admin` 以外の参照元）が出てくるまでは `packages/schema` の `$inferSelect` を直接使えば足りるため作らない |
| 環境分離（staging/production） | `wrangler.jsonc` の environments 機能（`Confirmed`） | `apps/public`/`apps/admin` それぞれの `wrangler.jsonc` 内の `env.staging` / `env.production` で分離し、D1/R2/KV は環境ごとに別インスタンスを定義する。staging 環境は用意する（OPS-02 §3-1 のマイグレーション dry-run 前提）。プロジェクト丸ごと複製方式は不採用。詳細は DEV-08 §2 |
| Backend / Frontend | Astro | v7（latest） / `output: 'server'`（SSR 専用、SSG は対象外） |
| インタラクティブ UI | Svelte | v5（runes 構文：`$state` 等）。Astro ページに `client:*` ディレクティブでアイランドとして埋め込む。ページ全体の SPA 化はしない |
| UI コンポーネント（管理画面） | shadcn-svelte | `apps/admin/components.json` 経由で `apps/admin/src/lib/components/ui` に生成。基盤は `bits-ui`。公開画面には導入しない |
| UI コンポーネント（公開画面） | なし（プレーン Tailwind） | 独自デザイン方向を都度決める（PRD-04 参照）。コンポーネントライブラリは入れない |
| CSS | Tailwind CSS | v4（`@tailwindcss/vite` 経由、CSS-first。`@import "tailwindcss";` で開始）。`tailwind.config.js` は使わない |
| Database | Cloudflare D1（SQLite 互換） | バインディング名は必ず `DB`。マイグレーションは Drizzle Kit 生成 SQL（`packages/schema/migrations/` + `wrangler d1 migrations apply`、`apps/admin` からのみ実行） |
| ORM / スキーマ管理 | Drizzle（`drizzle-orm` + `drizzle-kit`、SQLite/D1 dialect） | スキーマ定義の正本は DEV-07（Markdown テーブル定義）。`schema-build` スキル（実装済み）が DEV-07 の記述から Drizzle スキーマ（TS、`packages/schema/src/schema.ts`）を生成し、そこから `drizzle-kit generate`（`pnpm db:generate`）で migration SQL（`packages/schema/migrations/`）を生成する 2 段階パイプライン。`packages/schema` は `apps/public`/`apps/admin` 双方から参照される共有パッケージ。型は Drizzle が `$inferSelect` で自動導出するため型定義ファイルの別生成は不要（`apps/admin` が `packages/schema` から直接 import する。別パッケージへの再エクスポートは行わない — DEV-01 §1「リポジトリ構成」参照） |
| リソース実装 | コードジェネレータは持たない | `scaffold` スキル（`.claude/skills/scaffold/`）が DEV-07（テーブル定義）・DEV-09（状態遷移、採用時）を読み、**参照実装（Inquiry）に倣って** Service・Zod バリデーション・API ルートを書く。必要なリソースをまとめて 1 回で処理する。テンプレート言語で書いた雛形（Plop 等）は型チェックも lint も効かず規約変更で黙って腐るため採用しない — 正解は動く参照実装であって雛形ではない。`readRole` / `writeRole` は分けて判断し、read 側も DEV-02 §2-3 のマトリクスに従って `requireRole` で絞る（Inquiry 一覧のように `editor: ✕` のリソースがあるため）。

もう一つの `pages` ジェネレータは PRD-04 §3-1/§3-2 の「ルート」列を直接読み、`apps/admin`・`apps/public` **両方**の Astro ページ雛形を 1 コマンドで一括生成する（ルート + Layout + 見出しのみ。レイアウト構成の判断は含めない — `admin-design`/`public-design` が担当）。Service 層の雛形生成のスコープはバックエンド層のみ。ビルド物には含めない devDependency |
| ファイルストレージ | Cloudflare R2 | バインディング名は必ず `BUCKET` |
| Cache / Queue | Cloudflare KV 採用・Queues 不採用（`Confirmed`） | KV は認証エンドポイントの失敗回数カウンタ（DEV-02 §7）とメンテナンスモードフラグ（OPS-02 §3-3/§3-5)用。Queues はコンテンツ主体サイトには過剰なため不採用（§3）— 必要が生じたら新規 GOV-01 決定で追加。Session は本書 §2「API 提供（認証）」で決定済み（D1 ベース） |
| Mail | Resend（`resend` npm パッケージ、fetch ベースの公式 SDK） | プロジェクト開始時に導入。Node 専用 SDK は Workers で動かないことがあるため、fetch ベースで動作するものを選ぶ |
| Testing | Vitest + Playwright（`Confirmed`・導入済み） | Unit / Feature = Vitest（Workers 実行環境は `@cloudflare/vitest-plugin` で再現。旧称 `@cloudflare/vitest-pool-workers` から改名済み）、E2E = Playwright（両アプリに `playwright.config.ts` と spec を同梱。CI で実行）。`pnpm test` / `pnpm test:e2e`。**vitest は `^4.1.0` に固定**する — プラグインの peer がそれであり、5 系を入れると miniflare が素の `SyntaxError` で起動しなくなる。Architecture テスト（レイヤー境界）は下記 Static Analysis（`eslint-plugin-boundaries`）が担う。テスト戦略の詳細は DEV-03 §4 |
| Formatter | Prettier | `prettier-plugin-astro` / `prettier-plugin-svelte` / `prettier-plugin-tailwindcss`（Tailwind クラス順の自動統一）。`printWidth: 9999`（自動折り返しなし） |
| Lint | ESLint（flat config） | `eslint-plugin-astro` / `eslint-plugin-svelte` / `typescript-eslint` |
| 型チェック | `wrangler types` → `astro check` | `pnpm typecheck` として一括実行（Turborepo が両アプリに fan out）。`tsc --noEmit` 単体では `.astro` / `.svelte` を解析できないため必須 |
| Static Analysis | ESLint + TypeScript strict（`astro/tsconfigs/strict`）+ `eslint-plugin-boundaries`（`Confirmed`） | `eslint-plugin-boundaries` で §5 のレイヤー境界（ページ/API ルートから `db/` 直接 import 禁止等）を機械検証する。ルール定義は ESLint flat config に置く（DEV-03 §5 参照） |
| 言語方針 | 日本語のみ・i18n 機構なし（`Confirmed`） | テンプレート標準は日本語単一言語。i18n ライブラリ・URL 言語プレフィックスは持たず、UI 文字列は日本語ハードコードを許容する。多言語対応が必要な案件は GOV-02 起票の上、Astro の i18n ルーティング等の導入を案件側 GOV-01 で決定する |
| Permission | 自前実装（専用ライブラリなし） | spatie/laravel-permission 相当の npm パッケージは不採用。AdminUser は単一運営・少数ロール（`admin` / `editor`）が前提（DEV-02 / PRD-01 §1-2 参照）。Member（マイページ機能採用時のみ、PRD-01 §1-1・§1-2）はロール階層を持たない単一種別 |
| AI 開発支援 | Claude Code + `.mcp.json`（`astro-docs` / `svelte` / `cloudflare-docs`: 中核スタックの公式ドキュメント + Svelte コード検証、`context7`: その他ライブラリのドキュメント取得、`playwright`: design-review、`semble`: コード検索、`context-mode`: コンテキスト圧縮） | 単一統合 MCP（Laravel Boost 相当）はなく、複数 MCP の組み合わせで代替。開発ワークフローは 00_DEV_GUIDE 参照 |

---

## 2. 機能別標準ライブラリ（採用時のみ・これ以外は選定禁止）

その機能をプロジェクトで採用する場合に使うライブラリの一意化リスト。「必ず使う」ではなく「**使うならこれを使い、代替の選定・自作をしない**」というルール。リストにない機能が必要になった場合は GOV-01 で決定し、本書に追記する。Cloudflare Workers はエッジランタイムであり Node.js 標準 API に一部制限があるため、**導入前に対象パッケージの Workers 対応（fetch ベース / `nodejs_compat` 不要）を確認すること**。

| 機能 | Package | 導入 / 備考 |
| --- | --- | --- |
| LLM 組み込み | Vercel AI SDK（`ai` + 各プロバイダの `@ai-sdk/*`） | fetch ベースで Workers 対応。プロバイダは Claude / Gemini / ChatGPT のみ |
| OAuth / SSO | Arctic | 軽量・Workers のエッジランタイムで動作する OAuth2 クライアント。LINE ログイン等、専用パッケージが無いプロバイダは同ライブラリの上に自前実装する |
| API 提供（認証） | 自前実装（D1 裏付けのセッショントークン + httpOnly 署名クッキー。追加ライブラリ不要） | laravel/sanctum 相当の単一パッケージは不採用。`jose`/JWT は採用しない — 用途がステートレス API ではなく管理画面/マイページのログインのみのため、失効可能なセッション方式を優先する。**AdminUser と Member は完全に別系統**（別テーブル・別クッキー名・別セッション実装）とする（DEV-02 参照）。招待・パスワードリセット等の単発署名トークンは Web Crypto の HMAC 署名（`crypto.subtle.sign`）で自作し、`jose` は使わない |
| リクエストバリデーション | Zod | Laravel の `FormRequest` 相当の標準機構はない。API ルート（DEV-04）・フォーム（DEV-06）双方の入力検証をこれに統一する。Drizzle スキーマから `drizzle-zod` で自動導出することを優先し、手書きの重複定義を避ける |
| パスワードハッシュ | Web Crypto API（PBKDF2、`crypto.subtle`） | PHP の `bcrypt()` 相当の標準関数はない。`@node-rs/argon2` 等のネイティブ Node アドオンは Workers で動作しないため不採用。Web Crypto は Workers に標準実装済みで追加パッケージ不要 |
| CSRF 対策 | Astro 組み込みの Origin チェック（`security.checkOrigin`、既定で有効） | セッションがクッキーベース（上記）のため必須。GET/HEAD/OPTIONS 以外のリクエストで、`Content-Type` が form 系（`application/x-www-form-urlencoded`/`multipart/form-data`/`text/plain`）または未指定の場合に Origin 検証を強制する（`node_modules/astro/dist/core/app/origin-check.js` 参照）。追加ライブラリ・自前実装は不要。detail は DEV-02 §6 |
| 定期実行 / バッチ | Cloudflare Cron Triggers（`Confirmed`） | `wrangler.jsonc` の `triggers.crons` で定義し、Scheduled Worker（`scheduled()` ハンドラ）内で日次バッチ（データ保管期限の自動削除 — OPS-02 §4-3 等）を実行する |
| 日付・時間入力 | shadcn-svelte `Calendar` + `Popover`（`npx shadcn-svelte add calendar popover`） | 外部 JS 日付ライブラリ（flatpickr 等）を単独導入しない。管理画面でネイティブ `<input type="date">` は使わない（§3） |
| 決済 | Stripe（`stripe` npm パッケージ） | Workers 上で動かす場合は `wrangler.jsonc` に `nodejs_compat` フラグが必要（SDK の Node 依存のため） |
| ファイルストレージ | Cloudflare R2（`env.BUCKET`、テンプレート標準バインディング） | 第一候補・ゼロ設定。外部 S3 互換ストレージへの切替は原則不要 |
| 全文検索 | D1 の FTS5 virtual table（第一候補） | 対応状況は導入時に要確認。不足時は外部検索サービス（Meilisearch Cloud 等）を fetch 経由で利用。自前の `LIKE` 全文検索実装は避ける |
| 監査ログ | 自前の D1 テーブル（`activity_log`） | spatie/laravel-activitylog 相当のパッケージは不採用。単一運営が前提のためテナントスコープ列は持たない（DEV-07 参照）。必須記録操作は DEV-05 §9-1 相当の節で定義する |
| 2FA / MFA | `otpauth`（TOTP、Workers 対応） | 管理者アカウント等で要求時 |
| Web Push 通知 | FCM HTTP v1 API（fetch 直呼び出し） | `web-push` 等の Node 向けパッケージは Workers の crypto 実装差異で動作しない場合があるため、HTTP API 直叩きを第一候補とする |
| 多言語 UI | 不採用（`Confirmed` — §1 言語方針参照） | テンプレート標準は日本語のみ。多言語案件では案件側で決定・追記する |
| DB コンテンツの翻訳 | D1 の JSON 列（`json_extract` で参照） | spatie/laravel-translatable 相当のパッケージは不採用。属性ごとに `{"ja": "...", "en": "..."}` 形式で保持する |
| エラー監視 | Cloudflare Workers 標準ログ/メトリクスで開始 → 必要になった時点で `@sentry/cloudflare` | Sentry の Cloudflare Workers 専用パッケージを使う（Node 版 SDK ではない） |
| 画像処理 | Cloudflare Images（第一候補） | エッジネイティブでリサイズ・変換。要件を満たせない場合のみ他ライブラリを検討し GOV-01 に記録する |
| Excel / CSV | `xlsx`（SheetJS、Excel）+ 文字列生成（CSV） | `fs` 依存の Node 専用ライブラリは Workers で動かないため、導入前に edge runtime 対応を確認する |
| PDF 生成 | Cloudflare Browser Rendering API（`@cloudflare/puppeteer`） | Headless Chromium を自前運用しない、Cloudflare ネイティブの代替 |
| グラフ描画 | LayerChart（Svelte + D3 ベース） | shadcn-svelte と組み合わせて使われることが多いチャートライブラリ。第一候補、他ライブラリの併用は禁止 |
| Vector DB（RAG 採用時） | Cloudflare Vectorize | 追加インフラなしで D1 / Workers と統合できる第一候補。詳細は PRD-05 |

---

## 3. 不採用・禁止リスト

AI・開発者が「一般的なベストプラクティス」として提案・導入しがちだが、本テンプレートでは **意図的に採用しない** もの。方針転換する場合は GOV-01 に記録の上、本書を書き換える。

| 不採用 | 理由 |
| --- | --- |
| React / Vue / 他の UI フレームワーク | インタラクティブ UI は Svelte 一本。二重管理回避 |
| shadcn-svelte 以外の Svelte UI キット（Skeleton、Flowbite-Svelte 等） | 管理画面の UI は shadcn-svelte に統一（PRD-04 / DEV-06 参照） |
| プレースホルダを使わない SQL 文字列の組み立て | SQL Injection 防止。D1 へのアクセスは必ず `env.DB.prepare(...).bind(...)` または Drizzle 経由 |
| Drizzle 以外の ORM/クエリビルダ（Prisma、Kysely 等） | Prisma はネイティブバイナリ依存が強く Workers と相性が悪い。ORM は Drizzle に一本化（本書 §1） |
| `jose` / JWT ベースのセッション、ネイティブ Node アドオン系ハッシュライブラリ（`@node-rs/argon2` 等） | 認証は D1 セッション + Web Crypto（PBKDF2）に一本化（本書 §2）。ネイティブアドオンは Workers で動作しない |
| Vercel AI SDK 以外の LLM クライアント（自作 HTTP クライアント含む） | 統合レイヤーの一元化。プロバイダ切替容易性 |
| Claude / Gemini / ChatGPT 以外の LLM プロバイダ | コスト・運用範囲の統制 |
| `tailwind.config.js` | Tailwind v4 は `@theme` CSS-first 方式 |
| `@astrojs/tailwind` | 非推奨パッケージ。Astro 7 の peer deps を破壊する |
| npm のみ / yarn | pnpm workspaces + Turborepo を使う（`pnpm-workspace.yaml` + `turbo.json`。2 リポジトリ構成から `apps/public`/`apps/admin` + `packages/schema` の 1 リポジトリ構成へ移行したため、モノレポ対応のパッケージマネージャが必要になった。`Confirmed` の逆転 — DEV-01 §1 参照） |
| スキャフォールディング CLI（`npm create astro@latest` 等）の再実行 | `.devcontainer/` / `.claude/` / `.mcp.json` を破壊する。既存ファイルの上に手動構築する |
| ブラウザ標準の UI（管理画面での `confirm()` / `alert()` / `<input type="date">` 等） | 管理画面の UI は shadcn-svelte に統一。公開ページはネイティブ HTML のままでよい |
| Cloudflare Queues | コンテンツ主体サイトに非同期ジョブキュー（Consumer Worker・リトライ設計・DLQ）は過剰。重い処理は `ctx.waitUntil()` と Cron Triggers で賄う。必要が生じたら新規 GOV-01 決定で採用する |
| Vitest / Playwright 以外のテストフレームワーク併用 | テストコードの一貫性（§1 で Vitest + Playwright に確定）。変更は GOV-01 経由 |

---

## 4. アーキテクチャ原則一覧

| 原則名 | 内容 | 違反例 | 適用例 |
| --- | --- | --- | --- |
| **レイヤー責務分離** | `apps/admin` 内で Astro ページ/API ルート → Service → D1 の責務を厳守（`Assumed` — ディレクトリ構成は DEV-05 で確定。`apps/public` にも Service/D1 レイヤーは存在する — お問い合わせ送信（DEV-04 §5-3b）が公開側の API ルートだから。ただし認証済みルートは持たない） | `.astro` ページ内で直接 D1 クエリを書く | `apps/admin/src/lib/server/services/` 経由でビジネスロジック、D1 アクセスはその内部に集約 |
| **認可チェックの徹底** | 管理系の全操作は Service 層で `admin` / `editor` のロールを検証（PRD-01 §1-2。多階層テナント境界ではない、単一運営前提） | 認可チェックを飛ばして API ルートから直接 D1 を更新 | `requireRole(session, "admin")` のような検証関数を Service 呼び出し前に必ず通す |
| **レスポンスをブロックしない** | 重い後処理（メール送信・監査ログ・通知）はレスポンス返却後に実行し、定期処理は Cron Triggers に寄せる（Queues は不採用 — §3） | API ルート内でメール送信完了を同期的に待ってからレスポンスを返す | `ctx.waitUntil()` で後処理をバックグラウンド化、日次処理は Scheduled Worker |
| **状態遷移の集約** | エンティティの状態遷移は単一の遷移関数/モジュールに集約 | 各所で status の文字列を直書き | `transition(entity, "approved")` のような単一の遷移関数経由 |
| **可観測性優先** | 全リクエスト/ジョブに request_id + admin_user_id を構造化ログ出力 | エラー時にどの管理者の操作か追跡不能 | `console.log(JSON.stringify({ requestId, adminUserId, ... }))` |
| **境界の明確化** | Astro ページ（表示制御）/ API ルート（業務判定）/ D1（永続化）/ 外部連携の責任を混在させない | Svelte コンポーネント内に業務ルールを重複実装 | API ルート側で業務判定、コンポーネントは表示のみ |
| **安全な変更容易性** | 小さく安全に変更できる構造 | 巨大な Astro ページ・密結合 | Service 分離、Feature Flag 活用 |

---

## 5. レイヤー構造

`apps/public`（公開サイト）と `apps/admin`（管理 CMS）は独立した Astro プロジェクト・Cloudflare Worker であり（§1「リポジトリ構成」参照）、以下の Service / API Route / D1 レイヤーは `apps/admin` にのみ存在する。`apps/public` も Service / API Route / D1 レイヤーを持つ（お問い合わせ送信 — DEV-04 §5-3b）が、認証済みルートは持たない。AdminUser 認証のコードは一切共有しない（DEV-02 §1-2）。

### 5-1. Web（Astro + Svelte）

```
Astro Page (.astro) → Svelte Island (client:*、表示・操作受付のみ)
Astro Page / API Route → Service → D1 (env.DB.prepare)
                                       ↓
                     (後処理: ctx.waitUntil / 定期処理: Cron Triggers)
```

### 5-2. API（apps/admin が主。apps/public はお問い合わせ送信のみ — DEV-04 §5-3b）

```
Request → Astro API Route (apps/admin/src/pages/api/**/*.ts) → Service → D1
                                                          ↓
                                          (後処理: ctx.waitUntil)
```

### 5-3. レイヤー責務

| レイヤー | 責務 | 配置 |
| --- | --- | --- |
| Astro Page | ページのレンダリング、Svelte アイランドの配置、`<head>`/レイアウト選択 | `apps/public/src/pages/**/*.astro`（公開） / `apps/admin/src/pages/**/*.astro`（管理） |
| Svelte Island | クライアント側の表示状態管理、ユーザー操作受付、Service/API への委譲 | `apps/public/src/components/`（公開） / `apps/admin/src/lib/components/`（管理・shadcn-svelte 含む） |
| API Route | リクエストの入出力ハンドリングのみ | `apps/admin/src/pages/api/**/*.ts` |
| Service | 業務ロジック、トランザクション制御、後処理の起動（`Assumed` — DEV-05 で確定） | `apps/admin/src/lib/server/services/` |
| D1 アクセス | プリペアドステートメント、認可チェックの強制（`Assumed`） | Service 内（`@app/schema/client` の `createDb`） |
| Middleware | 認証状態の付与、セキュリティヘッダー | `apps/public/src/middleware.ts` / `apps/admin/src/middleware.ts`（各アプリに 1 つずつ。認証は行わずセキュリティヘッダーのみ） |

---

## 6. 非機能要件（NFR）

<!-- TEMPLATE: プロジェクトの想定規模に応じて数値を調整 -->
<!-- SAMPLE START: フォーマット例 — 実際の内容に置き換えてください -->
| 区分 | 要件 | 数値目標 | 根拠 |
| --- | --- | --- | --- |
| 性能：主要画面 | Astro ページ初期描画 p95 | 1.5 秒以内 | UX |
| 性能：Core Web Vitals | LCP / CLS / INP | LCP 2.5 秒以内・CLS 0.1 以下・INP 200ms 以内 | KPI-10（BIZ-02 §2-2） |
| 性能：主要ページ | 公開ページ表示 p95 | 1.5 秒以内 | KPI-11（BIZ-02 §2-2） |
| 性能：API | 主要 API ルート p95 | 500ms 以内 | — |
| 性能：AI 検索 | p95 | 5 秒以内 | — |
| 性能：AI 要約 | p95 | 30 秒以内 | — |
| 可用性：管理側 | 月間稼働率 | PRD-02 §5-2 参照（正本） | KPI-12a |
| 可用性：公開側 | 月間稼働率 | PRD-02 §5-2 参照（正本） | KPI-12b |
| スケール：公開側 | 同時アクセス（バースト時） | 数千（PRD-02 §5-1 参照） | 中規模想定（本テンプレの上限） |
| 観測性：ログ保管 | アプリケーションログ | Workers Logs 標準保持: Paid 7 日 / Free 3 日（2026-08 確認）。超過保持が必要な案件は Logpush で外部保管 | 運用要件 |
| 観測性：監査ログ | 重要操作 | 永続（D1 テーブル） | コンプライアンス |
<!-- SAMPLE END -->

---

## 7. 依存関係管理方針

| 項目 | 方針 |
| --- | --- |
| 採用基準 | メンテナンス継続中、利用実績 1000+ stars 目安、ライセンス互換、Cloudflare Workers（edge runtime）での動作実績 |
| 更新 | Dependabot + GitHub Security Advisories で追随。メジャーバージョン更新は影響評価の上で実施 |
| 廃止対応 | 代替を検討し GOV-02 に記録。決定は GOV-01 経由で本書へ反映 |

---

## 8. アンチパターン

| アンチパターン | 問題 | 正しい方法 |
| --- | --- | --- |
| Astro ページ内で直接 `env.DB.prepare()` を呼ぶ | レイヤー違反、認可チェック漏れ | Service 経由でアクセス |
| Service 内で D1 クエリを都度コピペで量産する | クエリの一貫性欠如 | 共通クエリ関数/ヘルパーに集約 |
| Svelte アイランドの `onMount` 内で状態遷移を実行 | 再マウントごとに副作用が再実行される | 遷移はユーザー操作のイベントハンドラ内で実行、`onMount` は表示データの初期化のみ |
| 長時間の LLM 処理でレスポンスを同期ブロックする | タイムアウト、UX 劣化 | ストリーミング応答（Vercel AI SDK）を第一候補とし、長時間ジョブは `ctx.waitUntil()` + `ai_jobs` テーブルのステータスポーリング（PRD-05）で非同期化 |
| URL に内部 `id`（連番）を使う | 推測可能で列挙攻撃を受けやすい | ULID / UUID を公開 ID として使う |
| status を文字列で直接更新 | 不正遷移を許容 | 状態遷移関数経由 |
| R2 のオブジェクトキーをそのまま公開 URL として返す | アクセス制御不能 | キーのみ保存し、署名付き URL を発行する |
| Service 層の認可チェックを飛ばす | 権限のない操作が通る | `admin` / `editor` のロール検証を Service の入口で必ず強制 |
| （多言語案件のみ）UI 文字列を Astro / Svelte にハードコード | 多言語化不能、表記ゆれ | 標準は日本語のみでハードコード可（§1 言語方針）。多言語採用案件では i18n 導入決定後に翻訳関数経由へ移行 |

---

## 9. 実装規約との関係

技術固有のコーディングパターン・コード例は docs/ ではなく、リポジトリの `CLAUDE.md` および `.claude/` 配下（実装規約・スキル）が正本である。

- 現存: `CLAUDE.md`（アーキテクチャ、コマンド、D1/R2 バインディングルール、ハード制約の正本）
- 現存: `.claude/skills/`（`public-design` / `admin-design` / `shadcn-svelte` / `fixing-accessibility` 等、実装時のワークフロー）
- 現存: `.claude/skills/shadcn-svelte/rules/`（コンポーネント構成・フォーム・スタイリング・アイコンの規約。上流 `huntabyte/shadcn-svelte` の vendor 物のため直接編集しない）
- 実装済み: `schema-build` スキル（DEV-07 → Drizzle スキーマ → migration の生成、`.claude/skills/schema-build/`）
- 実装済み: `scaffold` スキル（`.claude/skills/scaffold/`）。DEV-07/DEV-09 を読み、参照実装（Inquiry）に倣って Service / Zod バリデーション / API ルートを書く。画面の雛形生成は持たない — ルートと見出しだけの雛形は `admin-design`/`public-design` がどうせ作り直す

---

## 10. 記入時チェックポイント

- 技術名が本書の外（BIZ / PRD / 他 DEV / OPS）に選定として書かれていないか
- §2 にない機能ライブラリを AI・開発者が勝手に導入していないか
- 数値目標（§6）が BIZ-02 の KPI と矛盾していないか
- 禁止事項（§3）が開発速度ではなく運用品質から説明できるか
- `Open` のまま残っている §1/§2 の項目が、実装着手前に GOV-01 で決定されているか
