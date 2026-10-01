# デプロイ手順（Cloudflare Workers Builds）

このテンプレートから作ったプロジェクトは、すべてこの手順でデプロイする。プロジェクト名や機能には依存しない書き方にしてあるので、テンプレートでもプロジェクトでも同じ文書として読める。

## 表記

| 表記 | 意味 | 例 |
| --- | --- | --- |
| `<project>` | `apps/*/wrangler.jsonc` の `name` から `-public` / `-admin` を除いた部分 | `acme` |
| `<env>` | `staging` または `production` | |
| `<domain>` | 本番の公開ドメイン | `example.com` |
| `<org>/<repo>` | GitHub のリポジトリ | |

## 全体像

| 役割 | 担当 | リポジトリ内の実体 |
| --- | --- | --- |
| CI（PR・push のチェック） | GitHub Actions | `.github/workflows/ci.yml` |
| CD（デプロイ） | Cloudflare Workers Builds（ダッシュボードで GitHub と連携） | 各アプリの `package.json` の `deploy` スクリプト |

Worker は **1プロジェクトにつき4つ**。名前は wrangler が `<wrangler の name>-<env>` で決めるので、自分で選ぶものではない。

| Worker 名 | パス（Root directory） | デプロイされるブランチ |
| --- | --- | --- |
| `<project>-public-staging` | `apps/public` | `dev` |
| `<project>-admin-staging` | `apps/admin` | `dev` |
| `<project>-public-production` | `apps/public` | `main` |
| `<project>-admin-production` | `apps/admin` | `main` |

```
feature/* ──PR──▶ dev  ──▶ staging に自動デプロイ
dev       ──PR──▶ main ──▶ production に自動デプロイ
```

## この形にしている理由（読み飛ばさない）

| 制約 | 結果 |
| --- | --- |
| 環境は **ビルドの時点で** `CLOUDFLARE_ENV` によって決まる。`@astrojs/cloudflare` が1つの環境だけにした `dist/server/wrangler.json` を書き出し、`wrangler deploy` はそれを使う | `wrangler deploy --env production` では切り替えられない（ビルドした環境と違うと、wrangler がエラーで止める）。`CLOUDFLARE_ENV` を付けずにビルドすると、先頭のプレースホルダの設定になる |
| Workers Builds は D1 マイグレーションを実行しない | admin の `deploy` スクリプトが、先にマイグレーションを適用する |
| デプロイで適用されるのは **コミット済み** のマイグレーションだけ | スキーマを変えたらマイグレーションもコミットする。忘れると CI（`Migrations match the schema`）が落ちる |
| ローカルでビルドすると `.wrangler/deploy/config.json` が残り、以後の wrangler コマンドはビルドした環境の設定を読む | 手で `wrangler … --env <env>` を打つときは、必ず `--config wrangler.jsonc` も付ける（seed と `db:migrate:remote` は付けてある）。付けないと「ビルドした環境と違う」で止まる |
| KV namespace のタイトルはアカウントで一意 | 名前には必ず `<project>` を付ける |
| public と admin は並行してデプロイされ、どちらが先に終わるかは決まっていない | マイグレーションは前方互換にする（カラムを追加 → コードで使う → 古いカラムを消す、を別々のリリースに分ける） |

---

## 初回セットアップ

### 1. Cloudflare アカウント

- **Workers Paid プラン** にする。admin のパスワードハッシュは CPU を約 50ms 使い、Free プランの上限（10ms）に収まらない。
- 独自ドメインを使うなら、`<domain>` を Cloudflare のゾーンとして追加しておく。
- staging を Cloudflare Access で守る（手順4）には、Zero Trust に **ID プロバイダー（ログイン方法）が1つ以上**要る。ダッシュボードの **Zero Trust**（初回はチーム名と Free プランを選ぶ）→ **Integrations → Identity providers → Add new identity provider** で **One-time PIN**（メールにコードが届く。相手に Cloudflare アカウントが要らない）を追加しておく。ないと、staging を開いたときに `There are no login methods available for this account` と出る。アカウントごとに1回だけ。手順4で Worker を作ったあと、**Zero Trust → Access controls → Applications** の該当アプリ → **Authentication** で、この ID プロバイダーが受け入れられている（「すべてを受け入れる」か個別にチェック）ことも確認する。

