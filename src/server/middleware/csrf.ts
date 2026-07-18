import { csrf } from "hono/csrf";

export const sameOriginCsrf = csrf();
