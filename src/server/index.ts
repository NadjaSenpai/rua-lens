import { createApp } from "./app";
import type { RuntimeEnv } from "./env";
import { handleEmail } from "./email/handle-email";

const app = createApp();

export default {
  fetch: app.fetch,
  email: handleEmail,
} satisfies ExportedHandler<RuntimeEnv>;
