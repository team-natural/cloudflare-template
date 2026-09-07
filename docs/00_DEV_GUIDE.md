---
doc-id: DEV_GUIDE
title: AI との作業マニュアル
phase: cross
status: draft-ai
owner: Tech Lead
last-updated: 2026-08-18
related-docs:
  - README: docs/ 全体の構造ガイド
  - INTAKE: 全文書の入力源
  - DEV-01: 技術スタック決定書
---

# AI との作業マニュアル

このプロジェクトでは Claude Code（AI）を開発パートナーとして使います。
このファイルは **ユーザー向け** の操作ガイドです。AI への指示の出し方と、よくある作業パターンをまとめています。

> 本書は実際にリポジトリに存在する仕組みだけを説明します。ツールを追加・整備したら本書も更新してください。

---

## ⚡ Quick Reference（まずここだけ覚える）

**人間が明示的に打つコマンドは 4 つだけ。それ以外はすべて日本語で依頼する。**

| 操作 | タイミング |
| --- | --- |
| `pnpm db:generate` → `pnpm db:migrate` | スキーマを変えたとき（§3-2） |
| `pnpm check` | コミット前・PR 作成前（`format:check` + `lint` + 型チェック + 単体テスト。Turborepo が両アプリ + `packages/*` に fan out） |
| `pnpm test:e2e` | 画面やルートを変えたとき（Playwright。`pnpm db:generate` が先に必要） |
| `pnpm dev` | 開発中（両アプリ。public 5173 / admin 5174） |

`security-review` スキルはリリース前・重要な機能変更後に日本語で依頼する。

```
docs を書く／更新する                     → 日本語で依頼するだけ（コマンド不要）
ページ実装                                → 「admin-design で〜」「public-design で〜」と画面種別を指定
                                            （雛形は既にあるので、実際は「更新」になる — §3-3）
MCP（ライブラリドキュメント検索・コード検索など）→ AI が自動で使う（意識不要）
Skills（public-design / admin-design / shadcn-svelte 等）→ AI が自動でロード（意識不要）
実装規約（CLAUDE.md）                     → AI が常時参照（意識不要）
hooks（整形・Lint・型チェック）            → 編集ごとに自動実行（意識不要）
git commit / git push                     → 人間がやる（AI は実行しない）
```

> hooks が拾えない例外: shadcn-svelte の CLI は Claude の Edit/Write を経由せずファイルを書くため、
> `PostToolUse` フックが走らない。`add` / `update` の直後は `pnpm format` を手で実行する。

> 専用の「コードレビュー用サブエージェント」はこのリポジトリには無い（§4 参照）。PR 前の品質確認は
> `pnpm check` + `pnpm test` + 人間による確認で行う（Claude Code 本体の `code-review` は利用できる）。

---

## 1. 全体像：何がどこにあるか

```
（リポジトリルート）― pnpm workspaces + Turborepo のモノレポ（DEV-01 §1・§2）
├── apps/
│   ├── public/             ← 公開サイト（独立した Cloudflare Worker。src/pages, src/components,
│   │                          src/lib/server（お問い合わせ送信のみ）, tests/, playwright.config.ts）
│   └── admin/              ← 管理 CMS（独立した Cloudflare Worker。src/pages, src/lib/server,
│                              scripts/seed-user.mjs, tests/, vitest.config.ts, playwright.config.ts）
├── packages/
│   ├── schema/             ← Drizzle スキーマ正本（src/schema.ts, src/ulid.ts, src/client.ts）。
│   │                          migrations/ はテンプレートに同梱しない生成物 — 初回 pnpm db:generate で作られる
│   ├── server-kit/         ← 両アプリ共通のサーバー基盤（パスワードハッシュ、ロックアウト、
│   │                          セッション規則、HTTP エンベロープ）
│   └── content/            ← 開発者が更新する Markdown（Content Collections の実体）
│
├── eslint.config.js          ← レイヤー境界の機械検証（eslint-plugin-boundaries）
├── .github/workflows/ci.yml  ← dev / main 宛の PR・push で check → test → build（DEV-08 §3）
│
├── docs/                   ← プロジェクト仕様書（何を作るか。人間が読む）
│   ├── 00_INTAKE.md        ← ヒアリング情報の起点（全文書の入力源）
│   ├── 00_README.md        ← docs/ の使い方ガイド
│   ├── 00_DEV_GUIDE.md     ← 本書
│   └── 1-business/ 〜 5-governance/
│
├── CLAUDE.md                ← AI 向けの実装規約の正本
│                                （アーキテクチャ、コマンド、D1/R2 バインディングルール、ハード制約）
├── .mcp.json                 ← MCP サーバー定義（astro-docs / svelte / cloudflare-docs / context7 / context-mode / semble / playwright）
├── .claude/
│   ├── settings.json         ← hooks・MCP 有効化・permissions の定義
│   ├── skills/                ← AI に読み込ませる専門知識（§4 の一覧参照）
│   │   ├── admin-design/ public-design/     ← 画面種別ごとの実装チェーンの起点
│   │   ├── shadcn-svelte/                   ← 管理画面 UI コンポーネントの追加・調整
│   │   ├── schema-build/                    ← DEV-07 → Drizzle スキーマ → migration 生成
│   │   ├── scaffold/                        ← 参照実装に倣って Service / API を書く手順
│   │   └── （デザインチェーン内部スキル: frontend-design / baseline-ui /
│   │         fixing-accessibility / fixing-motion-performance /
│   │         web-design-guidelines / design-review）
│   └── hooks/
│       └── format-and-check.sh  ← 編集ごとに Prettier → ESLint --fix → pnpm typecheck を自動実行
│
└── .claude/skills/shadcn-svelte/rules/   ← ベンダー管理・読み取り専用
    ├── composition.md / forms.md / icons.md / styling.md
```

