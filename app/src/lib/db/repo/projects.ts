import { getDb } from "../client";
import type { ProjectRow } from "../schema";

function nowIso(): string {
  return new Date().toISOString();
}

export async function listProjects(includeArchived = false): Promise<ProjectRow[]> {
  const db = await getDb();
  let q = db.selectFrom("projects").selectAll().orderBy("name");
  if (!includeArchived) q = q.where("archived", "=", 0) as typeof q;
  return q.execute();
}

export async function createProject(
  name: string,
  color: string | null = null,
  icon: string | null = null,
  description: string | null = null,
  notes: string | null = null,
): Promise<number> {
  const db = await getDb();
  const now = nowIso();
  const res = await db
    .insertInto("projects")
    // id is auto-increment; omit it (cast bypasses Kysely's require-id insert type).
    .values({
      name: name.trim(),
      color,
      icon: icon || null,
      description: description ? description.trim() : null,
      notes: notes ? notes : null,
      archived: 0,
      created_at: now,
      updated_at: now,
    } as never)
    .executeTakeFirst();
  return Number(res.insertId ?? 0);
}

export async function updateProject(
  id: number,
  patch: Partial<Pick<ProjectRow, "name" | "color" | "icon" | "description" | "notes">>,
): Promise<void> {
  const db = await getDb();
  const { name, description, notes, ...rest } = patch;
  await db
    .updateTable("projects")
    .set({
      ...rest,
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description ? description.trim() : null } : {}),
      ...(notes !== undefined ? { notes: notes ? notes : null } : {}),
      updated_at: nowIso(),
    })
    .where("id", "=", id)
    .execute();
}

export async function deleteProject(id: number): Promise<void> {
  const db = await getDb();
  // Tasks keep history: project_id -> NULL via FK.
  await db.deleteFrom("projects").where("id", "=", id).execute();
}
