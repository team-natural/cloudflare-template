---
doc-id: DEV-10
title: 統合・外部 API 仕様
phase: 3
status: draft-ai
owner: Tech Lead
last-updated: 2026-08-18
related-docs:
  - DEV-01: 技術スタック決定書
  - DEV-02: セキュリティ
  - DEV-04: API 仕様
  - DEV-05: バックエンド実装
  - DEV-08: デプロイ定義
  - PRD-05: AI 機能仕様（LLM 統合）
---

# 10-integrations-spec.md — 統合・外部 API 仕様

## このセクションの目的

外部サービス（決済 / メール / ストレージ / LLM / OAuth 等）との統合パターン、Webhook、冪等性確保、認証方式、エラーハンドリングを集約する。使用するサービス・ライブラリの選定は DEV-01（§1 確定スタック・§2 機能別標準ライブラリ）で一意化済みであり、本書では選定・代替比較は行わない。

> **本テンプレートの位置づけ**: 多くのプロジェクトで頻出する外部統合を網羅。採用しない統合はセクションを削除して使う。

---

## 1. 統合の標準パターン

### 1-1. 統合方式の分類

| 方式 | 用途 | 実装パターン |
| --- | --- | --- |
| 同期 API 呼び出し | 即座にレスポンスが必要 | `fetch()`、タイムアウト 5〜10 秒 |
| 非同期 API 呼び出し | レスポンス待ち不要 | `ctx.waitUntil()` による後処理（Queues 不採用 — DEV-01 §1。DEV-05 §4） |
| Webhook 受信 | 外部サービスからの通知 | 署名検証 + 冪等性 |
| バッチ連携 | 定期同期 | Cloudflare Cron Triggers（`Confirmed` — DEV-01 §2） |
| ストリーミング | LLM 応答の逐次表示（採用時） | SSE（Server-Sent Events） |

### 1-2. 共通実装ルール

| ルール | 内容 |
| --- | --- |
| HTTP Client | Workers 標準の `fetch()` を使用（追加の HTTP クライアントライブラリは導入しない） |
| タイムアウト | 同期：5〜10 秒、非同期：30 秒 |
| リトライ | 指数バックオフ（10s / 30s / 60s）、3 回まで |
| エラーハンドリング | 4xx は記録のみ、5xx はリトライ、ネットワークエラーはリトライ |
| ログ | request_id を必ず付与、レスポンスは最初の 500 文字のみ |
| 監視 | 失敗を構造化ログに出力。エラー監視ツール導入後（DEV-01 §2: `@sentry/cloudflare`）は同ツールにも送信し成功率を確認 |

### 1-3. シークレット管理

| 区分 | 管理場所 |
| --- | --- |
| API キー | `.dev.vars`（local、gitignore 対象）/ Cloudflare Workers シークレット（本番。`wrangler secret put`。DEV-01 §1・DEV-08 参照） |
| Webhook 署名キー | 同上 |
| OAuth Client Secret | 同上 |

コードからは `import { env } from "cloudflare:workers"` 経由で `env.XXX` としてアクセスする（型は `wrangler types` が生成する `worker-configuration.d.ts` の `Cloudflare.Env`。`Astro.locals.runtime.env` は v6 で削除済みの旧 API（採用する v7 にも無い） — CLAUDE.md 参照）。`config/services.php` のような設定集約ファイルは存在しない。

---

## 2. 決済（Stripe、軽量 EC 採用時のみ）

> **本節は PRD-03 FG-05「軽量注文・決済」を採用する場合のみ埋める。** 本テンプレート（パターン A）にはサブスクリプション課金・Organization 単位の契約という概念自体が存在しない（00_README §2-2、PRD-01 §1、DEV-07 §3-5/§7）。軽量 EC を採用しない大半のプロジェクトでは本節を削除する。

### 2-1. 採用機能

