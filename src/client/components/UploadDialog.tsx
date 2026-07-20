import { useEffect, useRef, useState } from "react";
import type { UploadBatchResult, UploadResult } from "../../shared/api-contract";
import { UPLOAD_LIMITS } from "../../shared/api-contract";
import { useRuaLensApi } from "../api/use-api";
import { ErrorNotice } from "./ErrorNotice";

export function UploadDialog({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const api = useRuaLensApi();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<UploadBatchResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const validationError = validateFiles(files);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const close = () => {
    if (submitting) {
      return;
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setFiles([]);
    setResult(null);
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (files.length === 0 || validationError || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const nextResult = await api.upload(files);
      setResult(nextResult);
      onUploaded();
    } catch (reason) {
      setError(reason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="upload-dialog"
      aria-labelledby="upload-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dialog-header">
        <div>
          <h2 id="upload-dialog-title">DMARCレポートをアップロード</h2>
        </div>
        <button className="text-button" type="button" onClick={close} disabled={submitting}>
          閉じる
        </button>
      </div>

      <label className="file-picker">
        <span>レポートファイル</span>
        <input
          ref={inputRef}
          type="file"
          aria-label="レポートファイル"
          multiple
          accept=".xml,.gz,.gzip,.zip,application/xml,application/gzip,application/zip"
          onChange={(event) => {
            setFiles(Array.from(event.currentTarget.files ?? []));
            setResult(null);
            setError(null);
          }}
        />
        <small>XML、gzip、ZIP。最大20ファイル、1ファイル10 MiB、合計25 MiBまで。</small>
      </label>

      {files.length > 0 ? (
        <section className="selected-files" aria-label="選択したファイル">
          <p>{files.length}ファイル / {formatBytes(files.reduce((total, file) => total + file.size, 0))}</p>
          <ul>
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span>{file.name}</span>
                <span>{formatBytes(file.size)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {validationError ? <p className="validation-error" role="alert">{validationError}</p> : null}
      {error ? <ErrorNotice error={error} /> : null}
      {result ? <UploadResults result={result} /> : null}

      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={close} disabled={submitting}>
          キャンセル
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={submit}
          disabled={files.length === 0 || Boolean(validationError) || submitting}
        >
          {submitting ? "アップロード中…" : "アップロードを実行"}
        </button>
      </div>
    </dialog>
  );
}

function UploadResults({ result }: { result: UploadBatchResult }) {
  return (
    <section className="upload-results" aria-live="polite">
      <h3>処理結果</h3>
      <p>
        登録 {result.summary.inserted}件・登録済み {result.summary.duplicate}件・失敗 {result.summary.rejected}件
      </p>
      <ul>
        {result.results.map((item, index) => (
          <li key={`${item.sourceFileName}-${item.entryName ?? "source"}-${index}`}>
            <strong>{statusLabel(item)}</strong>
            <span>{item.sourceFileName}{item.entryName ? ` / ${item.entryName}` : ""}</span>
            {item.status === "rejected" ? <small>{item.message}</small> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function statusLabel(result: UploadResult): string {
  if (result.status === "inserted") {
    return "登録";
  }
  if (result.status === "duplicate") {
    return "登録済み";
  }
  return "失敗";
}

function validateFiles(files: readonly File[]): string | null {
  if (files.length > UPLOAD_LIMITS.maxFiles) {
    return "一度に選択できるのは20ファイルまでです。";
  }
  if (files.some((file) => file.size > UPLOAD_LIMITS.maxInputBytesPerFile)) {
    return "1ファイルあたり10 MiBまで選択できます。";
  }
  if (files.reduce((total, file) => total + file.size, 0) > UPLOAD_LIMITS.maxInputBytesBatch) {
    return "ファイルの合計は25 MiBまでです。";
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.ceil(bytes / 1024))} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
