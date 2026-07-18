import type { ReactNode } from "react";
import { ApiContext } from "./api-context";
import type { RuaLensApi } from "./types";

export function ApiProvider({ api, children }: { api: RuaLensApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}