| 機能 | 採用 |
| --- | --- |
| Checkout Session（ホスト型決済ページ、単発の一回払い） | ○ |
| Payment Intent（Checkout Session 内部で自動生成） | ○（直接生成・操作は基本不要。状態は Webhook で追跡） |
| Subscription（継続課金） | ✕（本テンプレの対象外。軽量 EC は一回払いのみ） |
| Stripe Connect（代理店分割送金） | ✕ |
| Tax 自動計算 | △（日本国内向けはまず不要） |
| Customer Portal（顧客によるプラン変更・カード変更） | ✕（顧客アカウント・サブスクを持たないため不要。PRD-01 §1-3） |

### 2-2. 標準フロー

```
1. 利用者がカート画面で「注文する」ボタンを押す
2. Backend: orders テーブルに Order を status = pending で作成
3. Backend: Stripe Checkout Session 作成（success_url / cancel_url 指定、Order の public_id をメタデータに付与）
4. 利用者を Stripe Checkout にリダイレクト
5. 決済成功 → success_url にリダイレクト（この時点では Order を確定させない）
6. 並行して Stripe → Webhook → Backend に通知
7. Webhook ハンドラで冪等性チェック（stripe_event_logs、DEV-07 §7-3）の上、Order を paid に更新
```

注文はゲストチェックアウト（顧客アカウント不要）が基本。FG-07（会員登録・マイページ）を採用する場合はログイン中の Member を `orders.member_id` に任意で紐付けられる（PRD-01 §1-1・§1-3、DEV-07 §7-1）。

### 2-3. 必須環境変数

```bash
STRIPE_KEY=pk_test_...
STRIPE_SECRET=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

商品カタログの持ち方（Stripe 側に Price オブジェクトを事前作成して ID 参照する方式 か、Checkout Session 作成時に `price_data` で都度金額を指定する方式）は **Open**（案件実装時に確定。軽量 EC の実装時に確定する）。

### 2-4. Webhook ハンドリング

エンドポイント: `POST /api/v1/payments/webhook`（Astro API Route、`apps/admin/src/pages/api/v1/payments/webhook.ts`）。`stripe` npm パッケージの SDK は Node 依存を含むため、`wrangler.jsonc` に `nodejs_compat` フラグが必要（DEV-01 §2）。

```typescript
import type { APIContext } from "astro";
import { env } from "cloudflare:workers"; // Astro.locals.runtime.env は v6 で削除済みの旧 API（採用する v7 にも無い — DEV-05 §1）
import Stripe from "stripe";

export async function POST({ request }: APIContext): Promise<Response> {
  const stripe = new Stripe(env.STRIPE_SECRET);

  // 1. 署名検証
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, request.headers.get("stripe-signature") ?? "", env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  // 2. 冪等性チェック（stripe_event_logs テーブル、DEV-07 §7-3）
  const existing = await env.DB.prepare("SELECT 1 FROM stripe_event_logs WHERE stripe_event_id = ?").bind(event.id).first();
  if (existing) {
    return new Response("Already processed", { status: 200 });
  }

  // 3. ログ記録
  await env.DB.prepare("INSERT INTO stripe_event_logs (stripe_event_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)").bind(event.id, event.type, JSON.stringify(event.data), new Date().toISOString()).run();

  // 4. 処理（単発の一回払いイベントのみ。サブスクリプション系イベントは本テンプレの対象外）
  switch (event.type) {
    case "checkout.session.completed":
      await markOrderPaidFromCheckoutSession(env, event.data.object);
      break;
    case "payment_intent.succeeded":
      // checkout.session.completed で Order を確定させるため、通常は冗長確認のみ（欠落時のフォールバック）
      await ensureOrderPaidFromPaymentIntent(env, event.data.object);
      break;
    case "payment_intent.payment_failed":
      await recordOrderPaymentFailure(env, event.data.object);
      break;
    case "charge.refunded":
      await markOrderCancelled(env, event.data.object); // 返金は cancelled へ遷移（DEV-09 §2-5-2）
      break;
    default:
      break;
  }

  // 5. 処理完了マーク
  await env.DB.prepare("UPDATE stripe_event_logs SET processed_at = ? WHERE stripe_event_id = ?").bind(new Date().toISOString(), event.id).run();

  return new Response("OK", { status: 200 });
}
```

> 上記コードは Webhook 処理の**考え方**を示す簡略例。`env.DB.prepare()` の直書きは DEV-05 §2 の規約（Drizzle クエリビルダ経由・Service 層への集約）を簡略化したもので、実装時は Service 関数に置き換える。

### 2-5. 監視すべきイベント

| イベント | 処理 |
| --- | --- |
| `checkout.session.completed` | Order を `paid` に更新（正常フローの確定トリガー） |
| `payment_intent.succeeded` | 冗長確認のみ（`checkout.session.completed` が主。省略可） |
| `payment_intent.payment_failed` | Order を `cancelled` に更新（DEV-09 §2-5-3 が状態遷移の正本）。運営者へアラート（§3-3 参照） |
| `charge.refunded` | Order を `cancelled` に更新（返金専用の状態は持たない — DEV-09 §2-5-2、DEV-07 §7-1） |

---

## 3. メール（Resend）

メールは **Resend（`resend` npm パッケージ）で確定**（DEV-01 §1。オプションではなく確定スタック）。プロジェクト開始時に導入する。

### 3-1. 設定

```bash
# プロジェクト開始時に導入（DEV-01 §1）。メール送信は管理側の関心事として apps/admin に追加する
pnpm --filter admin add resend

