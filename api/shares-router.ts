import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { findProjectById } from "./queries/projects";
import {
  createShare,
  deleteShareByProject,
  findPublicProjectByToken,
  findShareByProject,
} from "./queries/shares";

export const sharesRouter = createRouter({
  /** Sukuria (arba grąžina esamą) viešą peržiūros nuorodą projektui */
  create: authedQuery
    .input(z.object({ projectId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const p = await findProjectById(input.projectId, ctx.user.id);
      if (!p) throw new Error("Projektas nerastas");
      const existing = await findShareByProject(input.projectId, ctx.user.id);
      if (existing) return { token: existing.token };
      const token = randomBytes(24).toString("hex");
      await createShare(input.projectId, ctx.user.id, token);
      return { token };
    }),

  /** Atšaukia viešą nuorodą */
  revoke: authedQuery
    .input(z.object({ projectId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteShareByProject(input.projectId, ctx.user.id);
      return { ok: true };
    }),

  /** Esama nuoroda projektui (jei yra) */
  get: authedQuery
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const s = await findShareByProject(input.projectId, ctx.user.id);
      return s ? { token: s.token } : null;
    }),

  /** VIEŠAS endpoint'as: peržiūra be prisijungimo pagal token */
  getPublic: publicQuery
    .input(z.object({ token: z.string().length(48) }))
    .query(async ({ input }) => {
      const p = await findPublicProjectByToken(input.token);
      if (!p) throw new Error("Nuoroda negalioja arba atšaukta");
      return p;
    }),
});
