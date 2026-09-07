---
doc-id: DEV-03
title: 品質方針
phase: 3
status: draft-ai
owner: Tech Lead / PdM（兼務前提）
last-updated: 2026-08-18
related-docs:
  - BIZ-02: 品質目標 KPI
  - DEV-01: アーキテクチャ原則
  - DEV-08: デプロイ判断
  - OPS-02: 運用ハンドブック
  - 実装規約: `CLAUDE.md`（DEV-01 §9 参照）
---

# 03-quality-policy.md — 品質方針テンプレート

## このセクションの目的

品質目標、完了定義、テスト戦略、レビュー基準、技術的負債の管理方法を定義する。**品質目標の参照源は BIZ-02**。

## 0-H. ハイブリッド編集ガイド（要点）

- 推奨モード: Hybrid（AI 整理 + Tech Lead / PdM（兼務前提）レビュー）
- 人間確認必須: 品質目標の現実性、DoD の厳しさ、運用できるテスト戦略

---

## 1. 品質方針

- **品質の定義**: 顧客が安心して継続利用でき、サービス価値を損なわない状態
- **優先する品質特性**: 信頼性、パフォーマンス、使いやすさ、変更容易性
- **妥協しない最低基準**:
  - 認証・認可（`admin` / `editor` ロール境界）の欠陥はリリースしない
  - 決済の整合性問題はリリースしない
  - データ損失（特に決済済みデータ）はリリースしない
- **KPI との接続**: BIZ-02 §2-2 の正本マップ経由で KPI-10〜13 に接続（KPI-14 は廃止 — インシデント解決目安は OPS-02 §2）

---

## 2. 完了定義（DoD）チェックリスト

機能 PR が Merge されるための条件：

- [ ] 要件（PRD-03 機能 ID）に対応する受け入れ条件を満たす
- [ ] テストが追加 / 更新されている（正常系・バリデーション異常系・権限異常系。Vitest — DEV-01 §1）
- [ ] 型チェック（`pnpm typecheck` = 各アプリで `wrangler types` → `astro check`）でエラー 0 件（DEV-01 §1「型チェック」参照。`tsc` 単体では `.astro`/`.svelte` を解析できない）
- [ ] Prettier + ESLint（`pnpm check`。レイヤー境界ルール `eslint-plugin-boundaries` 含む — §3-3）で整形・Lint 済み
- [ ] 関連 Service（`apps/admin/src/lib/server/services/`）/ D1 アクセス関数の Unit テスト（Vitest）がある
- [ ] ロール権限（`admin` / `editor`）のテストが含まれる
- [ ] AI 機能を含む場合、LLM 呼び出しのモックテストがある（`ctx.waitUntil()` で非同期化する場合はその起動のモックも — DEV-01 §4）
- [ ] ログ出力（request_id / admin_user_id）が適切
- [ ] セキュリティ観点（DEV-02 §11）の自己確認完了
- [ ] コメントが CLAUDE.md「Comments」の基準を満たす（**そのコメントが防ぐ具体的なミスを言えるか**。言えなければ削除。理由の説明はコミットメッセージか docs へ）
- [ ] DEV ドキュメントへの影響があれば更新済み

---

## 3. テスト戦略

### 3-1. テスト種別

