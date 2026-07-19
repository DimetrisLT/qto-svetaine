import { authRouter } from "./auth-router";
import { projectsRouter } from "./projects-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  projects: projectsRouter,
});

export type AppRouter = typeof appRouter;
