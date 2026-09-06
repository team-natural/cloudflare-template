import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(d1: D1Database): DbClient {
  return drizzle(d1, { schema });
}
