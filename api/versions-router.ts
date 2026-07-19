import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { findProjectById, updateProject } from "./queries/projects";
import { createVersion, findVersionById, findVersionsByProject } from "./queries/versions";

export const versionsRouter = createRouter({
  /** Versijų sąrašas projektui (naujausios pirmos, be duomenų) */
  list: authedQuery
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const p = await findProjectById(input.projectId, ctx.user.id);
      if (!p) throw new Error("Projektas nerastas");
      return findVersionsByProject(input.projectId, ctx.user.id);
    }),

  /** Atkuria pasirinktą versiją kaip dabartinę projekto būseną (dabartinė irgi išsaugoma istorijoje) */
  restore: authedQuery
    .input(z.object({ versionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const v = await findVersionById(input.versionId, ctx.user.id);
      if (!v) throw new Error("Versija nerasta");
      const p = await findProjectById(v.projectId, ctx.user.id);
      if (!p) throw new Error("Projektas nerastas");
      await updateProject(v.projectId, ctx.user.id, {
        data: v.data,
        itemCount: v.itemCount,
      });
      // Atkūrimas irgi yra įrašymas – fiksuojame istorijoje
      await createVersion({
        projectId: v.projectId,
        userId: ctx.user.id,
        itemCount: v.itemCount,
        data: v.data,
      });
      return { ok: true };
    }),
});
