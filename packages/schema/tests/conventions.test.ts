// Schema conventions, enforced rather than described. The schema-build skill states these, but
// a skill only binds whoever invokes it — this binds the file. Every rule below holds for the
// tables that ship today, so a failure means something new broke the convention.
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import * as schema from "../src/schema";

const tables = Object.values(schema)
  .filter((value): value is SQLiteTable => {
    try {
      getTableConfig(value as SQLiteTable);
      return true;
    } catch {
      return false;
    }
  })
  .map((table) => getTableConfig(table));

type Table = (typeof tables)[number];

const each = (assert: (table: Table) => void) => () => tables.forEach(assert);
const columnNames = (table: Table) => table.columns.map((column) => column.name);

it("finds the tables", () => {
  // Guards the filter above: if it stopped matching, every other test here would pass vacuously.
  // Asserted against a table rather than a count, which changes with the project.
  expect(tables.map((table) => table.name)).toContain("admin_users");
});

describe("keys", () => {
  it(
    "gives every table an autoincrementing `id`, or a composite primary key",
    each((table) => {
      const id = table.columns.find((column) => column.name === "id");
      if (id) expect(id.autoIncrement, table.name).toBe(true);
      else expect(table.primaryKeys.length, table.name).toBe(1);
    }),
  );

  it(
    "keeps the external key unique wherever one exists",
    each((table) => {
      if (!columnNames(table).includes("public_id")) return;
      const unique = table.indexes.find((index) => index.config.unique && index.config.columns.some((column) => (column as { name: string }).name === "public_id"));
      expect(unique, `${table.name}.public_id needs a unique index`).toBeDefined();
    }),
  );
});

describe("indexes", () => {
  it(
    "names them `idx_<table>_…` / `uq_<table>_…`, which is what makes the generated SQL readable",
    each((table) => {
      for (const index of table.indexes) {
        expect(index.config.name, table.name).toMatch(new RegExp(`^${index.config.unique ? "uq" : "idx"}_${table.name}_`));
      }
    }),
  );

  it(
    "covers every foreign key",
    each((table) => {
      const covered = new Set([...table.indexes.flatMap((index) => index.config.columns.map((column) => (column as { name: string }).name)), ...table.primaryKeys.flatMap((key) => key.columns.map((column) => column.name))]);
      for (const fk of table.foreignKeys) {
        // An unindexed FK turns joins and cascading reads into table scans.
        for (const column of fk.reference().columns) {
          expect(covered, `${table.name}.${column.name}`).toContain(column.name);
        }
      }
    }),
  );
});

describe("columns", () => {
  it(
    "stores every timestamp as ISO 8601 text",
    each((table) => {
      for (const column of table.columns) {
        if (!column.name.endsWith("_at")) continue;
        expect(column.columnType, `${table.name}.${column.name}`).toBe("SQLiteText");
      }
    }),
  );

  it(
    "defaults created_at in the database",
    each((table) => {
      const createdAt = table.columns.find((column) => column.name === "created_at");
      if (!createdAt) return;
      expect(createdAt.hasDefault, table.name).toBe(true);
      expect(createdAt.notNull, table.name).toBe(true);
    }),
  );

  it(
    "pairs updated_at with created_at",
    each((table) => {
      if (!columnNames(table).includes("updated_at")) return;
      expect(columnNames(table), table.name).toContain("created_at");
    }),
  );

  it(
    "has no soft deletes and no tenant scope",
    each((table) => {
      // Deactivation is a `status` column; the single-operator premise rules out tenant scoping.
      for (const name of ["deleted_at", "organization_id", "tenant_id"]) {
        expect(columnNames(table), table.name).not.toContain(name);
      }
    }),
  );
});
