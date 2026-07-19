import { and, desc, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertProject } from "@db/schema";
import { getDb } from "./connection";

export async function findProjectsByUser(userId: number) {
  return getDb()
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      itemCount: schema.projects.itemCount,
      createdAt: schema.projects.createdAt,
      updatedAt: schema.projects.updatedAt,
    })
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.updatedAt));
}

export async function findProjectById(id: number, userId: number) {
  const rows = await getDb()
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
    .limit(1);
  return rows.at(0);
}

export async function createProject(data: InsertProject) {
  const [result] = await getDb().insert(schema.projects).values(data);
  return result.insertId;
}

export async function updateProject(
  id: number,
  userId: number,
  data: Partial<Pick<InsertProject, "name" | "data" | "itemCount">>,
) {
  await getDb()
    .update(schema.projects)
    .set(data)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)));
}

export async function deleteProject(id: number, userId: number) {
  await getDb()
    .delete(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)));
}

export async function deleteProjectsByUser(userId: number) {
  await getDb().delete(schema.projects).where(eq(schema.projects.userId, userId));
}
