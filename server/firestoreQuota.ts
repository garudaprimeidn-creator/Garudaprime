export const isFirestoreQuotaError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("RESOURCE_EXHAUSTED") || msg.toLowerCase().includes("quota exceeded");
};
