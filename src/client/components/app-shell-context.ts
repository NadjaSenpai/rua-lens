import { useOutletContext } from "react-router-dom";
import type { SessionResponse } from "../../shared/api-contract";
import type { DisplayTimeZone } from "../date-time";

export type AppShellContext = {
  session: SessionResponse;
  displayTimeZone: DisplayTimeZone;
  setDisplayTimeZone: (timeZone: DisplayTimeZone) => void;
  openUpload: () => void;
  refreshVersion: number;
  notifyDataChanged: () => void;
};

export function useAppShell(): AppShellContext {
  return useOutletContext<AppShellContext>();
}
