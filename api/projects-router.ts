import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  createProject,
  deleteProject,
  findProjectById,
  findProjectsByUser,
  updateProject,
} from "./queries/projects";

const projectData = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  itemsBySource: z.record(z.string(), z.array(z.unknown())),
  metas: z.record(z.string(), z.unknown()),
});

export const projectsRouter = createRouter({
  list: authedQuery.query(({ ctx }) => findProjectsByUser(ctx.user.id)),

  get: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const p = await findProjectById(input.id, ctx.user.id);
      if (!p) throw new Error("Projektas nerastas");
      return p;
    }),

  create: authedQuery
    .input(z.object({ name: z.string().min(1).max(255), data: projectData, itemCount: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const id = await createProject({
        userId: ctx.user.id,
        name: input.name,
        data: input.data,
        itemCount: input.itemCount,
      });
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(255).optional(),
        data: projectData.optional(),
        itemCount: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateProject(id, ctx.user.id, data);
      return { ok: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteProject(input.id, ctx.user.id);
      return { ok: true };
    }),
});
