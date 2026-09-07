---
doc-id: GOV-01
title: 意思決定ログ
phase: 5
status: draft-ai
owner: PdM（兼務前提）
last-updated: 2026-08-18
related-docs:
  - BIZ-01〜03: 事業判断
  - PRD-01〜05: 要件判断
  - DEV-01〜10: 設計判断
  - OPS-01〜02: 運用判断
  - GOV-02: 未決事項からの転記元
---

# 01-decision-log.md — 意思決定ログテンプレート

## このセクションの目的

重要な意思決定を時系列で記録し、背景と影響範囲を追跡できるようにする。**全フェーズ横断・プロジェクト開始初日から運用する**。

## 0-H. ハイブリッド編集ガイド（要点）

- 推奨モード: Human-first または Hybrid
- 人間確認必須: 本当に決定済みか、決定者の明確性、影響範囲の漏れ

---

## 1. 凡例

| 区分 | 内容 |
| --- | --- |
| D-ID | 決定 ID（D-NNN 連番） |
| 日付 | 決定確定日（YYYY-MM-DD） |
| カテゴリ | 事業 / プロダクト / 設計 / 運用 |
| 決定内容 | 確定した方針・選択 |
| 背景 | 議論の発端、選択肢、選定理由 |
| 影響範囲 | 反映が必要な文書・コード |
| 決定者 | 最終承認者 |
| 関連 TBD | 解決された GOV-02 の TBD-ID |

---

## 2. 決定ログ

<!-- TEMPLATE: プロジェクトの重要決定を時系列で追加。会議メモから AI に候補抽出させる -->
<!-- SAMPLE START: フォーマット例 — 実際のプロジェクト決定に置き換えてください。
     ID は実エントリと衝突しないよう D-000 を書式見本として予約している -->
### D-000：[決定タイトル]（書式見本 — 実際の採番は D-001 から）

| 項目 | 内容 |
| --- | --- |
| 日付 | YYYY-MM-DD |
| カテゴリ | 事業 / プロダクト / 設計 / 運用（いずれか） |
| 決定内容 | [確定した方針・選択] |
| 背景 | [議論の発端、選択肢、選定理由] |
| 影響範囲 | [反映が必要な文書・コード] |
| 決定者 | [最終承認者] |
| 関連 TBD | [解決された GOV-02 の TBD-ID、または —] |
<!-- SAMPLE END -->

### D-001：2 リポジトリ構成 → pnpm workspaces + Turborepo モノレポへの移行

| 項目 | 内容 |
| --- | --- |
| 日付 | 2026-08-17 |
| カテゴリ | 設計 |
| 決定内容 | 2 リポジトリ構成（public/admin）・npm から、1 リポジトリ内 `apps/public`/`apps/admin` + `packages/schema` の pnpm workspaces + Turborepo モノレポへ移行（`packages/types` は実際の利用箇所が出てから切り出す方針とし、見送り） |
| 背景 | 複数リポジトリ間の DB スキーマ手動コピーによる同期漏れ事故を構造的に防ぎ、ドキュメントも1箇所に集約して運用コストを下げるため（Cloudflare 公式推奨のモノレポ構成に合わせた）。`packages/config`/`packages/ui` は検討の上、実体のある共有内容がないため見送った。 |
| 影響範囲 | DEV-01 §1/§2/§3・§5, DEV-02, DEV-03, DEV-04, DEV-05, DEV-06, DEV-07 §9, DEV-08 §1/§2, DEV-09, DEV-10, PRD-01 §1-1, PRD-02 §1-3/§3, PRD-04, OPS-02 §3, 00_DEV_GUIDE.md, CLAUDE.md, README.md, 各 skill（schema-build/scaffold/admin-design/public-design/design-review）, ルート設定（package.json / pnpm-workspace.yaml / turbo.json / eslint.config.js / .prettierrc / .devcontainer） |
| 決定者 | Tech Lead |
| 関連 TBD | — |

### D-002：CI は GitHub Actions、CD は Cloudflare Workers Builds

