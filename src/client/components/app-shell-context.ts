import { useOutletContext } from "react-router-dom";
import type { SessionResponse } from "../../shared/api-contract";

export type AppShellContext = {
  session: SessionResponse;
  openUpload: () => void;
  refreshVersion: number;
  notifyDataChanged: () => void;
};

export function useAppShell(): AppShellContext {
  return useOutletContext<AppShellContext>();
}