### 2. リソースを作る

コンテナ内の `apps/admin` で実行する。

```bash
npx wrangler login

npx wrangler d1 create <project>-staging
npx wrangler d1 create <project>-production

# ファイルアップロード（media）を残した場合だけ
npx wrangler r2 bucket create <project>-staging
npx wrangler r2 bucket create <project>-production

# admin のログインのロックアウトのカウンタ
npx wrangler kv namespace create <project>-kv-staging
npx wrangler kv namespace create <project>-kv-production
```

wrangler が「設定ファイルに追記するか」と聞いてきたら **No**。Yes にすると、追記先が先頭の設定になるうえ、`binding` がリソース名（`<project>_staging` のような形）で書かれる。コードが読むのは `DB` / `BUCKET` / `KV` なので、そのままだとデプロイ後に DB に届かない。手順3で手で入れる。

### 3. `wrangler.jsonc` に反映する

- 両アプリの `env.staging` と `env.production` にある `replace-with-*` を、手順2で出た ID と名前に置き換える。
  - 置き換えるのは `database_name` / `database_id` / `bucket_name` / `id` だけ。**`binding` は `DB` / `BUCKET` / `KV` のまま**。
  - D1 と R2 は **public と admin で同じ値** にする。
  - KV は admin だけ。
- **先頭の設定（ローカル開発用）はプレースホルダのまま残す。** `CLOUDFLARE_ENV` を付け忘れたデプロイが、存在しない DB を指して失敗し、そこで止まるようにするため。
- 独自ドメインを使う場合は、それぞれの `production` に次の2つをセットで追加する。`workers_dev: false` がないと、本番が `*.workers.dev` でも公開されたままになる。

  ```jsonc
  // apps/public
  "routes": [{ "pattern": "<domain>", "custom_domain": true }],
  "workers_dev": false,
  // apps/admin
  "routes": [{ "pattern": "admin.<domain>", "custom_domain": true }],
  "workers_dev": false,
  ```

- `apps/public/astro.config.mjs` に `site` を設定している場合は、`https://<domain>` になっているか確認する（canonical と sitemap に使われる）。
- コミットして `dev` に push し、`dev` を `main` にマージする（`main` がなければ `dev` から作る）。

### 4. Workers Builds で GitHub と連携する（Worker ごとに1回、計4回）

まず staging の2つを作る。production の2つは、staging で手順7までが通ってから作る。**独自ドメインで今別のサイトが動いている場合、production の Worker の初回デプロイがそのまま新サイトへの切り替えになる**（DNS が Worker に向く）ので、切り替え日まで作らない。切り替えの手順は「公開後の運用」にある。

ダッシュボードで **Workers & Pages → 作成（Create）→ リポジトリをインポート（Import a repository）** を選び、`<org>/<repo>` を選ぶ（初回だけ Cloudflare の GitHub App のインストールを求められる）。

作成画面に入れる値（項目名は画面のとおり）:

| 項目 | staging の Worker | production の Worker |
| --- | --- | --- |
| プロジェクト名 | 上の表の Worker 名を正確に（例: `<project>-public-staging`） | 同じ（例: `<project>-public-production`） |
| ビルドコマンド | `pnpm run build` | 同じ |
| デプロイコマンド | `pnpm run deploy` | 同じ |
| プレビューコマンド | 既定のまま（使わない） | 同じ |
| プレビュービルドを有効化 | OFF | OFF |
| Protect with Cloudflare Access | **ON** | OFF |
| 詳細設定 › パス | `apps/public` または `apps/admin` | 同じ |
| 詳細設定 › API トークン | 「新しいトークンを作成」（Cloudflare が自動で作る） | 同じ |
| 詳細設定 › 変数 | `CLOUDFLARE_ENV` = `staging` | `CLOUDFLARE_ENV` = `production` |