- **`apps/public`（公開サイト）と `apps/admin`（管理 CMS）は独立した Cloudflare Worker として別々にデプロイする**（`/admin` パスへの統合ではない）。ESLint（`eslint-plugin-boundaries`、ルートの `eslint.config.js`）が両者の相互 import と `packages/*` から `apps/*` への import を禁止する（DEV-01 §1・§5）。共有コードは `packages/schema`（スキーマ）、`packages/server-kit`（サーバー基盤）、`packages/content`（Markdown）の 3 つに置く（DEV-01 §1 参照）
- **技術スタックの正本は `docs/3-development/01-architecture-rules.md`（DEV-01）**。AI が技術判断に迷ったら必ずここに従う。
- **実装規約の正本は `CLAUDE.md`**。複数ファイルに分割せず 1 ファイルに集約している（§5 参照）。
- 実装系スキルは `schema-build`（DEV-07 → Drizzle スキーマ → migration）と `scaffold`（参照実装に倣って Service / Zod / API ルートを書く）の 2 つ。コードジェネレータは持たない — 正解は動く参照実装であって雛形ではない（§4 参照）。専用サブエージェントは無い。
- **Memory（長期記憶）**: AI の会話をまたいだ記憶はユーザー領域に自動保存される。「〇〇を覚えておいて」と指示すると次回以降も参照される。

---

## 2. `docs/` の起点 3 ファイルの役割

| ファイル | 役割 | 主な読者 | AI の編集権限 |
| --- | --- | --- | --- |
| `00_README.md` | docs/ 全体の構造ガイド。文書一覧・生成順序・ステータスラベル定義 | 新規参加者・コンサル | 読み取り専用（構造は変えない） |
| `00_INTAKE.md` | ヒアリング生記録の正本。全仕様書の唯一の入力源 | コンサル・PdM | 読み取り専用（AI は追記提案のみ） |
| `00_DEV_GUIDE.md` | AI との作業マニュアル（本書） | 開発者 | 自由に更新可 |

> **迷ったら**: 仕様を探すなら `00_README.md` → 該当ドキュメントへ。作業手順を探すなら本書。

---

## 3. 開発フロー（INTAKE → リリースまで）

### 3-0. ステップ×使用アセット一覧（この表が全体の前提）

開発は 6 ステップで進む。**UI を先に全画面ぶん作り、機能は後からまとめて入れる**（縦に 1 ページずつ
完成させるのではなく、横に揃えてから深くする）。理由は §3-3 冒頭を参照。

