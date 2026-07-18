import { useEffect, useRef, useState } from "react";
import type { ReportDetail } from "../../shared/api-contract";
import { useRuaLensApi } from "../api/use-api";
import { ErrorNotice } from "./ErrorNotice";

export function DeleteReportDialog({
  open,
  report,
  onClose,
  onDeleted,
}: {
  open: boolean;
  report: ReportDetail;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const api = useRuaLensApi();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const close = () => {
    if (!submitting) {
      setError(null);
      onClose();
    }
  };

  const remove = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.deleteReport(report.id);
      onDeleted();
    } catch (reason) {
      setError(reason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="delete-dialog"
      aria-labelledby="delete-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <p className="eyebrow">Administrator action</p>
      <h2 id="delete-dialog-title">レポートを削除</h2>
      <p>削除すると復元できません。関連する送信元IPと認証結果も削除されます。</p>
      <dl className="compact-details">
        <div><dt>提供元</dt><dd>{report.orgName}</dd></div>
        <div><dt>対象ドメイン</dt><dd>{report.domain}</dd></div>
        <div><dt>集計期間</dt><dd>{formatDate(report.periodBegin)} – {formatDate(report.periodEnd)}</dd></div>
      </dl>
      {error ? <ErrorNotice error={error} /> : null}
      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={close} disabled={submitting}>
          キャンセル
        </button>
        <button className="danger-button" type="button" onClick={remove} disabled={submitting}>
          {submitting ? "削除中…" : "レポートを削除"}
        </button>
      </div>
    </dialog>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}
