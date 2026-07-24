import { authRouter } from "./auth-router";
import { projectsRouter } from "./projects-router";
import { sharesRouter } from "./shares-router";
import { versionsRouter } from "./versions-router";
import { priceRouter } from "./price-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  projects: projectsRouter,
  shares: sharesRouter,
  versions: versionsRouter,
  priceLib: priceRouter,
});

export type AppRouter = typeof appRouter;
