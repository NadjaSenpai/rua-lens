import { Hono } from "hono";
import type { ServerEnv } from "../env";

export const sessionRoutes = new Hono<ServerEnv>().get("/", (context) => {
  const principal = context.get("principal");
  return context.json({
    email: principal.email,
    isAdmin: principal.isAdmin,
    storageMode: context.get("storageMode"),
  });
});
