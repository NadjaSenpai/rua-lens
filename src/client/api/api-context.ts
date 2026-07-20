import { createContext } from "react";
import type { RuaLensApi } from "./types";

export const ApiContext = createContext<RuaLensApi | null>(null);
