import { useEffect, useRef, useState } from "react";
import type { StorageMode } from "../../shared/api-contract";
import { exportAll, importAll, openLocalDb, type ExportBundle } from "../storage/local-db";

export function AboutDialog({
  open,
  onClose,
  storageMode,
  onDataChanged,
}: {
  open: boolean;
  onClose: () => void;
  storageMode?: StorageMode;
  onDataChanged?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setImportResult(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleExport = async () => {
    const db = await openLocalDb();
    const bundle = await exportAll(db);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rua-lens-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as ExportBundle;
      if (bundle.version !== 1 || !Array.isArray(bundle.reports)) {
        setImportResult("形式が不正です。RUA Lens のエクスポートファイルを選択してください。");
        return;
      }
      const db = await openLocalDb();
      const { imported, skipped } = await importAll(db, bundle);
      setImportResult(`${imported}件インポート、${skipped}件スキップ（登録済み）`);
      if (imported > 0) onDataChanged?.();
    } catch {
      setImportResult("ファイルの読み込みに失敗しました。");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="about-dialog"
      aria-labelledby="about-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="about-dialog-title">About RUA Lens</h2>

      <div className="about-notes">
        <p className="about-note about-note--info">
          DMARCの集約レポート(RUA)をWorker内で解析し、認証結果を可視化するダッシュボードです。
        </p>

        <p className="about-note about-note--safe">
          アップロードされたXML/gzip/ZIPはWorker内で即時解析され、
          {storageMode === "stateless"
            ? "結果はこのブラウザ内(IndexedDB)にのみ保存されます。サーバーにデータは残りません。"
            : "正規化した結果のみがD1に保存されます。元ファイルは保存されません。"}
        </p>

        <p className="about-note about-note--warn">
          表示される認証結果はレポート提供元の申告値です。内容の正確性はレポート送信者に依存します。
        </p>
      </div>

      <dl className="about-meta">
        <div>
          <dt>Version</dt>
          <dd>0.1.0</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>MIT</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd><a href="https://github.com/NadjaSenpai/rua-lens" target="_blank" rel="noopener noreferrer">GitHub</a></dd>
        </div>
      </dl>

      <p className="about-copyright">Copyright (c) 2026 Nadja</p>

      {storageMode === "stateless" && (
        <div className="about-data-actions">
          <h3>ローカルデータ</h3>
          <p className="about-data-note">
            データはこのブラウザに保存されています。別のブラウザへ移行する場合や、バックアップとしてエクスポートできます。
          </p>
          <div className="about-data-buttons">
            <button className="secondary-button" type="button" onClick={handleExport}>
              エクスポート
            </button>
            <button className="secondary-button" type="button" onClick={() => fileRef.current?.click()}>
              インポート
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="visually-hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = "";
              }}
            />
          </div>
          {importResult && <p className="about-import-result">{importResult}</p>}
        </div>
      )}

      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={onClose}>閉じる</button>
      </div>
    </dialog>
  );
}
