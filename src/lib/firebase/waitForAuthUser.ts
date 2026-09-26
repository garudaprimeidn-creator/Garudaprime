import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, isFirebaseConfigured } from "./config";

/** Wait for Firebase Auth persistence after page reload (max 12s). */
export function waitForAuthUser(timeoutMs = 12_000): Promise<User> {
  if (!isFirebaseConfigured || !auth) {
    return Promise.reject(new Error("Firebase Auth belum dikonfigurasi."));
  }
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error("Sesi Firebase habis. Silakan logout lalu login ulang."));
    }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

export async function resolveFirebaseUploadUid(expectedUid?: string | null): Promise<string> {
  const user = await waitForAuthUser();
  if (expectedUid && user.uid !== expectedUid) {
    throw new Error("Sesi tidak cocok. Silakan logout lalu login ulang.");
  }
  return user.uid;
}
