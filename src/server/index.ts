import { createApp } from "./app";
import type { RuntimeEnv } from "./env";

const app = createApp();

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<RuntimeEnv>;
