import { useContext } from "react";
import { ApiContext } from "./api-context";
import type { RuaLensApi } from "./types";

export function useRuaLensApi(): RuaLensApi {
  const api = useContext(ApiContext);
  if (!api) {
    throw new Error("ApiProvider is required");
  }
  return api;
}
