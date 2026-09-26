import {
  uploadKycDocument,
  type KycUploadKind,
  type KycUploadProgressCallback,
} from "./kycStorageService";
import { isKycImageReadyToUpload } from "./kycImagePrep";

export type KycDocUploadStatus = "idle" | "uploading" | "ready" | "error";

type CacheEntry = {
  dataKey: string;
  url?: string;
  promise?: Promise<string>;
  error?: string;
  startedAt?: number;
  watchdog?: ReturnType<typeof setTimeout>;
};

const PREUPLOAD_MAX_WAIT_MS = 60_000;
const UPLOAD_WATCHDOG_MS = 65_000;

const cache: Record<string, Partial<Record<KycUploadKind, CacheEntry>>> = {};
const statusListeners = new Set<(uid: string) => void>();

/** One upload at a time, avoids mobile browser freeze from 4 parallel compress+upload. */
let queueTail: Promise<void> = Promise.resolve();

function enqueueUpload(task: () => Promise<void>): void {
  queueTail = queueTail.then(task).catch(() => {});
}

export function dataKeyForUrl(dataUrl: string): string {
  return `${dataUrl.length}:${dataUrl.slice(12, 48)}`;
}

export function clearKycPreuploadCache(uid: string) {
  const entries = cache[uid];
  if (entries) {
    for (const entry of Object.values(entries)) {
      if (entry?.watchdog) clearTimeout(entry.watchdog);
    }
  }
  delete cache[uid];
}

const FIELD_TO_KIND: Record<string, KycUploadKind> = {
  idDocumentFront: "id-document-front",
  idDocumentBack: "id-document-back",
  ktpSelfieFront: "ktp-selfie-front",
  ktpSelfieBack: "ktp-selfie-back",
  faceCapture: "liveness-selfie",
  livenessStep1Capture: "liveness-step-1",
  livenessStep2Capture: "liveness-step-2",
  livenessStep3Capture: "liveness-step-3",
};

export function kycFieldToKind(field: string): KycUploadKind | null {
  return FIELD_TO_KIND[field] ?? null;
}

function notifyStatus(uid: string) {
  statusListeners.forEach((fn) => fn(uid));
}

export function subscribeKycUploadStatus(listener: (uid: string) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function getKycUploadError(
  uid: string,
  kind: KycUploadKind,
  dataUrl: string,
): string | null {
  if (!uid || !dataUrl.startsWith("data:")) return null;
  const key = dataKeyForUrl(dataUrl);
  const entry = cache[uid]?.[kind];
  if (!entry || entry.dataKey !== key || !entry.error) return null;
  return entry.error;
}

export function getKycUploadStatus(
  uid: string,
  kind: KycUploadKind,
  dataUrl: string,
): KycDocUploadStatus {
  if (!uid || !dataUrl.startsWith("data:")) return "idle";
  const key = dataKeyForUrl(dataUrl);
  const entry = cache[uid]?.[kind];
  if (!entry || entry.dataKey !== key) return "idle";
  if (entry.url) return "ready";
  if (entry.promise) return "uploading";
  if (entry.error) return "error";
  return "idle";
}

function clearWatchdog(entry: CacheEntry | undefined) {
  if (entry?.watchdog) {
    clearTimeout(entry.watchdog);
    delete entry.watchdog;
  }
}

function clearStalePromise(uid: string, kind: KycUploadKind) {
  const entry = cache[uid]?.[kind];
  if (!entry?.promise || entry.url) return;
  clearWatchdog(entry);
  delete entry.promise;
}

function armWatchdog(uid: string, kind: KycUploadKind, key: string) {
  const entry = cache[uid]?.[kind];
  if (!entry) return;
  clearWatchdog(entry);
  entry.watchdog = setTimeout(() => {
    const current = cache[uid]?.[kind];
    if (!current || current.dataKey !== key || current.url) return;
    clearStalePromise(uid, kind);
    cache[uid]![kind] = { dataKey: key, error: "Upload timeout, coba lagi" };
    notifyStatus(uid);
  }, UPLOAD_WATCHDOG_MS);
}

function waitWithStaleTimeout(
  promise: Promise<string>,
  uid: string,
  kind: KycUploadKind,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearStalePromise(uid, kind);
      reject(new Error("Upload menggantung, mencoba ulang…"));
    }, PREUPLOAD_MAX_WAIT_MS);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        clearStalePromise(uid, kind);
        reject(e);
      });
  });
}