| ステップ | 工程 | 使うもの | 種別 |
| --- | --- | --- | --- |
| **1. docs 更新** | 00_INTAKE.md 記入 | 人間（AI は追記提案のみ — §2） | — |
|  | docs 一式生成（BIZ → PRD → DEV → OPS → GOV-01 承認） | 会話で依頼（順序は 00_README §9 が正本、対応表は §3-1） | — |
|  | レビュー・確定 | 人間（ステータスラベル運用） | — |
| **2. 基盤を揃える** | 全体構造の設計（どのテーブル・どの画面・どのルートにするか docs から確定させる） | 会話で依頼 | — |
|  | DEV-07 の物理テーブル設計 → Drizzle スキーマ → migration 生成 → 適用 | `schema-build` スキル + `pnpm db:generate` + `pnpm db:migrate` | スキル |
|  | Service / Zod バリデーション / API ルートの実装（必要なリソースをまとめて 1 回） | `scaffold` スキル | スキル |
| **3. 管理画面 UI** | 1 枚目（`/` とレイアウト）を作り、以降はそれに倣う | `admin-design`（雛形を**更新**する — §3-3） | スキル |
| **4. 公開画面 UI** | 1 枚目（`/` とレイアウト）を作り、以降はそれに倣う | `public-design`（雛形を**更新**する — §3-3） | スキル |
| **5. 機能実装** | 優先順位を付けて各ページの機能を入れる | 会話で依頼（優先度の出典は PRD-03 の MVP / 優先度列） | — |
|  | 整形・Lint・型チェック（編集ごと自動） | hooks（`format-and-check.sh`） | 自動 |
| **6. テスト・検証** | ユニット / E2E | `pnpm test` / `pnpm test:e2e`（Vitest + Playwright、導入済み） | — |
|  | コードレビュー | `pnpm check` + 人間レビュー（Claude Code 本体の `code-review` も利用可） | — |
|  | セキュリティレビュー（リリース前必須） | `security-review` スキル | スキル |
|  | 全画面の最終ビジュアルスイープ | `design-review` | スキル |
|  | 完了ゲート・デプロイ | DEV-08 §7 の検証完了ゲート → `dev` / `main` へのマージで Cloudflare Workers Builds が自動実行（DEV-08 §3） | — |

> テストを書くタイミングは**ステップ 5 と 6 のどちらでもよい**。機能ごとに書けば手戻りが小さく、
> ステップ 6 でまとめて書けば仕様が固まってから書ける。どちらにせよ DEV-03 §2 の DoD と
> DEV-08 §7 の完了ゲートは通す。

- 公開側 6 段チェーンの内訳: `frontend-design` → `baseline-ui` → `fixing-accessibility` →
  `fixing-motion-performance` → `web-design-guidelines` → `design-review`（`public-design` が起点。
  内部スキルは軽微な修正時に単独起動も可）。2 枚目以降は Step 1 の `frontend-design` だけが
  「1 枚目に倣う」に差し替わり、残りの 5 段はそのまま回る（§3-3 ステップ 4）
- `design-review` は実装フェーズのページ完成ごと + 検証フェーズの最終スイープの両方で使う
- テストは Vitest + Playwright（DEV-01 §1、導入済み）。検証フェーズまで溜めずに実装フェーズ内で機能ごとに書く

### 3-1. 文書生成の流れと各ステップ

**文書の依存関係図は `00_README.md` §9 が唯一の正本**（同 §9 が「複数の図で二重管理しない」と定めて
いる）。本書は下表で「何を読んで何を書くか」だけを扱う。

各文書の生成は「〇〇（入力文書）を参照して △△（対象文書）を書いて」と依頼するだけ。入力文書と確認ポイント:

| Step | 書く文書 | 読む文書 | 人間の確認ポイント |
| --- | --- | --- | --- |
| 1 | INTAKE | ヒアリング情報（人間が記入） | サービス概要・ターゲット・マネタイズ。不明点は `[Open]` |
| 2 | BIZ-01 | INTAKE | ビジネスモデル・提供価値が具体的か |
| 3 | BIZ-02 | INTAKE + BIZ-01 | KPI 目標が具体的か（未確定は `[Assumed: TBD]`） |
| 4 | BIZ-03 | INTAKE + BIZ-01/02 | プラン・料金・機能制限が数値か。DB に影響する `[Open]` の把握 |
| 5 | PRD-01 | INTAKE + BIZ-01〜03 | エンティティ一覧（→ DEV-07 のテーブルになる）・ユビキタス言語 |
| 6 | PRD-02（§6 → §1〜5 の順） | PRD-01 + BIZ-01 | §6 論理データモデルが DEV-07 の元ネタ。テナント境界方針 |
| 7 | PRD-03 | PRD-01/02 + BIZ-01〜03 | 状態遷移・ビジネスルール。状態の列挙値を確定 |
| 8 | PRD-04 / PRD-05（採用時） | PRD-03 | 画面構成 / AI 機能の採否判定ゲート |
| 9 | DEV 文書群 | PRD 群 + DEV-01 | 技術判断はすべて DEV-01 に従っているか |
| 10 | OPS-01 / OPS-02 | BIZ-03 + PRD 群 + DEV-08 | 契約・SLA と運用手順が、実際のデプロイ構成（DEV-08）と矛盾しないか |
| 11 | GOV-01 で正仕様を承認 | 全文書 | `Open` / `Assumed` が残っていないか。残す場合は GOV-02 に論点として立てる |

