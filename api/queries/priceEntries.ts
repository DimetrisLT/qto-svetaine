import { desc, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

export async function findPriceEntriesByUser(userId: number) {
  return getDb()
    .select({
      name: schema.priceEntries.name,
      unit: schema.priceEntries.unit,
      price: schema.priceEntries.price,
      note: schema.priceEntries.note,
      updatedAt: schema.priceEntries.updatedAt,
    })
    .from(schema.priceEntries)
    .where(eq(schema.priceEntries.userId, userId))
    .orderBy(desc(schema.priceEntries.updatedAt));
}

/** Pilnai pakeičia vartotojo biblioteką (klientas siunčia sulietą sąrašą) */
export async function replacePriceEntries(
  userId: number,
  entries: { name: string; unit: string; price: number; note?: string }[],
) {
  const db = getDb();
  await db.delete(schema.priceEntries).where(eq(schema.priceEntries.userId, userId));
  if (entries.length === 0) return;
  await db.insert(schema.priceEntries).values(
    entries.map((e) => ({
      userId,
      name: e.name.slice(0, 500),
      unit: e.unit.slice(0, 32),
      price: e.price,
      note: e.note ?? null,
    })),
  );
}
