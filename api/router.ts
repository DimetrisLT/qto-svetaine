import { authRouter } from "./auth-router";
import { projectsRouter } from "./projects-router";
import { sharesRouter } from "./shares-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  projects: projectsRouter,
  shares: sharesRouter,
});

export type AppRouter = typeof appRouter;
