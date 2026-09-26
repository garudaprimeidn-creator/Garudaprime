import { adminDb } from "./firebaseAdmin.js";

const INBOX_COL = "user_inbox";

export type UserInboxRow = {
  type: string;
  title: string;
  body: string;
  action?: Record<string, unknown> | null;
};

export async function appendUserInbox(uid: string, row: UserInboxRow): Promise<number> {
  const id = Date.now();
  const now = new Date().toISOString();
  await adminDb().collection(INBOX_COL).doc(`${uid}_${id}`).set({
    id,
    uid,
    type: row.type,
    title: row.title,
    body: row.body,
    time: now,
    createdAt: now,
    read: false,
    action: row.action ?? null,
  }, { merge: true });
  return id;
}