| 種別 | 目的 | 対象 | ツール | カバレッジ目標 | タイミング |
| --- | --- | --- | --- | --- | --- |
| Unit Test | 業務ロジック検証 | Service（`apps/*/src/lib/server/services/`）/ 状態遷移関数 / `packages/*` の共有基盤 | Vitest + `@cloudflare/vitest-plugin`（**workerd 上で実行**。DEV-01 §1） | E2E で到達できない条件を必ず含める（下記） | PR 時 |
| Feature / Integration Test | エンドポイント動作 | Astro API Route（`apps/*/src/pages/api/**/*.ts`） | Vitest（同上）または Playwright の `request` | 認証が必要なルートは全て（下記） | PR 時 |
| Architecture Test | レイヤー境界遵守（DEV-01 §4/§5） | Astro Page/API Route → Service → D1 の依存方向 | `eslint-plugin-boundaries`（確定済み。詳細は §3-3） | — | PR 時（Lint 自動） |
| Integration Test | 外部 API 連携 | Stripe / LLM（Vercel AI SDK）/ R2 / CI | Vitest + モック（DEV-10 §9 のモック方針参照） | 主要連携 100% | PR 時 |
| E2E Test（**導入済み**・CI で実行） | 主要フロー | 管理画面ログイン / Member 認証 / お問い合わせ送信 / Content Collections の記事表示 | Playwright（`playwright` MCP は design-review 用、テストランナーとしても同ツール） | ハイドレーション（`client:*` 忘れ）は E2E でしか捕まらない | PR 時 |
| Static Analysis | 型安全性 | 全 `.ts` / `.astro` / `.svelte` コード | ESLint + TypeScript strict（`astro/tsconfigs/strict`）。`pnpm typecheck`（各アプリで `wrangler types` → `astro check`） | エラー 0 件 | PR 時 |
| Style Check | コードスタイル | 全コード | Prettier + ESLint。`pnpm check` は format:check + lint + typecheck + **単体テスト**をまとめて実行する | 100% Pass | PR 時（Hook 自動 — `.claude/hooks/format-and-check.sh`） |
| Security Test | 脆弱性検知 | 依存関係 / コード | Dependabot / `/security-review` | High 以上 0 件 | 自動検知 / リリース前 |

> **単体テストと E2E は役割が違う。** 単体テストは workerd 上で動くため D1 も KV も本物で、E2E から到達できない条件を担当する：設定値が未設定（`NaN`）のときのフェイルクローズ、セッションの期限切れ、停止済みアカウントの即時失効、未知のメールとパスワード誤りの処理時間が桁で違わないこと。ロックアウトが無効化されていても E2E は全件通るため、ここは単体でしか守れない。逆にハイドレーション（`client:*` の書き忘れ）はサーバー側で描画されてしまうため E2E でしか捕まらない。
>
> D1 を使うテストは `tests/setup.ts` がマイグレーションを適用する。`packages/schema/migrations/` は同梱しないので、`pnpm db:generate` を先に実行する必要がある。
>
> カバレッジ計測ツールは未導入のため、数値目標は置かない。代わりに「何を必ず検証するか」を上表で定める。

### 3-2. AI 機能のテスト戦略（採用時）

AI は非決定的なため、以下で対応：

| レイヤー | テスト方法 |
| --- | --- |
| Service（AI 呼び出しの起点） | 同期（ストリーミング）呼び出しは fetch / AI SDK のモック。`ctx.waitUntil()` で非同期化する場合はその起動と `ai_jobs` ステータス更新のモックを検証（DEV-01 §4/§8） |
| LLM 呼び出し（Vercel AI SDK） | 固定レスポンスを返すモッククライアントでテスト |
| 状態遷移 | 状態遷移関数（DEV-01 §4「状態遷移の集約」）の Unit Test |
| 失敗ケース | LLM API エラー時のリトライ・状態遷移をテスト |
| Integration（実 LLM）（**任意**：プロジェクト成長後に導入） | 環境変数フラグ（例 `AI_LIVE_TEST=true`）時のみ実 LLM を呼ぶ smoke test。必須の DoD には含めない |

### 3-3. レイヤー境界の検証（eslint-plugin-boundaries）

DEV-01 §4/§5 が定めるレイヤー境界（Astro Page / API Route → Service → D1）は `eslint-plugin-boundaries` で機械検証する（`Confirmed`・導入済み — `eslint.config.js` の `boundaries/dependencies` ルール）。ページ / API Route は `@app/schema/client`（db ハンドル）を持ってよいが、テーブル定義（`@app/schema`）の import は `no-restricted-imports` で禁止する — クエリは Service 層に閉じる。あわせて PR レビュー（§4）で以下を人間が確認する（import 検査では捕捉できない観点）：

- `.astro` ページ内で直接 `env.DB.prepare()` を呼んでいないか（DEV-01 §8 アンチパターン）
- Svelte アイランドの `onMount` 内で状態遷移を実行していないか
- API Route が Service を経由せず D1 に直接アクセスしていないか
- 認可チェック（`admin` / `editor` のロール検証）が Service / D1 アクセスの境界で強制されているか（DEV-01 §4「認可チェックの徹底」）

設定の実体は `eslint.config.js`（`boundaries/elements` + `boundaries/files` + `boundaries/dependencies`）を参照。

### 3-4. テストデータ生成

