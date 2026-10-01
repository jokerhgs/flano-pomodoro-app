import Database from "@tauri-apps/plugin-sql";
import { CompiledQuery, Kysely } from "kysely";
import { TauriSqliteDialect } from "kysely-dialect-tauri";
import type { Database as FlanoDB } from "./schema";

let kysely: Kysely<FlanoDB> | null = null;
let ready: Promise<Kysely<FlanoDB>> | null = null;

export function getDb(): Promise<Kysely<FlanoDB>> {
  if (kysely) return Promise.resolve(kysely);
  if (ready) return ready;
  ready = (async () => {
    const db = new Kysely<FlanoDB>({
      dialect: new TauriSqliteDialect({
        database: () => Database.load("sqlite:app.db"),
        isQuery: (query) => /^\s*(select|with|pragma)\b/i.test(query),
        onCreateConnection: async (conn) => {
          // Must be a real CompiledQuery (includes the AST node): the dialect
          // classifies queries via SelectQueryNode.is(query), which throws on
          // a hand-made {sql, parameters} object with no `query` field.
          await conn.executeQuery(CompiledQuery.raw("PRAGMA foreign_keys = ON"));
        },
      }),
    });
    kysely = db;
    return db;
  })();
  return ready;
}
