import {
  uploadCommunityConfigStorage,
  readCommunityConfigStorage,
  type CommunityConfigPayload,
} from "../lib/platform-config-storage.js";
import { getAdminApp } from "./firebaseAdmin.js";

export async function syncCommunityConfigStorage(config: CommunityConfigPayload): Promise<boolean> {
  try {
    await uploadCommunityConfigStorage(getAdminApp(), config);
    return true;
  } catch (err) {
    console.error("[community] storage sync failed:", err);
    return false;
  }
}

export async function loadCommunityConfigStorage(): Promise<CommunityConfigPayload | null> {
  try {
    return await readCommunityConfigStorage(getAdminApp());
  } catch {
    return null;
  }
}