function runUpload(uid: string, kind: KycUploadKind, dataUrl: string, key: string): Promise<string> {
  const compressed = isKycImageReadyToUpload(dataUrl);
  return uploadKycDocument(uid, kind, dataUrl, undefined, compressed)
    .then((url) => {
      clearWatchdog(cache[uid]?.[kind]);
      cache[uid]![kind] = { dataKey: key, url };
      notifyStatus(uid);
      return url;
    })
    .catch((err) => {
      clearWatchdog(cache[uid]?.[kind]);
      const msg = err instanceof Error ? err.message : "Upload gagal";
      cache[uid]![kind] = { dataKey: key, error: msg };
      notifyStatus(uid);
      throw err;
    });
}

/** Start upload in background as soon as user picks a photo (queued, one at a time). */
export function scheduleKycPreupload(uid: string, kind: KycUploadKind, dataUrl: string): void {
  if (!uid || !dataUrl.startsWith("data:")) return;

  const key = dataKeyForUrl(dataUrl);
  if (!cache[uid]) cache[uid] = {};
  const entry = cache[uid][kind];

  if (entry?.dataKey === key && entry.url) return;
  if (entry?.dataKey === key && entry.promise) return;

  const promise = new Promise<string>((resolve, reject) => {
    enqueueUpload(async () => {
      try {
        const url = await runUpload(uid, kind, dataUrl, key);
        resolve(url);
      } catch (err) {
        reject(err);
      }
    });
  });

  cache[uid][kind] = { dataKey: key, promise, startedAt: Date.now() };
  armWatchdog(uid, kind, key);
  notifyStatus(uid);
}

async function resolveOne(
  uid: string,
  kind: KycUploadKind,
  dataUrl: string,
  onPhase?: (phase: "compress" | "upload") => void,
): Promise<string> {
  const key = dataKeyForUrl(dataUrl);
  const entry = cache[uid]?.[kind];

  if (entry?.dataKey === key && entry.url) return entry.url;

  if (entry?.dataKey === key && entry.promise) {
    try {
      return await waitWithStaleTimeout(entry.promise, uid, kind);
    } catch {
      /* fall through to fresh upload */
    }
  }

  onPhase?.("upload");
  const compressed = isKycImageReadyToUpload(dataUrl);
  const url = await uploadKycDocument(uid, kind, dataUrl, onPhase, compressed);
  clearWatchdog(cache[uid]?.[kind]);
  if (!cache[uid]) cache[uid] = {};
  cache[uid][kind] = { dataKey: key, url };
  notifyStatus(uid);
  return url;
}

export function ensureKycPreuploads(
  uid: string,
  docs: {
    idDocumentFront: string | null;
    idDocumentBack: string | null;
    ktpSelfieFront: string | null;
    ktpSelfieBack: string | null;
    livenessSelfie?: string | null;
    livenessStep1?: string | null;
    livenessStep2?: string | null;
    livenessStep3?: string | null;
  },
  opts?: { idBack?: boolean; selfieBack?: boolean },
): void {
  if (!uid) return;
  const pairs: [KycUploadKind, string | null][] = [
    ["id-document-front", docs.idDocumentFront],
    ["id-document-back", opts?.idBack ? docs.idDocumentBack : null],
    ["ktp-selfie-front", docs.ktpSelfieFront],
    ["ktp-selfie-back", opts?.selfieBack ? docs.ktpSelfieBack : null],
    ["liveness-selfie", docs.livenessSelfie ?? null],
    ["liveness-step-1", docs.livenessStep1 ?? null],
    ["liveness-step-2", docs.livenessStep2 ?? null],
    ["liveness-step-3", docs.livenessStep3 ?? null],
  ];
  for (const [kind, data] of pairs) {
    if (!data?.startsWith("data:")) continue;
    if (getKycUploadStatus(uid, kind, data) === "idle") {
      scheduleKycPreupload(uid, kind, data);
    }
  }
}