# .dev.vars（local）/ Cloudflare Workers シークレット（本番）
RESEND_API_KEY=re_xxxxxxxxxx
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME="${APP_NAME}"
```

> **`lib/server/mail/` はテンプレートに未同梱**（`resend` も依存に入っていない）。以下は案件で
> 実装する際の雛形であり、実在するファイルの引用ではない。お問い合わせ通知（F-06-01）と
> 自動返信（F-06-03）を使う時点で `pnpm --filter admin add resend` から始める。

```typescript
// apps/admin/src/lib/server/mail/client.ts（案件で作成する）
import { Resend } from "resend";

export function createResendClient(env: Env): Resend {
  return new Resend(env.RESEND_API_KEY);
}
```

> `resend` SDK は fetch ベースで Workers 対応。Laravel の `MAIL_MAILER` ドライバ切替や `config/services.php` のような集約設定ファイルは存在しない — 上記のように Service 層で直接インスタンス化する。

### 3-2. ドメイン認証（必須）

| 項目 | 設定先 |
| --- | --- |
| SPF | DNS TXT レコード |
| DKIM | Resend 提供の DNS レコード |
| DMARC | DNS TXT レコード（`v=DMARC1; p=quarantine; rua=mailto:dmarc@...;`） |

Resend Dashboard で検証ステータスを確認、すべて緑になってから本番運用。

### 3-3. 送信の標準パターン

宛先による送信経路の使い分けは **DEV-05 §4-1 を正本** とする。専用の Notification/Mailable
クラス分けの仕組みは存在しないため、AdminUser 宛・利用者（未アカウント）宛のように
**ユーザーアカウント未作成の宛先も同じ送信関数を使う**（宛先ごとに個別実装を作らない）。
通知の標準スコープは PRD-03 FG-06（Inquiry 受信時の運営者通知・Order 受信時の運営者通知・
利用者への自動返信のみ）であり、アプリ内通知（ベル・バッジ・WebSocket 配信）の基盤は
本テンプレ標準では持たない：

```typescript
// 送信側（Service 内）— Inquiry 受信時に運営者へ通知（F-06-01）
import { sendInquiryReceivedEmail } from "../mail/inquiries";

await sendInquiryReceivedEmail(env, inquiry);
```

```typescript
// apps/admin/src/lib/server/mail/inquiries.ts（案件で作成する）
import { createResendClient } from "./client";

export async function sendInquiryReceivedEmail(env: Env, inquiry: Inquiry): Promise<void> {
  const resend = createResendClient(env);

  await resend.emails.send({
    from: env.MAIL_FROM_ADDRESS,
    to: env.MAIL_ADMIN_ALERTS,
    subject: `【${env.APP_NAME}】新しいお問い合わせが届いています`,
    html: renderInquiryReceivedEmail({ inquiry }),
  });
}

