import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery } from "./middleware";
import { deleteUser } from "./queries/users";
import { deleteProjectsByUser } from "./queries/projects";
import { deleteSharesByUser } from "./queries/shares";
import { deleteVersionsByUser } from "./queries/versions";

function clearSessionCookie(ctx: { resHeaders: Headers; req: Request }) {
  const opts = getSessionCookieOptions(ctx.req.headers);
  ctx.resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, "", {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: 0,
    }),
  );
}

export const authRouter = createRouter({
  me: authedQuery.query((opts) => opts.ctx.user),
  logout: authedQuery.mutation(async ({ ctx }) => {
    clearSessionCookie(ctx);
    return { success: true };
  }),
  // BDAR „teisė būti pamirštam“: ištrina visus vartotojo projektus ir paskyrą
  deleteMe: authedQuery.mutation(async ({ ctx }) => {
    await deleteSharesByUser(ctx.user.id);
    await deleteVersionsByUser(ctx.user.id);
    await deleteProjectsByUser(ctx.user.id);
    await deleteUser(ctx.user.id);
    clearSessionCookie(ctx);
    console.info(`[auth] Paskyra ištrinta: userId=${ctx.user.id}`);
    return { success: true };
  }),
});