プロジェクト名は、wrangler の設定から決まる名前（`<wrangler の name>-<env>`）と一致していないと、Workers Builds が止める。

作成後に **設定 → ビルド** で確認・追加するもの（作成画面にはない）:

| 項目 | public-* | admin-* |
| --- | --- | --- |
| ブランチコントロール（Production branch） | staging は `dev`、production は `main` | 同じ |
| ビルド監視パス（Build watch paths） | `apps/public/**`, `packages/**`, `pnpm-lock.yaml` | `apps/admin/**`, `packages/**`, `pnpm-lock.yaml` |

4つの Worker で違うのは、パス・ビルド監視パス・`CLOUDFLARE_ENV`・本番ブランチ・Access の有無だけ。デプロイの中身は `package.json` にあるので、ダッシュボードにコマンドを書き足さない。

API トークンを自分で作る場合は、Account の **Workers Scripts › Edit**・**D1 › Edit**・**Workers KV Storage › Edit** と、独自ドメインを使う production では Zone の **Workers Routes › Edit** が要る。自動で作らせたほうが漏れがない。

- `apps/public` の `deploy`: `wrangler deploy`
- `apps/admin` の `deploy`: `wrangler d1 migrations apply DB --remote` → `wrangler deploy`
- どちらも、`CLOUDFLARE_ENV` がないとその場で止まる

### 5. 初回ビルドのログで確認すること

保存すると初回のビルドが走る。止まった場合は、`dev` / `main` に空のコミットを push して、もう一度動かす。

| 確認すること | ダメだったとき |
| --- | --- |
| `Detected the following tools from environment:` に `pnpm@<packageManager のバージョン>` と `nodejs@24.x` が出ている（`package.json` の `packageManager` から自動で選ばれる） | 違っていたら、ビルド変数（Build variables）に `PNPM_VERSION` / `NODE_VERSION` を追加する |
| ビルドされたコミットが、意図したブランチの最新になっている | `Missing script: deploy` や `Enabling sessions with Cloudflare KV` が出たら、`deploy` スクリプトと `session: false` がまだそのブランチに入っていない。マージしてから再実行する |
| admin で `migrations apply` が確認のプロンプトで止まらずに通っている（Workers Builds は `CI=true` を渡すので、wrangler は確認なしで進む） | 止まっていたら、ログを添えて調べる |
| admin のマイグレーションが権限エラーになっていない | Worker の 設定 → ビルド → API トークン に **Account › D1 › Edit** を足す |
| 独自ドメインの設定が権限エラーになっていない | 同じトークンに **Zone › Workers Routes › Edit**（対象のゾーン）を足す |

### 6. staging が Cloudflare Access で守られているか確認する

staging は `*.workers.dev` で公開されるので、Access がないと誰でも admin を開けるうえ、public は検索エンジンに載る可能性がある。手順4で ON にしていれば済んでいる。

staging の URL（Worker の概要か **設定 → ドメインとルート** に出ている `https://<Worker 名>.<アカウント>.workers.dev`）をシークレットウィンドウで開き、メールアドレスの入力欄だけの画面（Cloudflare Access のログイン画面）が出ることを確認する。許可したアドレスを入れると、`noreply@notify.cloudflare.com` からコードが届く。

出ない場合は、その Worker の **設定 → ドメインとルート**（Settings → Domains & Routes）で、`workers.dev` と **プレビュー URL** の両方の **Cloudflare Access を有効化** を押す。許可するメールアドレスは **Cloudflare Access を管理（Manage Cloudflare Access）** で変えられる。Zero Trust は50ユーザーまで無料。

admin の staging は、Access を通ったあとにアプリ自身のログイン画面が出る。2段階になるのは意図どおり。

### 7. 管理者アカウントを作る

コンテナ内で実行する。

```bash
pnpm --filter admin seed -- --table=admin_users --email=… --password=… --name=… --remote --env=staging
pnpm --filter admin seed -- --table=admin_users --email=… --password=… --name=… --remote --env=production
```

値は `--key=value` の形で渡す（スペースで区切ると、値として拾われない）。