| 項目 | 内容 |
| --- | --- |
| 日付 | 2026-08-18 |
| カテゴリ | 運用 |
| 決定内容 | 検査（CI）と デプロイ（CD）で基盤を分ける。CI は GitHub Actions（`.github/workflows/ci.yml`。`dev` 宛 PR で `pnpm check` + `pnpm build`）、CD は Cloudflare Workers Builds の GitHub 連携（リポジトリ内にデプロイ用ワークフローを持たない）。デプロイトリガーは staging ← `dev`、production ← `main`（`main` は案件 bootstrap 時に作成）。D1 マイグレーションは Workers Builds が自動実行しないため、`apps/admin` 側の Deploy command に `wrangler d1 migrations apply` を前置する |
| 背景 | DEV-08 §3 で Open だった CI/CD 基盤の決定。Workers Builds が Root directory / Build Watch Paths / Deploy command のカスタマイズ / Worker ごとの GitHub check run を備え、モノレポ 2 Worker 構成の要件（DEV-08 §2 のパスフィルタ）を満たすうえ、Cloudflare API トークンをリポジトリ側で管理せずに済むため CD はそちらに寄せた。一方 PR 時の品質ゲートは Workers Builds の範囲外で、hooks（`.claude/hooks/format-and-check.sh`）は Claude Code のセッション内でしか動かず強制力にならないため、CI は GitHub Actions で別途用意した。ブランチ名は docs が指していた `develop` が実在せず既定が `dev` であったため、docs 側を実態に合わせた |
| 影響範囲 | DEV-08 §2/§3, `.github/workflows/ci.yml`, CLAUDE.md, README.md |
| 決定者 | Tech Lead |
| 関連 TBD | — |

### D-003：共有パッケージは「2 つ目の利用者が現れてから」切り出す

| 項目 | 内容 |
| --- | --- |
| 日付 | 2026-09-07 |
| カテゴリ | 設計 |
| 決定内容 | `packages/server-kit`（パスワードハッシュ、ロックアウト、セッション規則、HTTP エンベロープ）と `packages/content`（開発者が更新する Markdown）を追加。D-001 で見送った `packages/config` / `packages/ui` / `packages/types` は引き続き作らない |
| 背景 | D-001 の「実体のある共有内容がないため見送る」という判断は変えていない。変わったのは実体の方で、公開側ログイン（FG-07）の追加により AdminUser と Member で同じセッション規則が 2 箇所必要になり、Content Collections の採用により両アプリが同じ Markdown スキーマを見る必要が生じた。**共有するのは規則だけで、保管場所は共有しない** — セッションのテーブル・クッキー・照合コードは各アプリに残す（DEV-02 §1-2） |
| 影響範囲 | DEV-01 §1, DEV-02 §1-2, DEV-05 §1/§2, DEV-06 §1, DEV-07 §3, 00_DEV_GUIDE.md, CLAUDE.md |
| 決定者 | Tech Lead |
| 関連 TBD | — |

### D-004：コードジェネレータ（Plop）を採用せず、参照実装に倣う

| 項目 | 内容 |
| --- | --- |
| 日付 | 2026-09-07 |
| カテゴリ | 設計 |
| 決定内容 | `scaffold` スキルは Plop でファイルを生成せず、参照実装（Inquiry）に倣って書く。`plopfile.mjs` / `plop-templates/` は持たない。画面雛形の一括生成（旧 `pnpm generate pages`）も行わない |
| 背景 | テンプレート言語（`.hbs`）で書いた雛形は型チェックも lint も効かず、規約やパスを変えた時に黙って腐る（実際に旧テンプレートのものはパス移動で参照切れになっていた）。参照実装は CI で型チェック・lint・テストが回るため腐らない。加えて生成の決定性という利点も、生成後に手作業が残る以上は限定的だった — 旧 `scaffold` の記述 122 行のうち 104 行は「生成器が知り得ないこと」の説明であり、Plop が担っていたのは残り 18 行にすぎない。画面雛形はルートと見出しだけを作っても `admin-design`/`public-design` が作り直すため、生成する意味がない |
| 影響範囲 | DEV-01 §5, DEV-05 §1, 00_DEV_GUIDE.md §2/§3, `.claude/skills/scaffold/` |
| 決定者 | Tech Lead |
| 関連 TBD | — |

### D-005：規約はドキュメントではなくテストと Lint で強制する

| 項目 | 内容 |
| --- | --- |
| 日付 | 2026-09-07 |
| カテゴリ | 品質 |
| 決定内容 | 機械的に判定できる規約は検証コードに落とす。スキーマ規約（命名・型・必須列・FK のインデックス）は `packages/schema/tests/conventions.test.ts`、レイヤー境界は `eslint-plugin-boundaries` + `no-restricted-imports`、ルートの認証漏れは `apps/admin/tests/e2e/login.spec.ts` の 401 一覧が担う |
| 背景 | 旧 `schema-build` の検証手順は「DEV-07 §12 のチェックリストを読んで自己点検する」であり、コードを書いた本人が自分の成果物を点検する構造だった。スキルを使わずにテーブルを追加した場合は何も働かない。CI で落ちる形にすれば、誰が書いても・スキル経由でなくても効く。判断を要する規約（このテーブルに公開 ID が要るか等）は引き続きドキュメントとレビューが担う |
| 影響範囲 | DEV-03 §3, DEV-07 §12, `.claude/skills/schema-build/`, `eslint.config.js` |
| 決定者 | Tech Lead |
| 関連 TBD | — |

