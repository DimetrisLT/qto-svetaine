import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { findPriceEntriesByUser, replacePriceEntries } from "./queries/priceEntries";

const MAX_ENTRIES = 5000;

const entry = z.object({
  name: z.string().min(1).max(500),
  unit: z.string().min(1).max(32),
  price: z.number().finite().min(0),
  note: z.string().max(2000).optional(),
});

export const priceRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const rows = await findPriceEntriesByUser(ctx.user.id);
    return rows.map((r) => ({
      name: r.name,
      unit: r.unit,
      price: r.price,
      note: r.note ?? undefined,
      updatedAt: r.updatedAt.getTime(),
    }));
  }),

  /** Pilna sinchronizacija: klientas atsiunčia sulietą biblioteką */
  sync: authedQuery
    .input(z.object({ entries: z.array(entry).max(MAX_ENTRIES) }))
    .mutation(async ({ ctx, input }) => {
      await replacePriceEntries(ctx.user.id, input.entries);
      return { ok: true, count: input.entries.length };
    }),
});