### 8. シークレット

実行時に必要な機密の値は、Worker ごと・環境ごとに登録する。

```bash
cd apps/<app>
npx wrangler secret put <KEY> --env <env> --config wrangler.jsonc
```

秘密ではない設定は、`wrangler.jsonc` の `vars` に書く。`vars` は環境ごとに引き継がれないので、`env.staging` と `env.production` のそれぞれに書く。

---

## 公開後の運用

- ビルドの結果は、GitHub の PR やコミットのチェックとして Worker ごとに表示される。
- **既存サイトからの切り替え**（独自ドメインで別のサイトが動いていた場合）: ① Cloudflare の DNS で、`<domain>` と `admin.<domain>` を旧サーバーに向けているレコード（A / CNAME）を消す。残っていると `custom_domain` の作成が「レコードが既にある」で失敗する。② production の Worker 2つを手順4のとおり作る。初回デプロイで DNS と証明書が作られる。①から②の完了までの数分はサイトが見えない。③ `www.<domain>` を使っていたなら、`<domain>` へのリダイレクト（Redirect Rules）を足す。`routes` には `www` が入っていない。
- **切り戻し**: コードはダッシュボードの **Deployments** から前のバージョンに戻せる（`apps/<app>` で `npx wrangler rollback --env <env> --config wrangler.jsonc` でも可）。**D1 は元に戻せない（forward-only）** ので、直すときは修正用の新しいマイグレーションを書く。データそのものを失ったときは D1 Time Travel（`npx wrangler d1 time-travel restore <project>-<env> --timestamp=…`）で戻す。
- **手元から staging・production の DB にマイグレーションを当てる**（通常は不要。Workers Builds がやる）:
  ```bash
  CLOUDFLARE_ENV=staging pnpm --filter admin db:migrate:remote
  ```

## トラブルシューティング

| 症状 | 原因と対処 |
| --- | --- |
| `You have specified the environment "…" … does not match the target environment` | ビルドした環境と、wrangler に渡した環境が違う。デプロイなら `CLOUDFLARE_ENV=<env>` を付けてビルドし直す。手で打ったコマンドなら `--config wrangler.jsonc` を付ける |
| `npx wrangler login` がブラウザから戻ってこない | ログインはブラウザから `localhost:8976` に戻る必要があるが、コンテナはこのポートを公開していない。ダッシュボードで API トークン（Account の Workers Scripts・D1・Workers R2 Storage・Workers KV Storage を Edit）を作り、`export CLOUDFLARE_API_TOKEN=…` してからコマンドを打つ |
| `set CLOUDFLARE_ENV=staging or production` で止まる | Workers Builds のビルド変数に `CLOUDFLARE_ENV` が入っていない |
| Access のログイン画面で「コードを送った」と出るのにメールが届かない | Access は、許可されていないアドレスにも「送った」と表示する（仕様）。ポリシーのアドレスが入力と完全に一致しているか、Action が Allow か、アプリの Authentication で ID プロバイダーが受け入れられているかを見る。迷惑メールも確認。コードは10分で失効するので、直したら「新しいコードを要求」からやり直す |
| デプロイ後、DB に届かない（テーブルがない・バインディングがない） | `binding` が `DB` / `BUCKET` / `KV` 以外になっている。wrangler の「設定ファイルに追記」を使うとそうなる（手順2） |
| ビルド中の WARNING `Processing dist/server/.prerender/wrangler.json … No environment found in configuration with name "<env>"` | 無視してよい。プリレンダー用の補助設定には環境がないだけで、本体の設定は正しく環境を選んでいる。手元のビルドでも同じ警告が出る |
| デプロイは成功したのに、新しいカラムがないと言われて落ちる | マイグレーションが未適用。admin のデプロイが失敗していないか、public が先に出ていないか確認する |
| Worker 名が一致しないと言われる | ダッシュボードの Worker 名が `<wrangler の name>-<env>` になっていない |
| 本番が `*.workers.dev` でも開ける | `production` に `"workers_dev": false` が入っていない |
