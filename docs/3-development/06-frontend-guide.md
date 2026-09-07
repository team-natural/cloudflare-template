---
doc-id: DEV-06
title: フロントエンド実装ガイド
phase: 3
status: draft-ai
owner: Tech Lead
last-updated: 2026-08-30
related-docs:
  - DEV-01: 技術スタック決定書・アーキテクチャ原則
  - DEV-04: API 仕様
  - PRD-04: UI/UX 設計（管理画面標準構成）
  - CLAUDE.md: コード例・実装パターンの正本
---

# 06-frontend-guide.md — フロントエンド実装ガイド（管理画面パターン含む）

## このセクションの目的

DEV-01 で確定したフロントエンドスタックによる実装の設計原則を定義する。画面パターン 5 種
（ダッシュボード / 一覧 / 詳細 / フォーム / 設定）の「構成の考え方」、UI/UX 原則、状態管理
方針、アクセシビリティ / レスポンシブ方針を扱う。

- 技術スタックの選定は本書には書かない（DEV-01 が唯一の正本）。
- **コード例・実装パターンの正本: `CLAUDE.md`**（DEV-01 §9 参照）。
  コンポーネントの書き方・CSS 記法は同ファイルと `.claude/skills/shadcn-svelte/rules/` に委ねる。
- 画面を実際に組み立てる際の作業チェーンは `.claude/skills/public-design`（公開画面）/
  `.claude/skills/admin-design`（管理画面）を使う。本書 §4 は `admin-design` の Step 1 が
  参照する「標準パターン」の正本にあたる。

## 0-H. ハイブリッド編集ガイド（要点）

- 推奨モード: Human-first または Hybrid
- 人間確認必須: 状態の置き場所、デザインシステム整合、a11y 基準
- 詳細は 00_README.md §6〜8

---

## 1. ディレクトリ構成

このモノレポでは公開画面と管理画面が別アプリ（DEV-01 §1「リポジトリ構成」参照）。

```text
apps/public/src/
├── pages/
│   ├── index.astro ...          # 公開画面（Layout.astro を使用）
│   ├── login.astro / mypage/    # Member 認証（DEV-02 §1-2）。`/` は公開トップのため
│   │                            # 管理画面と違いログインは `/login` に置く
│   └── articles/                # Content Collections の記事（後述）
├── lib/
│   ├── components/              # 公開画面の Svelte アイランド（client:* で .astro に埋め込む）
│   └── server/                  # Member 認証・お問い合わせ送信（DEV-05 §1）
├── content.config.ts            # Content Collections の定義
└── layouts/
    └── Layout.astro             # 公開画面の HTML 骨格・<head>・global.css

packages/content/                # 記事本文（Markdown）。開発者が git で更新する

apps/admin/src/
├── pages/                        # `/admin` 等の接頭辞は付けない。apps/admin はサブドメイン
│   │                             # （例: admin.example.com）で丸ごと管理画面としてデプロイする
│   │                             # ため、URL に admin を含める必要がない（DEV-01 §1）
│   ├── index.astro              # ログイン（ADM-00。Confirmed — `/` 自体をログイン画面とし、
│   │                             # `/login` への分離は行わない。§4-4 参照）
│   └── （dashboard/index.astro / inquiries/ 等 — ADM-01〜、PRD-04 §3-2、Assumed。admin / editor 用。
│         src/layouts/Layout.astro を使用）
├── lib/
│   ├── components/
│   │   ├── ui/                  # shadcn-svelte 生成コンポーネント（DEV-01 §1。編集してよい）
│   │   └── admin/                 # 管理画面専用の合成コンポーネント（stat-card 等 — Assumed）
│   ├── server/                  # Service 層（内部構成は DEV-05 §1 が正本。D1/R2 アクセスを集約）
│   └── utils.ts                  # `cn()` 等の共通ユーティリティ
└── layouts/
    └── Layout.astro             # 管理画面の HTML 骨格・<head>・admin.css
```

公開画面・管理画面をディレクトリで分離する（Platform 階層は存在しないため分離対象に含まない — PRD-01 §1-2）。`Assumed` と付記した部分は
このテンプレートにまだ実例がない規約案であり、最初の画面を作る際に確定させ本書を更新する。

---

### 1-1. コンテンツの置き場所（D1 か Content Collections か）

公開画面に出すコンテンツは、**誰が更新するか**で置き場所が決まる（DEV-01 §1）。

| 更新者 | 置き場所 | 画面 |
| --- | --- | --- |
| 納品先の顧客 | D1（`schema-build` → `scaffold`） | 管理画面が必要 |
| 開発者（自社） | `packages/content` の Markdown | 管理画面は不要 |

判断に迷う場合は Content Collections を優先する。ビルド時に解決されるため **D1 の読み取りが発生せず**、
管理画面も作らずに済む。Cloudflare の課金は D1 の行読み取りに乗るので、閲覧数の多い公開ページほど
差が出る。

