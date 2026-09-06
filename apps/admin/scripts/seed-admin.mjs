// D1 isn't reachable in-process outside the Workers runtime, so this shells out to
// `wrangler d1 execute`. Run via tsx, not node — that's what lets it import the real
// hashPassword/ulid instead of duplicating them.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { hashPassword } from "@app/server-kit/auth";
import { ulid } from "@app/schema/ulid";

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-z]+)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}

// `--password S3cret!` (space instead of `=`) stores `true` here, which passes the usage
// guard and silently seeds an admin whose password is the literal "true". Demand `--flag=value`
// for anything carrying a value; valueless flags like --remote stay boolean.
function requireValue(args, key) {
  const value = args[key];
  if (typeof value !== "string" || value === "") {
    console.error(`--${key} needs a value in --${key}=<value> form (a space-separated value is not picked up).`);
    process.exit(1);
  }
  return value;
}

const sqlQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const role = args.role ?? "admin";

  if (!args.email || !args.password || !args.name || !["admin", "editor"].includes(role)) {
    console.error("Usage: pnpm seed:admin -- --email=<email> --password=<password> --name=<name> [--role=admin|editor] [--db=<binding or database_name>] [--remote] [--env=<wrangler env>]");
    process.exit(1);
  }

  const email = requireValue(args, "email");
  const password = requireValue(args, "password");
  const name = requireValue(args, "name");

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const sql = `INSERT INTO admin_users (public_id, name, email, password_hash, role, status, created_at, updated_at) ` + `VALUES (${sqlQuote(ulid())}, ${sqlQuote(name)}, ${sqlQuote(email)}, ${sqlQuote(passwordHash)}, ${sqlQuote(role)}, 'active', ${sqlQuote(now)}, ${sqlQuote(now)});`;

  // Binding name, not database_name: it's valid before a project replaces the placeholders.
  const db = typeof args.db === "string" && args.db !== "" ? args.db : "DB";
  const wranglerArgs = ["wrangler", "d1", "execute", db, args.remote ? "--remote" : "--local", "--command", sql];
  // Matches astro.config.mjs's persistState path — apps/admin and apps/public share local D1/R2/KV.
  if (!args.remote) wranglerArgs.push("--persist-to", "../../.wrangler-state");
  if (args.env) wranglerArgs.splice(4, 0, "--env", args.env);

  const result = spawnSync("npx", wranglerArgs, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`Seeded ${role} user ${email} into ${db} (${args.remote ? "remote" : "local"}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
