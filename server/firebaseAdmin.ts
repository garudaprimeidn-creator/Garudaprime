import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";
import { parseServiceAccountJson } from "./parseServiceAccount.js";

let app: App | null = null;
let db: Firestore | null = null;
let storage: Storage | null = null;

export const getAdminApp = (): App => {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0]!;
    return app;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
  }

  const serviceAccount = parseServiceAccountJson(raw);
  const projectId =
    serviceAccount.projectId
    || (serviceAccount as ServiceAccount & { project_id?: string }).project_id
    || process.env.VITE_FIREBASE_PROJECT_ID;
  const storageBucket =
    process.env.VITE_FIREBASE_STORAGE_BUCKET
    || process.env.FIREBASE_STORAGE_BUCKET
    || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    || (projectId ? `${projectId}.firebasestorage.app` : undefined);

  app = initializeApp({
    credential: cert(serviceAccount),
    projectId,
    storageBucket,
  });
  return app;
};

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = (): Firestore => {
  if (!db) {
    db = getFirestore(getAdminApp());
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
};

export const adminStorageBucket = () => {
  const bucketName =
    process.env.VITE_FIREBASE_STORAGE_BUCKET?.trim()
    || process.env.FIREBASE_STORAGE_BUCKET?.trim()
    || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim()
    || `${getAdminApp().options.projectId}.firebasestorage.app`;
  return getStorage(getAdminApp()).bucket(bucketName);
};

export const adminStorage = (): Storage => {
  if (!storage) storage = getStorage(getAdminApp());
  return storage;
};
