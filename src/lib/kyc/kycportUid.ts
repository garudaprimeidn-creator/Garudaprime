/** Stable Garuda uid from KYCPORT user id (same KYCPORT user → same uid). */
export function uidFromKycPortUserId(kycportUserId: string): string {
  const raw = kycportUserId.trim();
  if (!raw) return `kycport_${Date.now().toString(36)}`;

  const safe = raw.replace(/[^a-zA-Z0-9@._-]/g, "_");
  if (safe.length <= 100) {
    return safe.startsWith("kycport_") ? safe.slice(0, 128) : `kycport_${safe}`.slice(0, 128);
  }

  let hash = 0;
  for (let i = 0; i < safe.length; i += 1) {
    hash = ((hash << 5) - hash + safe.charCodeAt(i)) | 0;
  }
  const suffix = Math.abs(hash).toString(36);
  return `kycport_${safe.slice(0, 24)}_${suffix}`.slice(0, 128);
}