// 送信先（未アカウントの送信者本人）への自動返信（F-06-03）。宛先が違うだけで同じ関数群を使う
export async function sendInquiryAutoReplyEmail(env: Env, inquiry: Inquiry): Promise<void> {
  const resend = createResendClient(env);

  await resend.emails.send({
    from: env.MAIL_FROM_ADDRESS,
    to: inquiry.email,
    subject: `【${env.APP_NAME}】お問い合わせを受け付けました`,
    html: renderInquiryAutoReplyEmail({ inquiry }),
  });
}
```

運営者向けアラートも同じ `resend` SDK 経由の送信関数を使う（クラス分けの仕組みはないため、
呼び出し元のモジュールで宛先種別を区別する）。以下は軽量 EC 採用時のみ発生する例（F-06-02）：

```typescript
// 例: Order 決済失敗時の運営者向けアラート（軽量 EC 採用時のみ、PRD-03 FG-05）
await sendAdminAlertEmail(env, {
  to: env.MAIL_ADMIN_ALERTS,
  subject: "注文の決済失敗アラート",
  html: renderOrderPaymentFailedAlert(order),
});
```

### 3-4. ルール

- 宛先による送信経路の使い分けは DEV-05 §4-1（エンドユーザー宛を個別の一時実装で済ませない）
- 送信は `ctx.waitUntil()` で後処理化してレスポンスをブロックしない（DEV-05 §4。Queues は不採用）。大量一括送信は Cron バッチに寄せる
- テンプレートを介さない、都度組み立てた生の HTML/テキストの直接送信は禁止（テンプレート関数を経由する）
- テンプレート形式は **Open**（案件実装時に確定。暫定: プレーン文字列 + 共通レイアウト関数 [Assumed]。候補: React Email 等）
- Subject は `【サービス名】` で始める統一スタイル
- 配信エラーは Resend Webhook で受信

---

## 4. ファイルストレージ（Cloudflare R2）

ファイルストレージは **Cloudflare R2** で確定（DEV-01 §1。バインディング名は必ず `BUCKET`、CLAUDE.md 参照）。ドライバ切替の抽象化レイヤー（Laravel の `Storage` ファサード相当）は設けない — 切替候補が無いため、常に `env.BUCKET`（R2 バインディング）を直接操作する。

### 4-1. 設定（R2 バインディング）

```jsonc
// wrangler.jsonc
{
  "r2_buckets": [{ "binding": "BUCKET", "bucket_name": "<project>-bucket" }],
}
```

```typescript
// Service 内での操作例
await env.BUCKET.put(key, fileBody, { httpMetadata: { contentType } });
const object = await env.BUCKET.get(key);
await env.BUCKET.delete(key);
```

> D1/R2 は 1 サービスにつき 1 回だけ作成し、公開・管理の両リポジトリで同じ `bucket_name` を使う（CLAUDE.md「D1/R2 バインディングルール」参照）。ローカル開発では Wrangler がバケットをエミュレートするため、AWS 認証情報の設定は不要。

### 4-2. バケット構造

単一運営前提のため、Organization 単位のプレフィックス階層は持たない（00_README §0-1・§2-2、PRD-01 §6）。

オブジェクトキーはアップロードされたファイル名から作らない。`media` の実装はキーを ULID から生成する
（`media/<ULID>`）— クライアント由来の名前を使うと、他のオブジェクトの上書きや意図しないプレフィックスへの
書き込みを許すことになる。

```
media/{public_id}                      # ADM-04 経由のアップロード。実装済み（DEV-05 §2）
avatars/{admin_user_id}                # AdminUser のアバター（採用時）
site/logo                              # サイトロゴ・OGP 既定画像（F-04-08 サイト設定）
orders/{order_id}/                     # 軽量 EC 採用時のみ。領収書 PDF 等の注文関連ファイル
ai-cache/                              # AI 生成中間ファイル（7 日後自動削除、AI 機能採用時のみ）
```

### 4-3. アクセス制御

| ファイル種別 | アクセス方式 |
| --- | --- |
| パブリック（アバター・サイトロゴ等） | 公開 URL |
| プライベート（投稿添付等） | 署名付き URL（15 分有効） |
| AI 中間ファイル | 内部のみ、外部公開なし |

> 署名付き URL は R2 の S3 互換 API 経由で発行する presigned URL、または Astro API Route 側で有効期限付きトークンを検証して都度 `env.BUCKET.get()` を返す方式のいずれかを使う。採用方式は **Open**（案件実装時に確定。Media 参照実装の実装時に確定し、DEV-05 §11 と合わせて更新する）。

### 4-4. アップロードフロー

```
オプション A: Astro API Route 経由（標準）
  Client → POST /api/v1/uploads → Astro API Route → env.BUCKET.put()