実装は `apps/public/src/content.config.ts` が `packages/content/articles/` を `glob()` ローダーで読み、
スキーマは `@app/content` から import する（両アプリが同じ定義を見るため）。

```typescript
// apps/public/src/content.config.ts
const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "../../packages/content/articles" }),
  schema: articleSchema,
});
```

> `output: "server"` では `getStaticPaths()` が**黙って無視される**。記事ページには
> `export const prerender = true` を必ず書く — 書き忘れると一覧は出るのに個別ページだけ 500 になり、
> 原因が分かりにくい（`apps/public/tests/e2e/` で検証している）。

## 2. 状態管理方針

Astro は各リクエストごとに SSR するだけで、Livewire のようにサーバー側にコンポーネント状態を
保持し続ける仕組みは持たない。真実の源は常に D1（Service 経由）で、クライアント側の状態は
「表示・入力中の一時的な写し」に限定する。

| 状態の種類 | 配置 | 理由 |
| --- | --- | --- |
| ユーザー入力のフォーム | Svelte アイランドのローカル state（`$state`） | 送信時に API ルートへ渡し、サーバー側 D1 が正本 |
| ビジネスデータ（投稿・メンバー等）のステータス | API ルートから取得し Svelte state に反映 | サーバー側（D1）が正本。ミューテーション後は再取得または楽観的更新 |
| 非同期処理進行中の表示 | ポーリング（`ctx.waitUntil()` で走る AI ジョブ等の状態を `ai_jobs` から取得 — DEV-05 §4） | サーバー側の Job 状態に同期 |
| モーダル開閉・ドロップダウン | クライアント側（shadcn-svelte の `Dialog` / `DropdownMenu` が内部で管理） | クライアントローカルで完結。Alpine.js 相当の自前実装は不要 |
| アニメーション・トランジション | クライアント側（Svelte の `transition:` + CSS） | サーバー往復不要 |
| 一時的な UI フィードバック（トースト） | shadcn-svelte の Toast/Sonner 相当 + API レスポンス | サーバーから通知 |

**禁止**: クライアント側 JS に業務ロジックを書く、サーバー側とクライアント側で同じ状態を
二重管理する。

---

## 3. Astro / Svelte 実装の設計原則

構文レベルの必須規約（`client:*` ディレクティブの使い分け、Svelte 5 runes の書き方）は
`CLAUDE.md` を正本とする。設計上の原則：

- 認可は Astro ページのフロントマター（サーバー側で実行される先頭のスクリプト）の冒頭で必ず
  実行し、ロール（`admin` / `editor`）を取得して Service に渡す。API ルートもハンドラの先頭で
  同様に認可を行う（`Confirmed`。`apps/admin/src/middleware.ts` はセキュリティヘッダー専用で
  認証・認可は行わない — DEV-05 §1 が正本）。
- Svelte アイランドの `onMount()` はデータ読み込みと初期化のみ。状態遷移・外部 API・メール
  送信等の副作用はユーザー操作のイベントハンドラ内で行う（DEV-01 §8）。
- Astro/Svelte にはフレームワーク標準の DI コンテナはない。Service 関数は明示的に import して
  呼ぶ。
- 一覧の検索・フィルタ条件は URL クエリ（`Astro.url.searchParams` / クライアント側は
  `URLSearchParams`）に保持し、リロード・共有可能にする。
- ループ描画には必ず一意キーを付与する（`{#each items as item (item.id)}`）。
- Astro ページ / API ルートから D1 を直接叩かない。必ず Service 経由（DEV-01 §4・§5）。

---

## 4. 画面パターン 5 種の構成の考え方

PRD-04 §4 の標準構成に対応する。管理画面は shadcn-svelte のプリミティブ（DEV-01 §1）を
組み合わせて構成し、独自コンポーネントは不足分のみ追加する。

### 4-1. ダッシュボード

- 構成: KPI カード群（4 枚目安、shadcn `Card`）→ 推移グラフ → 直近イベント一覧、の縦積み。
- KPI カードは「値 + 前週比等のデルタ + アイコン（Lucide）」をセットで表示する。
- グラフ・イベント一覧は個別の Svelte アイランドに分割し、遅延読み込み可能にする。
- グラフ描画は DEV-01 §2 のグラフ描画ライブラリ（LayerChart）のみ使用する（別チャート
  ライブラリの導入禁止）。

### 4-2. 一覧画面

- 構成: ヘッダー（件数 + 主要アクション）→ フィルタバー → 一括操作バー → テーブル。
- 検索 + フィルタ + ソート + ページネーション + 一括操作を標準装備とする（テーブル自体は
  `npx shadcn-svelte add table` 等で必要になった時点で追加する）。
