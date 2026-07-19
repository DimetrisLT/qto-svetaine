import { and, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

export async function findShareByProject(projectId: number, userId: number) {
  const rows = await getDb()
    .select()
    .from(schema.shares)
    .where(and(eq(schema.shares.projectId, projectId), eq(schema.shares.userId, userId)))
    .limit(1);
  return rows.at(0);
}

export async function createShare(projectId: number, userId: number, token: string) {
  await getDb().insert(schema.shares).values({ projectId, userId, token });
}

export async function deleteShareByProject(projectId: number, userId: number) {
  await getDb()
    .delete(schema.shares)
    .where(and(eq(schema.shares.projectId, projectId), eq(schema.shares.userId, userId)));
}

export async function deleteSharesByUser(userId: number) {
  await getDb().delete(schema.shares).where(eq(schema.shares.userId, userId));
}

/** Vieša peržiūra: projektas su duomenimis pagal token (be vartotojo duomenų) */
export async function findPublicProjectByToken(token: string) {
  const rows = await getDb()
    .select({
      name: schema.projects.name,
      data: schema.projects.data,
      itemCount: schema.projects.itemCount,
      updatedAt: schema.projects.updatedAt,
    })
    .from(schema.shares)
    .innerJoin(schema.projects, eq(schema.shares.projectId, schema.projects.id))
    .where(eq(schema.shares.token, token))
    .limit(1);
  return rows.at(0);
}