export async function resolveAllKycUploads(
  uid: string,
  docs: {
    idDocumentFront: string;
    idDocumentBack?: string | null;
    ktpSelfieFront: string;
    ktpSelfieBack?: string | null;
    livenessSelfie: string;
    livenessStep1?: string | null;
    livenessStep2?: string | null;
    livenessStep3?: string | null;
  },
  onProgress?: KycUploadProgressCallback,
): Promise<{
  idDocumentFrontUrl: string;
  idDocumentBackUrl: string | null;
  idDocumentUrl: string;
  ktpSelfieFrontUrl: string;
  ktpSelfieBackUrl: string | null;
  livenessSelfieUrl: string;
  livenessStep1Url: string | null;
  livenessStep2Url: string | null;
  livenessStep3Url: string | null;
}> {
  const steps: { kind: KycUploadKind; data: string; label: string }[] = [
    { kind: "id-document-front", data: docs.idDocumentFront, label: "Identitas depan" },
    { kind: "ktp-selfie-front", data: docs.ktpSelfieFront, label: "Selfie + dokumen depan" },
    { kind: "liveness-selfie", data: docs.livenessSelfie, label: "Selfie active liveness" },
  ];
  if (docs.livenessStep1) {
    steps.push({ kind: "liveness-step-1", data: docs.livenessStep1, label: "Liveness point 1" });
  }
  if (docs.livenessStep2) {
    steps.push({ kind: "liveness-step-2", data: docs.livenessStep2, label: "Liveness point 2" });
  }
  if (docs.livenessStep3) {
    steps.push({ kind: "liveness-step-3", data: docs.livenessStep3, label: "Liveness point 3" });
  }
  if (docs.idDocumentBack) {
    steps.splice(1, 0, { kind: "id-document-back", data: docs.idDocumentBack, label: "Identitas belakang" });
  }
  if (docs.ktpSelfieBack) {
    steps.splice(steps.length - 1, 0, { kind: "ktp-selfie-back", data: docs.ktpSelfieBack, label: "Selfie + dokumen belakang" });
  }

  const total = steps.length;
  const urls: Partial<Record<KycUploadKind, string>> = {};

  for (let i = 0; i < steps.length; i++) {
    const { kind, data, label } = steps[i]!;
    const step = i + 1;
    const key = dataKeyForUrl(data);
    const cached = cache[uid]?.[kind];

    if (cached?.dataKey === key && cached.url) {
      onProgress?.({ step, total, label, phase: "upload" });
      urls[kind] = cached.url;
      continue;
    }

    onProgress?.({ step, total, label, phase: "compress" });
    urls[kind] = await resolveOne(uid, kind, data, (phase) => {
      onProgress?.({ step, total, label, phase });
    });
    onProgress?.({ step, total, label, phase: "upload" });
  }

  return {
    idDocumentFrontUrl: urls["id-document-front"]!,
    idDocumentBackUrl: urls["id-document-back"] ?? null,
    idDocumentUrl: urls["id-document-front"]!,
    ktpSelfieFrontUrl: urls["ktp-selfie-front"]!,
    ktpSelfieBackUrl: urls["ktp-selfie-back"] ?? null,
    livenessSelfieUrl: urls["liveness-selfie"]!,
    livenessStep1Url: urls["liveness-step-1"] ?? null,
    livenessStep2Url: urls["liveness-step-2"] ?? null,
    livenessStep3Url: urls["liveness-step-3"] ?? null,
  };
}

export function getPreuploadPendingCount(uid: string): number {
  const entries = cache[uid];
  if (!entries) return 0;
  return Object.values(entries).filter((e) => e?.promise && !e.url).length;
}

export function areAllKycDocsReady(
  uid: string,
  docs: {
    idDocumentFront: string | null;
    idDocumentBack: string | null;
    ktpSelfieFront: string | null;
    ktpSelfieBack: string | null;
    livenessSelfie?: string | null;
    livenessStep1?: string | null;
    livenessStep2?: string | null;
    livenessStep3?: string | null;
  },
): boolean {
  if (!uid) return false;
  const pairs: [KycUploadKind, string | null][] = [
    ["id-document-front", docs.idDocumentFront],
    ["id-document-back", docs.idDocumentBack],
    ["ktp-selfie-front", docs.ktpSelfieFront],
    ["ktp-selfie-back", docs.ktpSelfieBack],
    ["liveness-selfie", docs.livenessSelfie ?? null],
  ];
  return pairs.every(([kind, data]) =>
    !!data && getKycUploadStatus(uid, kind, data) === "ready",
  );
}

export function retryKycPreupload(uid: string, kind: KycUploadKind, dataUrl: string): void {
  if (!uid || !dataUrl.startsWith("data:")) return;
  if (cache[uid]?.[kind]) {
    clearWatchdog(cache[uid]?.[kind]);
    delete cache[uid]![kind];
  }
  scheduleKycPreupload(uid, kind, dataUrl);
}