> ステップ 10-11 まで通してから実装（ステップ 2）に入る。GOV-01 の承認が「docs 確定」の区切りで、
> 00_README §9 の図でも `OPS → GOV-01 正仕様承認 → 実装着手` がその順に描かれている。

**ドキュメントステータスの扱い**

| ステータス | 扱い |
| --- | --- |
| `approved` / `[Confirmed]` | 実装してよい |
| `draft-ai` / `[Assumed]` | 実装前に人間が確認・承認する |
| `[Open]` | 未決定。実装しない |

### 3-2. 基盤を揃える（ステップ 2: DB → 全画面の雛形 → Service/API の雛形）

```
1. DB 設計前に [Assumed] / [Open] をゼロにする
   「PRD-01〜03 の [Assumed] と [Open] を一覧にして、DB 設計に影響するものを教えて」
   → 1 つずつ確定し「[Confirmed] に更新して」

2. DEV-07 を書く
   「PRD-01・PRD-02（特に §6）・PRD-03 を参照して DEV-07 の物理テーブル定義を書いて」
   → 全テーブルに PK / created_at / updated_at、URL 露出テーブルに public_id（ULID/UUID）があるか確認

3. マイグレーションファイルを作成（`schema-build` スキル。Drizzle スキーマ生成 → `pnpm db:generate` — DEV-01 §1）
   「DEV-07 を参照して Drizzle スキーマ（`packages/schema/src/schema.ts`）を更新し、`pnpm db:generate` で migration SQL を生成して」
   → migration は `apps/admin` からのみ実行する（同一リポジトリ内の app 単位の所有権。DEV-01 / CLAUDE.md の D1/R2 バインディングルール参照）

4. 適用
   ! pnpm db:migrate                         # = wrangler d1 migrations apply DB --local --persist-to ../../.wrangler-state
   → 本番反映は OPS 側の手順に従う（`db:migrate:remote`）。down() の自動生成は無いため、
     ロールバックが必要な変更は新しい migration で対応する（forward-only）

5. Service / Zod バリデーション / API Route を実装（必要なリソースをまとめて 1 回）
   → 「DEV-07 の標準テーブルのうち、API が必要で Service が未実装のものを列挙して」と依頼し、
     `scaffold` スキルに渡す。セッション・中間テーブル等は対象外
   → スキルが参照実装（inquiry）に倣って書く。ジェネレータは無いので Claude の Edit/Write を
     経由し、hooks（format / lint / typecheck）がそのまま走る
   → read と write でロールが違うリソースがある（Inquiry 一覧は `editor: ✕`）ので `readRole` を必ず判断する

6. 画面の雛形は作らない
   → ルートと Layout だけの雛形を機械生成しても、`admin-design` / `public-design` が
     どうせ作り直す。ステップ 3-4 で直接作る
```

> ステップ 5-7 を終えた時点で「全ページの雛形 + DB + Service/API の雛形」が揃う。ここから先の
> ステップ 3-4（UI）は**新規作成ではなく雛形の更新**になる。

### 3-3. 実装（ステップ 3-5: 管理画面 UI → 公開画面 UI → 機能）

§3-2 で全画面の雛形が生成済みなので、ここは**新規作成ではなく雛形の更新**になる。そして
**UI（ステップ 3-4）を全画面ぶん先に揃えてから、機能（ステップ 5）を入れる**。

先に UI を揃える理由は 2 つある。1 つは相互リンク — 一覧 → 詳細、パンくず、管理画面のサイドナビ
（PRD-04 §4-1）は全ルートが存在していないと一度で正しく書けず、後から直す手戻りが出る。もう 1 つは
一貫性 — `admin-design` も `public-design` の following run も「既存画面に倣う」方式なので、
1 枚目の出来が以降すべてに伝播する。

**ステップ 3: 管理画面 UI**