オプション B: Presigned URL（大容量ファイル）
  Client → POST /api/v1/uploads/presign → Astro API Route
  Astro API Route → Presigned URL を返す（R2 の S3 互換 API 経由で署名）
  Client → PUT で直接 R2 へ
```

### 4-5. バックアップ

バックアップ範囲・頻度の正本は OPS-02 §4（初期は重要ファイルのみ）。本書では範囲・頻度を定めない。

| 対象 | 内容 |
| --- | --- |
| 検証 | SHA256 比較で週次サンプリング（技術検証仕様） |

---

## 5. LLM プロバイダ（AI 機能採用時）

詳細は PRD-05 §4 参照。このプロジェクトは **Vercel AI SDK（`ai` + 各プロバイダの `@ai-sdk/*`）** で LLM を統合する（DEV-01 §2）。独自の `LlmClient` インターフェースや個別プロバイダクラス（`ClaudeClient` 等）は作らない。

### 5-1. 基本的な使い方

このテンプレートにはデフォルト未インストール。採用時は以下を実行：

```bash
pnpm --filter admin add ai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/openai
```

```typescript
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

// テキスト生成（モデル ID は環境変数から。プロバイダ公表の正式な完全 ID を指定する — PRD-05 §4-3）
const { text, usage } = await generateText({
  model: anthropic(env.ANTHROPIC_MODEL),
  system: "あなたはアシスタントです。",
  prompt: userInput,
});

const tokens = usage.promptTokens + usage.completionTokens;
```

> ⚠️ 本節のコード例（`usage` のフィールド名等）は AI SDK 旧版ベース。**採用時に context7 等で現行版の API を確認し、本節のサンプルを更新すること**（現行メジャーではフィールド名・モッククラス名が変わっている可能性がある）。

`tokens` は `ai_jobs`（DEV-07 §3-4）に記録する。利用量上限はサイト単位の 1 本のみで、Organization 別の内訳集計は行わない（本テンプレは単一運営が前提。PRD-05 §8-1、DEV-07 §3-4）。

### 5-2. 対応プロバイダ

DEV-01 §2 のとおり、使用できるプロバイダは Claude / Gemini / ChatGPT のみ（それ以外は禁止。DEV-01 §3）。

| Vercel AI SDK パッケージ | 用途 |
| --- | --- |
| `@ai-sdk/anthropic` | Claude |
| `@ai-sdk/google` | Gemini |
| `@ai-sdk/openai` | ChatGPT（GPT 系） |

### 5-3. プロバイダ切替

使用プロバイダとモデルは環境変数（例 `ANTHROPIC_MODEL`）で管理し、コード中にモデル ID を直接記述しない。一元管理場所は環境変数（`wrangler.jsonc` の `vars` / Secrets）で確定済み — 専用の設定ファイルは持たない（DEV-05 §6）。

```bash
# .dev.vars（local）/ Cloudflare Workers シークレット（本番）
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### 5-4. テスト時のモック

テストツールは Vitest（DEV-01 §1）。「実 API を呼ばずに固定レスポンスを返す」方針を維持する。Vercel AI SDK は `ai/test` のモックモデルでモデル自体をモック化できる（クラス名は SDK バージョンに依存 — 導入時に現行版を確認。§5-1 の注意書き参照）：

```typescript
import { generateText } from "ai";
import { MockLanguageModelV1 } from "ai/test";

// テストでは Mock モデルを使い、実 API を呼ばない
const { text } = await generateText({
  model: new MockLanguageModelV1({
    doGenerate: async () => ({
      text: "テスト用レスポンス",
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0 },
    }),
  }),
  prompt: "test",
});
```

実装パターンの詳細は DEV-01 §9（実装規約）の正本を参照。

---

## 6. OAuth（ソーシャルログイン）

### 6-1. 採用判断

| プロバイダ | 採用 |
| --- | --- |
| Google | 多くのケースで必須 |
| GitHub | 開発者向けプロダクトで採用 |
| Microsoft | エンタープライズ向け |
| LINE | 日本国内 B2C で採用 |

### 6-2. 標準実装

Arctic を使用（このテンプレートにはデフォルト未インストール。採用時に AdminUser 認証なら `pnpm --filter admin add arctic`、Member 認証（マイページ機能採用時）なら `pnpm --filter public add arctic` を実行）。Google / GitHub / Microsoft は Arctic の専用プリセットクラスを使う。LINE ログインのように専用プリセットが無いプロバイダは、Arctic の汎用 OAuth2 プリミティブの上に自前実装する（DEV-01 §2）：

```bash
# .dev.vars（local）/ Cloudflare Workers シークレット（本番）
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://app.example.com/auth/google/callback
```

```typescript
// apps/admin/src/pages/api/v1/auth/google/redirect.ts（Member 認証採用時は apps/public 配下の同等パス）
import { Google, generateCodeVerifier, generateState } from "arctic";
import type { APIContext } from "astro";
import { env } from "cloudflare:workers"; // Astro.locals.runtime.env は v6 で削除済みの旧 API（採用する v7 にも無い — DEV-05 §1）

export async function GET({ cookies, redirect }: APIContext): Promise<Response> {
  const google = new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);

  cookies.set("oauth_state", state, { httpOnly: true, secure: true, path: "/" });
  cookies.set("oauth_code_verifier", codeVerifier, { httpOnly: true, secure: true, path: "/" });

  return redirect(url.toString());
}
```

```typescript
// apps/admin/src/pages/api/v1/auth/google/callback.ts（Member 認証採用時は apps/public 配下の同等パス）
import { env } from "cloudflare:workers"; // Astro.locals.runtime.env は v6 で削除済みの旧 API（採用する v7 にも無い — DEV-05 §1）
import { findOrCreateFromSocial } from "../../../../lib/server/services/auth";

export async function GET({ url, cookies, redirect }: APIContext): Promise<Response> {
  const google = new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);

  const tokens = await google.validateAuthorizationCode(url.searchParams.get("code")!, cookies.get("oauth_code_verifier")!.value);
  const googleUser = await fetchGoogleUserInfo(tokens.accessToken());
  const user = await findOrCreateFromSocial(env, "google", googleUser);

  // セッション確立処理は DEV-02（セキュリティ）参照
  return redirect("/dashboard");
}
```

---

## 7. SAML / OIDC（エンタープライズ SSO）

**本テンプレートの標準対象外**。エンタープライズ要件（SAML / OIDC による IdP 連携）が発生した場合は、本テンプレを起点とした派生テンプレートで対応する（00_README §2-2 参照）。ライブラリ選定が必要になった時点で GOV-01 で決定し、DEV-01 §2 に追記する。

---

## 8. その他の頻出統合

標準ライブラリは DEV-01 §2 で一意化済み（全文検索 = D1 の FTS5 virtual table（第一候補）、Web Push = FCM HTTP v1 API 直呼び出し 等）。本節では選定は行わず、採用時の連携仕様のみ定める。DEV-01 §2 にない機能（分析・トラッキング等）が必要な場合は GOV-01 で決定し、DEV-01 に追記してから使う。

### 8-1. 全文検索（D1 FTS5、採用時）

| 項目 | 仕様 |
| --- | --- |
| 認証 | D1 バインディング（`env.DB`）経由のため専用の API キー管理は不要。不足時に外部検索サービスへフォールバックする場合はそのサービスの API キーを §1-3 に従い管理 |
| インデックス同期 | FTS5 virtual table を対象テーブルと同期させる SQLite の `CREATE TRIGGER`、または Service 層の書き込み関数から明示的に同期用 INSERT/UPDATE を行う（採用パターンは **Open** — 案件実装時に確定。全文検索採用時に確定） |
| 検索対象範囲 | テナント境界は存在しない（単一運営前提、00_README §0-1）。公開側検索は `status = 'published'` の Post のみを対象とし、管理画面側検索は全状態を対象にしてよい（ロール境界は DEV-02 §3 の認可チェックに従う） |
| エラー処理 | 同期失敗はリトライ（§1-2 の共通ルール）、検索障害時は機能を縮退（検索 UI 非表示 or DB フォールバックなし の明示） |

### 8-2. Web Push 通知（FCM HTTP v1 API 直呼び出し、採用時）

| 項目 | 仕様 |
| --- | --- |
| 認証（送信） | FCM サービスアカウント（Google Cloud Service Account JSON）から取得した OAuth2 アクセストークンを `Authorization: Bearer` に付与。§1-3 に従い Secrets 管理 |
| 認証（クライアント購読） | VAPID 鍵ペア（`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`）はブラウザの Push Subscription 生成に使用。§1-3 に従い Secrets 管理 |
| 購読情報 | `push_subscriptions` 相当の D1 テーブル（自前定義、DEV-07 参照。パッケージ標準のスキーマは存在しない） |
| 配信 | Service 層の送信関数として実装し、`fetch()` で FCM HTTP v1 API を直接呼び出す。重い一括配信は Cron バッチに寄せる（Queues 不採用） |
| エラー処理 | 無効トークン（`UNREGISTERED` 等のエラーコード）は購読レコードを削除、その他は §1-2 のリトライ規則 |

### 8-3. 分析・トラッキング

標準ツールは **Open**（案件実装時に確定。暫定: Cloudflare Web Analytics で開始 [Assumed]）。確定時は DEV-01 §2 に追記した上で、計測タグの管理方法・同意取得（DEV-02 / 法務要件）を本節に記載する。

### 8-4. プロダクト固有連携の記述例（印刷・配送 API 等）

プロダクト固有の外部連携は、以下のフォーマット（連携先 / 認証方式 / 主要 API / Webhook / エラー処理）で本節に追記する。

<!-- SAMPLE START: フォーマット例 — 実際のプロダクト固有連携に置き換えてください -->
| 項目 | 例：印刷発注 API（ラクスル等） | 例：配送追跡 API（クロネコ等） |
| --- | --- | --- |
| 用途 | 印刷物発注 | 配送状況の追跡・通知 |
| 認証方式 | API キー（§1-3 に従い Secrets 管理） | API キー |
| 呼び出し方式 | 非同期（`ctx.waitUntil()`、§1-1） | バッチ連携（定期ポーリング） |
| Webhook | 発注ステータス変更を受信（署名検証 + 冪等性、§1-1） | なし |
| エラー処理 | §1-2 の共通ルール（指数バックオフ 3 回）+ 失敗時は運用者へ通知 | 同左 |
<!-- SAMPLE END -->

---

## 9. エラーハンドリング・観測

### 9-1. ログ標準

フレームワーク提供のログコンテキスト機構はないため、構造化した JSON を `console.log` に出力する（DEV-01 §4「可観測性優先」）：

```typescript
const logContext = { requestId, service: "stripe", action: "create_checkout_session", orderId: order.publicId };

console.log(JSON.stringify({ level: "info", message: "Stripe checkout session created", ...logContext, stripeSessionId: session.id }));
```

### 9-2. エラー監視ツールへの送信

エラー監視は Cloudflare Workers 標準のログ/メトリクスで開始し、必要になった時点で `@sentry/cloudflare` を導入する（DEV-01 §2。Node 版 Sentry SDK ではない）。導入後の送信基準：

| シナリオ | 送信するか |
| --- | --- |
| 4xx エラー（クライアントエラー） | 記録のみ、エラー監視ツールには送らない |
| 5xx エラー（サーバーエラー） | エラー監視ツールへ送信 |
| タイムアウト | エラー監視ツールへ送信 |
| Webhook 署名検証失敗 | エラー監視ツールへ送信（潜在的攻撃の可能性） |

### 9-3. 連携先死活監視

| 項目 | 監視方法 |
| --- | --- |
| Stripe | Stripe Dashboard で API 成功率 |
| Resend | Resend Dashboard で配信成功率 |
| LLM プロバイダ | プロバイダ Status Page を購読 |
| R2 / 基盤 | Cloudflare Status Page を購読（DEV-01 §1） |

---

## 10. テスト戦略

テストツールは Vitest + Playwright（DEV-01 §1）。以下のモック方針を維持する。

| 対象 | 方法 |
| --- | --- |
| Stripe | `stripe-cli` で Webhook をローカル受信、Mock も使う |
| Resend | テスト時は送信関数をモックし、実際の Resend API を呼ばない |
| R2 | テスト時は R2 バインディングのローカルエミュレーション（Wrangler/Miniflare）、または採用テストツールのモック機構を使う |
| LLM | Vercel AI SDK のモックモデル（`ai/test`）で固定レスポンス、`AI_LIVE_TEST=true` 時のみ実 API |
| Webhook | ローカルで `ngrok` 等でトンネル |

---

## 11. 環境変数まとめ

```bash
# Stripe（軽量 EC 採用時のみ。PRD-03 FG-05）
STRIPE_KEY=
STRIPE_SECRET=
STRIPE_WEBHOOK_SECRET=
# 商品ごとの Price ID を固定管理する方式を採用した場合のみ追加（§2-3 — 案件実装時に確定）
# STRIPE_PRICE_<PRODUCT>=

# Resend
RESEND_API_KEY=
MAIL_FROM_ADDRESS=
MAIL_FROM_NAME=
# Inquiry / Order 受信の運営者向け通知の宛先（FG-06）
MAIL_ADMIN_ALERTS=

# ファイルストレージ（Cloudflare R2、DEV-01 §1）
# 通常の読み書きは env.BUCKET バインディング経由のため環境変数は不要（wrangler.jsonc の r2_buckets で設定）
# Presigned URL 発行が必要な場合のみ、R2 API トークン（S3 互換）を追加
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ACCOUNT_ID=

# AI (Vercel AI SDK) — 使用するプロバイダのキーのみ設定
# ANTHROPIC_API_KEY=sk-ant-xxxxxxxx       # Anthropic Claude
# OPENAI_API_KEY=sk-xxxxxxxx              # OpenAI
# GEMINI_API_KEY=xxxxxxxx                 # Google Gemini
# プロバイダ・モデルは環境変数で一元管理（確定 — DEV-05 §6。専用の設定ファイルは持たない）
# ANTHROPIC_MODEL= / OPENAI_MODEL= / GEMINI_MODEL=（正式な完全モデル ID を指定 — PRD-05 §4-3）
# 利用量上限はサイト単位の 1 本のみ（Organization 別の内訳はない。PRD-05 §8-1、DEV-07 §3-4）

# OAuth（採用時）
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# エラー監視（@sentry/cloudflare、導入時のみ。DEV-01 §2）
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.2
```

---

## 12. 記入時チェックポイント

- 各統合の採否が明確か（採用ライブラリが DEV-01 §1 / §2 と一致しているか。本書内で独自選定をしていないか）
- Stripe 統合（軽量 EC 採用時のみ）が一回払いの Checkout Session / Payment Intent に統一されており、サブスクリプション・Customer Portal 等の契約管理コードが残っていないか（PRD-03 FG-05、DEV-07 §3-5/§7）
- Stripe Webhook の冪等性（`stripe_event_logs`）が実装されているか
- メールのドメイン認証（SPF/DKIM/DMARC）が設定されているか
- 通知（メール）のスコープが PRD-03 FG-06（Inquiry 受信・Order 受信・自動返信）に収まっているか。アプリ内通知・WebSocket 配信の基盤を作り込んでいないか
- R2（ファイルストレージ）のバックアップ方針が OPS-02（運用ハンドブック）と整合しているか
- LLM プロバイダ（採用時）が PRD-05 と整合しているか（Claude / Gemini / ChatGPT のみ）。AI 利用量の集計がサイト単位 1 本になっているか（Organization 別内訳を作っていないか）
- `organization_id` 等のテナントスコープ列・フィールドが統合コード・Webhook payload・バケット構造に残っていないか（本テンプレは単一運営が前提）
- すべての API キーが Secrets で管理されているか
- 監視・観測の方針が OPS-02（運用ハンドブック）と整合しているか