- ORM は Drizzle（DEV-01 §1、決定済み）。テストデータ生成のヘルパー（Factory 相当）は Drizzle スキーマの型（`typeof table.$inferInsert`）を使った INSERT ヘルパー関数、またはテスト用シード SQL として用意する
- 本テンプレは単一運営が前提のためテナント境界のテストデータは不要（PRD-01 §6）。代わりに `admin` / `editor` のロール差分を表すヘルパーを用意する（例: `asRole("editor")`）
- ロール（admin/editor）× 操作のマトリクステスト（Vitest のパラメータ化テスト `test.each`）を用意する

---

## 4. コードレビュー基準

PR レビュー観点：

- 要件の意図に沿っているか（PRD-03 機能 ID 対応）
- レイヤー責務（DEV-01 §5-3）が守られているか
- 命名がユビキタス言語（PRD-01）と整合しているか
- セキュリティ観点（DEV-02 §11）が満たされているか
- N+1 クエリ相当の非効率な D1 アクセスが発生していないか
- 重い処理がレスポンスをブロックしていないか（ストリーミング応答 / `ctx.waitUntil()` / Cron バッチ — DEV-01 §4/§8）
- 状態遷移は単一の遷移関数経由か（DEV-01 §4「状態遷移の集約」）
- 認可チェック（`admin` / `editor` のロール検証）が強制されているか
- 状態を変更する Service メソッドが監査ログを記録しているか（監査ログは自前の D1 テーブル `activity_log` — DEV-01 §2。記録呼び出しの **欠落** は Arch テスト・静的解析で検出できないため、レビューが唯一の防御線）
- エンドユーザー向け通知（メール等）が共通の送信関数経由か、スタッフ向けアラートと実装を分けているか（DEV-05 参照）
- 業務閾値・外部サービス ID がハードコードされていないか（DEV-05 §10）
- テストが境界条件・例外系も含むか
- 過剰抽象化していないか

AI による自動レビュー（実装規約の正本: `CLAUDE.md`、DEV-01 §9 参照）の後、人間レビュー必須。

---

## 5. 技術的負債の管理

| 区分 | 方針 |
| --- | --- |
| 識別 | PR レビューで「TODO（負債）」コメント、GitHub Issues に転記 |
| 返済比率 | 開発工数の一定割合（目安 20%）を負債返済に割り当て |
| 可視化 | GitHub Project の `tech-debt` ラベル |
| 優先順位 | セキュリティ > 性能 > 保守性 > スタイル |

---

## 6. テスト実行コマンド

テストツールは Vitest（単体）+ Playwright（E2E）で導入済み（DEV-01 §1）。

```bash
# 単体テスト（全パッケージ）。migrations/ が未生成なら先に pnpm db:generate
pnpm test

# 特定パッケージのみ
pnpm --filter admin test

# 特定テストのみ
pnpm --filter admin exec vitest run inquiries

# E2E（両アプリ。--concurrency=1 で直列実行される）
pnpm test:e2e
```

> `@cloudflare/vitest-plugin` の peer は `vitest ^4.1.0`。vitest 5 を入れると miniflare が
> 素の `SyntaxError` で起動しなくなるため、バージョンを固定している（DEV-01 §1）。

---

## 7. KPI 接続

| KPI ID | 内容 | テストでの担保 |
| --- | --- | --- |
| KPI-10 | Core Web Vitals（LCP/CLS/INP。定義の正本は BIZ-02 §2-2） | Performance Test（Lighthouse 等）、リリース前にレポート確認 |
| KPI-11 | 主要ページ p95 表示時間（定義の正本は BIZ-02 §2-2） | Performance Test、リリース前にレポート確認 |
| KPI-12a / KPI-12b | 稼働率 | 数値の正本は PRD-02 §5-2。死活監視・デプロイゲートは OPS-02（運用ハンドブック）参照 |

> 主要 API p95（500ms 以内）・AI 応答時間 p95（DEV-01 §6）は KPI-ID を持たない内部の性能目標であり、BIZ-02 §2-2 の KPI マップには含めない。テストでの担保方法は上表と同じ（Performance / Integration Test）。

---

## 8. 記入時チェックポイント

- 品質方針が KPI（BIZ-02）と接続されているか
- DoD が実行可能か（理想論で終わっていないか）
- テスト戦略がプロジェクトのリソースに合うか
- AI 機能のテスト方針が含まれているか（採用時）
- レビュー基準が PR 時のチェック項目として運用可能か