---

## 3. 記録すべき意思決定の種別

- 顧客セグメントの変更
- MVP スコープの追加 / 除外
- 価格改定・無料層設計の変更
- 認証・権限・セキュリティ方針の変更
- データモデル（PRD-01）の変更
- 技術スタックの変更（DEV-01 §1 確定スタック・§2 機能別標準・§3 不採用リストの変更はすべてここに記録）
- AI 機能採否の変更
- インフラ・デプロイ戦略の変更
- 契約条件・SLA の変更

---

## 4. 正仕様承認ゲート

### 4-1. 正仕様の定義

「正仕様」とは、関係者が合意し、開発・運用・契約の判断基準として参照できる状態の文書セットを指す。必須文書の status が `approved` に達し、本セクションの承認記録が残った時点で正仕様とみなす。

### 4-2. 承認条件

- 必須文書の status が `approved`（必須文書セットは適用フローにより異なる — 00_README §4。デモ・受託の軽量フローでは対象文書のみで可）
- 主要な未決事項が GOV-02 で追跡されている
- 開発着手を止める重大な未決がない
- 承認者が承認記録に記録されている

### 4-3. 承認記録フォーマット

<!-- TEMPLATE: 正仕様が承認されたら記録する -->

| 承認 ID | 承認日 | 承認対象文書リスト | 承認者 | 承認時の未決事項数 | 備考 |
| --- | --- | --- | --- | --- | --- |
| APR-001 | YYYY-MM-DD | BIZ-01〜03, PRD-01〜05, DEV-01〜10, OPS-01〜02, GOV-01, GOV-02 | [承認者名] | [件数]（GOV-02 で管理） | [備考] |

---

## 5. 変更管理フロー（Change Request）

### 5-1. 目的

正仕様承認後に仕様変更が生じた場合、影響範囲を特定し、無承認で実装が進むことを防ぐ。

### 5-2. 変更種別と承認レベル

| 変更種別 | 定義 | 承認レベル |
| --- | --- | --- |
| Minor | 誤字・表現修正・説明補足など内容の実質変更なし | 記録のみ（承認不要） |
| Standard | 既存方針の調整・機能スコープの変更・要件追加 / 削除 | PdM または Tech Lead いずれか 1 名の承認 |
| Major | アーキテクチャ・認証・料金・SLA・権限モデル・技術スタック（DEV-01）の変更 | 事業責任者 + Tech Lead の承認 |

少人数チーム（兼務前提）を想定し、厳格な承認は Major のみとする。

### 5-3. 変更管理フロー

```mermaid
flowchart TD
    A[変更申請：内容・理由・影響範囲を記述] --> B{変更種別判定}
    B -->|Minor| C[記録のみ]
    B -->|Standard| D[PdM または Tech Lead が承認]
    B -->|Major| E[事業責任者 + Tech Lead が承認]
    C --> F[該当文書を更新]
    D --> F
    E --> F
    F --> G[GOV-01 に CR 記録を追記]
    G --> H[関連文書へ反映し整合確認]
```

### 5-4. 変更申請記録フォーマット

<!-- TEMPLATE: 正仕様承認後に変更申請が出たら記録する -->

| CR-ID | 申請日 | 変更内容 | 種別 | 影響文書 | 承認者 | 承認日 | 反映状況 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CR-001 | YYYY-MM-DD | [変更内容の概要] | Minor / Standard / Major | [影響文書] | [承認者] | YYYY-MM-DD | 完了 / 反映中 |

---

## 6. 運用ルール

- 新たな決定が出たら本書に追記する。GOV-02 の TBD は解決時点で D-NNN に転記
- 決定の取り消し・変更は新しい D-NNN として記録し、旧 D-NNN に「→ D-MMM で置換」と注記
- 文書間で矛盾が見つかった場合、本書の最新決定が優先

---

## 7. 記入時チェックポイント

- 決定内容・背景・影響範囲が空欄になっていないか
- 決定者が明確か
- 関連 TBD（GOV-02）が転記されているか
- CR が時系列で追えるか
- Major 変更が 事業責任者 + Tech Lead に承認されているか