- 一括操作バーは選択がある時のみ表示し、破壊的操作には shadcn `AlertDialog` 等の確認ダイアログ
  を必須とする。
- フィルタ状態は URL クエリに反映する（§3）。

### 4-3. 詳細画面

- 構成: ヘッダー（対象名 + アクション）→ 情報表示（項目が多い場合は shadcn `Tabs` で分割）→
  関連情報。
- 監査履歴（変更履歴）を詳細画面から参照できるようにする。
- 一覧への戻り導線を必ず用意する。

### 4-4. フォーム画面

- 構成: ヘッダーに「保存 / キャンセル」を固定配置 → 入力セクション（shadcn `Field` /
  `FieldGroup` を使用、段階入力はタブ / ステップで分割）→ 危険操作は最下部に隔離。
- バリデーションエラーは項目ごとにインライン表示（`FieldError` 相当）。保存中はスピナー等で
  多重送信を防止。
- 削除等の危険操作は視覚的に区別し（警告色 + 枠）、確認ダイアログを必須とする。
- 参考実装: `apps/admin/src/pages/index.astro` + `apps/admin/src/lib/components/login-form.svelte`（Card +
  Input + Label + Button の組み合わせ）。**`POST /api/v1/auth/login` に結線済み**で、成功時は
  `/dashboard`（ADM-01）へ遷移する。バックエンド（セッション発行、KV ロックアウト）は
  `apps/admin/src/pages/api/v1/auth/`・`src/lib/server/auth/`。`/` 自体がログイン画面であり
  `/login` への分離は行わないため、遷移先は必ず別ルートにする（`/` へ戻すとログイン画面に
  戻ってループする）。案件側の残作業は**見た目**のみで、00_DEV_GUIDE §3-3 のステップ 3
  （管理画面 UI の 1 枚目）で扱う。
- 上記が確立したフォーム規約は次の 3 点。新規フォームはこれに倣う:
  1. フォームは `Field.FieldGroup` > `Field.Field` > `Field.FieldLabel` + コントロール
     で組む（`grid gap-*` の生 `div` は使わない — `.claude/skills/shadcn-svelte/rules/forms.md`）。
     項目ごとのエラーは API の 422 エンベロープ（`errors`）をそのまま `Field.FieldError` に出し、
     `Field.Field` に `data-invalid`、コントロールに `aria-invalid` を付ける（両方必要。前者が
     ラベル・説明文、後者がコントロール自体のスタイルを切り替える）。
  2. それ以外（401 / 429 / 5xx）はフォーム全体のメッセージを `role="alert"` で出す。サーバーが
     意図的に伏せている情報（アドレスの存在有無 — DEV-02 §7）をクライアント側で補わない。
  3. 送信ボタンは `onMount` まで `disabled` にする。アイランドは JS 実行前から DOM に存在するため、
     その間の送信はネイティブ POST になり入力が失われる。多重送信防止（送信中の `disabled`）も兼ねる。
- ページ側のセッション検証は `apps/admin/src/pages/dashboard/index.astro` が参照実装。API ルートは
  例外を投げて 401 を返すが、ページは**ログイン画面へリダイレクト**する（401 の本文は
  ブラウザ利用者が対処できない）。認証ミドルウェアは意図的に置かず、各ページ / ルートの先頭で
  検証する（DEV-04 §2）。
  `apps/admin` はサブドメイン（例: admin.example.com）で丸ごと管理画面としてデプロイするため、
  遷移先の URL に `/admin` のような接頭辞は付けない（§1 参照）。

### 4-5. 設定画面

- 構成: セクションタブ（shadcn `Tabs`。基本 / ドメイン / 連携 / 危険操作）で分割。
- 「危険操作」（サイトデータの全削除等）は独立タブに隔離する。

---

## 5. UI コンポーネント方針

- 管理画面は shadcn-svelte の標準コンポーネント（DEV-01 §1、`apps/admin/src/lib/components/ui`）を
  最優先で使う。独自スタイルの乱立を防ぎ、`admin.css` のテーマ変数の一括変更を効かせる。
- 新規コンポーネントを書く前に、`apps/admin/src/lib/components/ui/` に同等品がないか、無ければ
  `npx shadcn-svelte add <component>` で追加できないかを必ず確認する（`shadcn-svelte` スキル
  参照）。
- **ブラウザ標準の UI を管理画面に持ち込まない。** 確認ダイアログ・アラート・日付選択の
  ようにブラウザが独自の見た目で描画するものは、shadcn-svelte の同等品に置き換える。見た目が
  OS ごとに変わり、テーマ変数も i18n も効かないため。確認ダイアログは画面ごとに自作せず、
  共通コンポーネントの 1 実装に集約する。

適用範囲：

