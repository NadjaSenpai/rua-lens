import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { SessionResponse } from "../../shared/api-contract";
import { useRuaLensApi } from "../api/use-api";
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
  const uploadTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.getSession(controller.signal).then(setSession).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason);
      }
    });
    return () => controller.abort();
  }, [api, attempt]);

  const notifyDataChanged = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);
  const openUpload = useCallback(() => {
    uploadTrigger.current = document.activeElement as HTMLElement | null;
    setUploadOpen(true);
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
          <button className="primary-button" type="button" onClick={openUpload}>
            レポートをアップロード
          </button>
        </div>
      </header>
      <main id="main-content" className="app-content">
        <Outlet context={{ session, openUpload, refreshVersion, notifyDataChanged } satisfies AppShellContext} />
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
