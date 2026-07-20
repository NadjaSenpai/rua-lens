import type { ReportDetail, StatelessReport } from "../../shared/api-contract";

const DB_NAME = "rua-lens";
const DB_VERSION = 1;
const STORE = "reports";

export type StoredReport = {
  id: string;
  fingerprint: string;
  detail: ReportDetail;
  importedAt: string;
  importedBy: string;
};

export type ExportBundle = {
  version: 1;
  exportedAt: string;
  reports: StoredReport[];
};

export function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("fingerprint", "fingerprint", { unique: true });
        store.createIndex("domain", "detail.domain");
        store.createIndex("periodBegin", "detail.periodBegin");
        store.createIndex("importedAt", "importedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function putReports(db: IDBDatabase, reports: StatelessReport[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const fpIndex = store.index("fingerprint");

    let pending = reports.length;
    if (pending === 0) { resolve(); return; }

    for (const report of reports) {
      const check = fpIndex.getKey(report.fingerprint);
      check.onsuccess = () => {
        if (check.result === undefined) {
          store.put({
            id: report.id,
            fingerprint: report.fingerprint,
            detail: report.detail,
            importedAt: report.importedAt,
            importedBy: report.importedBy,
          } satisfies StoredReport);
        }
        if (--pending === 0) resolve();
      };
      check.onerror = () => reject(check.error);
    }

    tx.onerror = () => reject(tx.error);
  });
}

export function getAllReports(db: IDBDatabase): Promise<StoredReport[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getStoredReport(db: IDBDatabase, id: string): Promise<StoredReport | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result ?? undefined);
    request.onerror = () => reject(request.error);
  });
}

export function deleteStoredReport(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function clearAll(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function exportAll(db: IDBDatabase): Promise<ExportBundle> {
  return getAllReports(db).then((reports) => ({
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    reports,
  }));
}

export function importAll(
  db: IDBDatabase,
  bundle: ExportBundle,
): Promise<{ imported: number; skipped: number }> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const fpIndex = store.index("fingerprint");
    let imported = 0;
    let skipped = 0;
    let pending = bundle.reports.length;

    if (pending === 0) { resolve({ imported: 0, skipped: 0 }); return; }

    for (const report of bundle.reports) {
      const check = fpIndex.getKey(report.fingerprint);
      check.onsuccess = () => {
        if (check.result === undefined) {
          store.put(report);
          imported++;
        } else {
          skipped++;
        }
        if (--pending === 0) resolve({ imported, skipped });
      };
      check.onerror = () => reject(check.error);
    }

    tx.onerror = () => reject(tx.error);
  });
}
