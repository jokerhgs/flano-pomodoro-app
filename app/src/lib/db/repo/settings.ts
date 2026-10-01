import { getDb } from "../client";

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.selectFrom("settings").selectAll().execute();
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db
    .insertInto("settings")
    .values({ key, value })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value }))
    .execute();
}