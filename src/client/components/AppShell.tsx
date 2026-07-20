import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { SessionResponse } from "../../shared/api-contract";
import { useRuaLensApi } from "../api/use-api";
import {
  persistDisplayTimeZone,
  readDisplayTimeZone,
  type DisplayTimeZone,
} from "../date-time";
import {
  applyDocumentTheme,
  DARK_COLOR_SCHEME_QUERY,
  persistThemePreference,
  readThemePreference,
  resolveThemePreference,
  systemPrefersDark,
  type ThemePreference,
} from "../theme";
import type { AppShellContext } from "./app-shell-context";
import { ErrorNotice } from "./ErrorNotice";
import { UploadDialog } from "./UploadDialog";

export function AppShell() {
  const api = useRuaLensApi();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [displayTimeZone, setDisplayTimeZoneState] = useState(readDisplayTimeZone);
  const [themePreference, setThemePreferenceState] = useState(readThemePreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const uploadTrigger = useRef<HTMLElement | null>(null);
  const resolvedTheme = resolveThemePreference(themePreference, systemDark);

  useEffect(() => {
    const controller = new AbortController();
    api.getSession(controller.signal).then(setSession).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason);
      }
    });
    return () => controller.abort();
  }, [api, attempt]);

  useEffect(() => {
    applyDocumentTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (themePreference !== "system" || typeof globalThis.matchMedia !== "function") {
      return;
    }
    const mediaQuery = globalThis.matchMedia(DARK_COLOR_SCHEME_QUERY);
    const handleChange = () => setSystemDark(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [themePreference]);

  const notifyDataChanged = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);
  const openUpload = useCallback(() => {
    uploadTrigger.current = document.activeElement as HTMLElement | null;
    setUploadOpen(true);
  }, []);
  const setDisplayTimeZone = useCallback((timeZone: DisplayTimeZone) => {
    setDisplayTimeZoneState(timeZone);
    persistDisplayTimeZone(timeZone);
  }, []);
  const setThemePreference = useCallback((preference: ThemePreference) => {
    const prefersDark = systemPrefersDark();
    setSystemDark(prefersDark);
    setThemePreferenceState(preference);
    persistThemePreference(preference);
    applyDocumentTheme(resolveThemePreference(preference, prefersDark));
  }, []);

  if (error) {
    return (
      <div className="app-shell app-shell--centered">
        <ErrorNotice
          error={error}
          onRetry={() => {
            setError(null);
            setAttempt((value) => value + 1);
          }}
        />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-shell app-shell--centered" aria-busy="true">
        <p className="loading-state">セッションを確認しています…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">本文へ移動</a>
      <header className="app-header">
        <div className="header-identity">
          <div className="brand-block">
            <h1>RUA Lens</h1>
          </div>
          <nav className="primary-nav" aria-label="メインナビゲーション">
            <NavLink to="/" end>ダッシュボード</NavLink>
            <NavLink to="/reports">レポート</NavLink>
          </nav>
        </div>
        <div className="header-actions">
          <span className="user-email">{session.email}</span>
          <div className="time-zone-preference">
            <fieldset className="preference-control time-zone-control">
              <legend>時刻表示</legend>
              <label>
                <input
                  type="radio"
                  name="display-time-zone"
                  value="UTC"
                  checked={displayTimeZone === "UTC"}
                  onChange={() => setDisplayTimeZone("UTC")}
                />
                <span>UTC</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="display-time-zone"
                  value="Asia/Tokyo"
                  checked={displayTimeZone === "Asia/Tokyo"}
                  onChange={() => setDisplayTimeZone("Asia/Tokyo")}
                />
                <span>JST</span>
              </label>
            </fieldset>
            <small>
              表示: <span className="preference-value">{displayTimeZone === "UTC" ? "UTC" : "JST"}</span> / 検索・日別集計: UTC
            </small>
          </div>
          <div className="theme-preference">
            <fieldset className="preference-control theme-control">
              <legend>表示テーマ</legend>
              <label>
                <input
                  type="radio"
                  name="theme-preference"
                  value="system"
                  checked={themePreference === "system"}
                  onChange={() => setThemePreference("system")}
                />
                <span>自動</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="theme-preference"
                  value="light"
                  checked={themePreference === "light"}
                  onChange={() => setThemePreference("light")}
                />
                <span>ライト</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="theme-preference"
                  value="dark"
                  checked={themePreference === "dark"}
                  onChange={() => setThemePreference("dark")}
                />
                <span>ダーク</span>
              </label>
            </fieldset>
            <small aria-live="polite">現在: {resolvedTheme === "dark" ? "ダーク" : "ライト"}</small>
          </div>
          <button className="primary-button" type="button" onClick={openUpload}>
            アップロード
          </button>
        </div>
      </header>
      <main id="main-content" className="app-content">
        <Outlet
          context={{
            session,
            displayTimeZone,
            setDisplayTimeZone,
            openUpload,
            refreshVersion,
            notifyDataChanged,
          } satisfies AppShellContext}
        />
      </main>
      <UploadDialog
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          uploadTrigger.current?.focus();
        }}
        onUploaded={notifyDataChanged}
      />
    </div>
  );
}
