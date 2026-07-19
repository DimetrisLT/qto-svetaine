import { and, desc, eq, notInArray } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertProjectVersion } from "@db/schema";
import { getDb } from "./connection";

const KEEP_VERSIONS = 20;

/** Versijų sąrašas projektui (be duomenų – tik metaduomenys) */
export async function findVersionsByProject(projectId: number, userId: number) {
  return getDb()
    .select({
      id: schema.projectVersions.id,
      itemCount: schema.projectVersions.itemCount,
      createdAt: schema.projectVersions.createdAt,
    })
    .from(schema.projectVersions)
    .where(
      and(
        eq(schema.projectVersions.projectId, projectId),
        eq(schema.projectVersions.userId, userId),
      ),
    )
    .orderBy(desc(schema.projectVersions.createdAt));
}

export async function findVersionById(id: number, userId: number) {
  const rows = await getDb()
    .select()
    .from(schema.projectVersions)
    .where(
      and(
        eq(schema.projectVersions.id, id),
        eq(schema.projectVersions.userId, userId),
      ),
    )
    .limit(1);
  return rows.at(0);
}

/** Įrašo versiją ir pašalina senas (paliekama paskutinių KEEP_VERSIONS) */
export async function createVersion(data: InsertProjectVersion) {
  const [result] = await getDb().insert(schema.projectVersions).values(data);
  const all = await getDb()
    .select({ id: schema.projectVersions.id })
    .from(schema.projectVersions)
    .where(eq(schema.projectVersions.projectId, data.projectId))
    .orderBy(desc(schema.projectVersions.createdAt));
  if (all.length > KEEP_VERSIONS) {
    const keep = all.slice(0, KEEP_VERSIONS).map((r) => r.id);
    await getDb()
      .delete(schema.projectVersions)
      .where(
        and(
          eq(schema.projectVersions.projectId, data.projectId),
          notInArray(schema.projectVersions.id, keep),
        ),
      );
  }
  return result.insertId;
}

export async function deleteVersionsByProject(projectId: number, userId: number) {
  await getDb()
    .delete(schema.projectVersions)
    .where(
      and(
        eq(schema.projectVersions.projectId, projectId),
        eq(schema.projectVersions.userId, userId),
      ),
    );
}

export async function deleteVersionsByUser(userId: number) {
  await getDb()
    .delete(schema.projectVersions)
    .where(eq(schema.projectVersions.userId, userId));
}