| 画面種別 | UI ライブラリ | 理由 |
| --- | :---: | --- |
| ダッシュボード・管理画面 | ✅ shadcn-svelte | 想定ユースケース（DEV-01 §1） |
| ユーザー操作画面（フォーム・一覧） | ✅ shadcn-svelte | 想定ユースケース |
| LP・マーケティングページ | ❌ | プレーン Tailwind + Astro/Svelte で個別実装（`public-design` スキル） |

---

## 6. CSS 方針

- 色・余白等はデザイントークンとして定義し、任意値の直書きは最後の手段とする。管理画面は
  `apps/admin/src/styles/admin.css` の CSS 変数（`@theme inline`）、公開画面は `apps/public/src/styles/global.css`
  のプレーン Tailwind を使う（DEV-01 §1）。
- テーマ（色・角丸）はテーマ変数の一元管理で行い、コンポーネント個別の上書きをしない。
- ダークモード対応は `admin.css` の標準テーマ機構に乗る。
- 記法ルール（`@theme` 等の CSS-first 設定）は `CLAUDE.md` の Architecture 節を正本とする。

---

## 7. クライアントサイド JS の利用範囲

- 許可: モーダル開閉・ドロップダウン・トランジション等、クライアントで完結する UI 状態のみ。
- 禁止: 業務ロジック・API 呼び出し結果の判定・バリデーション確定。これらは必ずサーバー側
  （API ルート / Service）に置く。クライアント側の即時フィードバック用バリデーションは
  UX 目的でのみ許可し、確定判定はサーバー側で再度行う。

---

## 8. ファイルアップロード

- MIME / 拡張子 / サイズ / 実バイトの 4 重検証（DEV-02 §4 の基準に準拠）
- ファイル名は ULID で renaming
- ストレージは Cloudflare R2（`env.BUCKET`）。操作は Service 層に置く（コンポーネントから
  直接触らない）

---

## 9. アクセシビリティ（a11y）

| 観点 | 方針 |
| --- | --- |
| キーボード操作 | 全インタラクション対応 |
| フォーカスリング | `:focus-visible` で必ず可視化 |
| 色のみで状態表現しない | アイコン + 色 + テキストの 3 要素 |
| 画像 alt | 必ず設定 |
| フォーム | `<label>` 紐付け、エラー説明 |
| カラーコントラスト | WCAG AA 以上 |

実装時の詳細な監査・修正フローは `.claude/skills/fixing-accessibility` スキルに委ねる
（`public-design` / `admin-design` チェーンの中で必ず通過する）。

---

## 10. レスポンシブ方針

- モバイルファーストで実装し、ブレークポイントは Tailwind 標準のみを使う。
- 管理画面はサイドバーをドロワー化してモバイル対応。テーブルは横スクロールを許容する。
- カード群・フォームのグリッドは 1 列（モバイル）→ 2〜4 列（デスクトップ）を基本とする。

---

## 11. パフォーマンス

| 項目 | 方針 |
| --- | --- |
| 初期描画 | 非表示部品は遅延読み込み（Svelte アイランドの `client:visible` 等） |
| 大きなリスト | 一意キー徹底 + ページネーション |
| 画像 | `loading="lazy"` を明示 |
| フォーム入力の同期 | フォーカス喪失時基本、リアルタイム検索は debounce 300ms 以上 |
| アニメーション | compositor 対象プロパティ（`transform` / `opacity`）中心の CSS/Svelte トランジションのみ |

アニメーション・パフォーマンスの詳細な監査は `.claude/skills/fixing-motion-performance`
スキルに委ねる（`public-design` チェーンの Step 4）。管理画面は最小限の enter/exit
トランジションに留め、演出目的のモーションは追加しない。

---

## 12. テスト方針

テストフレームワークは Vitest + Playwright（DEV-01 §1、導入済み。配置は `apps/admin/tests/unit/`、
実行は `pnpm test` — DEV-03 §6）。以下は最低限のテスト観点として維持する：

- **認可**：`editor` ロールで `admin` 専用操作（管理者管理・サイト設定等）にアクセスできないこと

---

## 13. 記入時チェックポイント

- 公開画面と管理画面が分かれて整理されているか
- 管理画面の標準パターン 5 種（ダッシュボード / 一覧 / 詳細 / フォーム / 設定）が網羅されているか
- shadcn-svelte の標準コンポーネントを使い倒しているか（独自スタイル乱立していないか）
- **UI 文字列がハードコードされていないか — 言語方針（DEV-01 §1、決定後）に従っているか**
- ロール（`admin` / `editor`）による認可が Service 層で強制されているか
- PRD-04 の画面 ID と Astro ページ/Svelte アイランドが対応しているか
- a11y チェックリスト（§9）とレスポンシブ方針（§10）が満たされているか
- 技術名の選定を本書に書いていないか（DEV-01 参照になっているか）