```
1 枚目（レイアウトを含む）:
  「admin-design スキルで apps/admin/src/pages/index.astro（ADM-00 ログイン）と
    dashboard/index.astro（ADM-01）、Layout.astro を更新して。
    PRD-04 §4-1 のサイドナビ + ヘッダー + コンテンツの 3 ペイン構成にして」
  → ここで作るレイアウトとサイドナビが以降の全画面の土台になる。ナビの行き先は
    §3-2 で生成済みなのでリンク切れにならない
  → ログインは API に結線済み（成功で /dashboard へ遷移）。作り込むのは見た目だけで、
    dashboard/index.astro 冒頭のセッション検証と login-form.svelte のフォーム規約
    （DEV-06 §4-4）は消さずに残す — 以降の全画面がこれに倣う

2 枚目以降:
  「admin-design スキルで /inquiries の一覧画面を作って。1 枚目の構成に倣って」
  → shadcn-svelte の既存パターン（CLAUDE.md）に準拠 → fixing-accessibility
    → design-review（実ブラウザ検証）まで自動でチェーン
```

**ステップ 4: 公開画面 UI**

```
1 枚目（レイアウトを含む）— public-design の「establishing run」:
  「public-design スキルで apps/public/src/pages/index.astro と Layout.astro を更新して。
    ブリーフ: ...」
  → frontend-design（デザイン方向の決定）→ baseline-ui → fixing-accessibility
    → fixing-motion-performance → web-design-guidelines → design-review の 6 段チェーン
  → この回で決めた値は global.css の @theme・Layout.astro・components/ に残す。
    2 枚目以降はそれを読んで倣うので、ここに残さないと引き継げない

2 枚目以降 — 同じ public-design の「following run」:
  「public-design スキルで /blog の一覧画面を、トップページに倣って更新して」
  → **establishing run を 2 回やらない。** Step 1 の frontend-design は毎回デザイン方向を
    再決定するため、2 度目を回すとそのページだけ見た目がずれる。following run は Step 1 を
    frontend-design ではなく「1 枚目 + トークン + 既存コンポーネントを読んで倣う」に
    差し替えたもので、Step 2〜6（polish / a11y / motion / ガイドライン / 実ブラウザ検証）は
    1 枚目と同じように全部回る
```

**ステップ 5: 機能実装**

```
優先順位: PRD-03 の MVP 列と優先度列（High / Medium）が着手順の出典。
  「PRD-03 の MVP かつ優先度 High の機能を、着手順に並べて」と依頼して確定させる

「PRD-03 §2 の記事（Post）公開機能を実装して」
  → CLAUDE.md のレイヤー原則（Astro Page/API Route → Service → D1、DEV-01 §5 参照）に従い実装
    認可チェック（admin / editor のロール検証）は Service 層で必ず強制（DEV-01 §4）
  → §3-2 で生成した雛形の穴埋めが中心。生成物が埋めていない箇所は
    `.claude/skills/scaffold/SKILL.md` の Step 4 に一覧がある
  → 管理画面のログインは 1 枚目の作業に含める（バックエンドは実装済み、UI からの結線が残っている）

テスト: 機能ごとに書いてもステップ 6 でまとめて書いてもよい（§3-0 の注記）
  ! pnpm test        # migrations/ が未生成なら先に pnpm db:generate
```

> コード変更のたびに hooks（`format-and-check.sh`）が Prettier → `eslint --fix` → `pnpm typecheck`
> を自動実行し、エラーは AI に自動フィードバックされる。**例外は shadcn-svelte CLI の出力**
> （Claude の Edit/Write を経由しないため hooks が走らない）— その直後だけ `pnpm format` を
> 手で実行する。コミット前・PR 前の最終確認には `pnpm check` を使う。

### 3-3b. 検証（ステップ 6: リリース前）

```
1. 型チェック・Lint・整形の最終確認: ! pnpm check
2. テスト: ! pnpm test        # migrations/ が未生成なら先に pnpm db:generate
             ! pnpm test:e2e    # Playwright。spec が 0 件なら何も検証されない点に注意
3. 「変更内容をレビューして」と人間目線のセルフレビューを依頼
   （このリポジトリ専用の reviewer スキルは無い。Claude Code 本体の code-review が使える）
4. security-review スキルで「変更内容のセキュリティレビューをして」と依頼   ← リリース前・重要な変更後
5. 画面が絡む変更は design-review スキルで最終ビジュアルスイープ
6. 完了ゲート: DEV-08 §7 の検証完了ゲートと DEV-03 §2 の DoD を通す
```

> CI（`.github/workflows/ci.yml`）が `dev` / `main` 宛の PR と push で
> `pnpm check` → `pnpm db:generate` → `pnpm test` → `pnpm build` を回す（DEV-08 §3）。
> `db:generate` を挟むのは、テンプレートが `migrations/` を同梱しないため（案件では差分なしで
> 終わり、スキーマのドリフト検出も兼ねる）。E2E は CI では実行していない。

