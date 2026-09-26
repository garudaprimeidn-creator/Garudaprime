import type { ServiceAccount } from "firebase-admin/app";

/** Parse FIREBASE_SERVICE_ACCOUNT from Vercel/dotenv (handles quotes and escaped newlines). */
export const parseServiceAccountJson = (raw: string): ServiceAccount => {
  let trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1);
  }

  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  const privateKey = String(parsed.private_key ?? parsed.privateKey ?? "");
  if (privateKey.includes("\\n")) {
    parsed.private_key = privateKey.replace(/\\n/g, "\n");
  }

  return parsed as ServiceAccount;
};