### 3-4. コミット・プッシュ手順

> **ルール: コミット・プッシュは人間が行う。AI は `git commit` / `git push` を実行しない。**

```
1. 「今の変更内容からコミットメッセージの案を出して」と依頼
2. ! git add <変更ファイル> → ! git status で確認
3. ! git commit -m "メッセージ"
4. ! git push
```

リリース前・重要な機能変更後は 1 の前に `security-review` スキルでレビューを依頼する。

---

## 4. スキル一覧と用途

### プロジェクト管理スキル（フェーズの道具。手で育てる）

| スキル | フェーズ | 使う場面 |
| --- | --- | --- |
| `schema-build` | 基盤 | DEV-07 のテーブル定義を Drizzle スキーマに反映し、migration SQL を生成（DEV-07 → `packages/schema/src/schema.ts` → `pnpm db:generate`） |
| `scaffold` | 基盤 | 既存テーブル（schema-build 済み）に対して Service / Zod バリデーション / API ルートを実装する。参照実装（inquiry）に倣うので、ジェネレータは無い。複数リソースを 1 回で処理する（§3-2 ステップ 5） |
| `admin-design` | 実装 | 管理画面の実装（shadcn-svelte 標準パターン → a11y → 実ブラウザ検証） |
| `public-design` | 実装 | 公開側ページの実装。1 枚目は establishing run（frontend-design でデザイン方向を決定）、2 枚目以降は following run（1 枚目に倣う）— どちらも同じスキルで起動する |
| `shadcn-svelte` | 実装 | 管理画面 UI コンポーネントの追加・調整（`npx shadcn-svelte add <component>` を含む） |
| `design-review` | 実装・検証 | 実ブラウザでのビジュアル検証（両画面共通・単独でも使える） |
| `frontend-design` / `baseline-ui` / `fixing-accessibility` / `fixing-motion-performance` / `web-design-guidelines` | 実装 | デザインチェーンの内部スキル。軽微な修正時は単独起動も可（余白 → baseline-ui、a11y → fixing-accessibility 等） |

### このテンプレートに無いもの

- **専用サブエージェント**（backend / frontend / reviewer / security-audit / test-writer 相当）。バックエンド実装もコードレビューも日本語で直接依頼する
- **コードジェネレータ**（Plop 等）。テンプレート言語で書いた雛形は型チェックも lint も効かず、規約を変えた時に黙って腐る。`scaffold` は代わりに参照実装を指す

追加する場合は GOV-01 で決定した上で本書と DEV-01 を更新すること。架空のツール名を書かない。

### 標準スキル（Claude Code 標準機能。プロジェクト専用ではない）

| スキル | タイミング |
| --- | --- |
| `security-review` | リリース前・重要な機能変更後 |

新しいスキルを追加したらこの表と §1 の構成図を更新すること。

---

## 5. 自動で動いている機能（意識不要）

### MCP（必要なときに AI が自動で呼び出す）

`.mcp.json` に定義されたサーバーのみが使われる。用途別の使い分けは `CLAUDE.md`「MCP servers」節が正本。

### 実装規約（AI が常時参照。繰り返しミスがあったら育てる）

実装規約は **`CLAUDE.md` 1 ファイル**に集約されている（アーキテクチャ、コマンド、D1/R2 バインディングルール、
ハード制約、フォーマット/Lint 方針）。`.claude/skills/shadcn-svelte/rules/` はベンダー管理のため直接編集しない。

```
「Service を通さず .astro ページから env.DB.prepare() を直接呼んでくる」
→「その禁止事項を CLAUDE.md に追記して」
```

設計原則（なぜそうするか）は docs/3-development/ 側、コードの書き方（どう書くか）は `CLAUDE.md` 側、という分担です。

---

## 6. 困ったときの対処

| 状況 | 対処 |
| --- | --- |
| AI が的外れな方向に進んでいる | 「一度止めて。〇〇の目的は△△です」と文脈を与える |
| AI が想定外のライブラリを提案してくる | 「DEV-01 の §2 / §3 を確認して」と指示する |
| 前の会話の内容を覚えていない | 「memory を確認して」と言う |
| ブラウザで変更が反映されない | `! npx astro dev status` で daemon の状態を確認、または `! npx astro dev logs` |
| migration でエラーが出た | エラーログをそのまま貼る |
| Lint / 型チェックエラーが直らない | 「pnpm typecheck のエラーを修正して」と依頼 |
