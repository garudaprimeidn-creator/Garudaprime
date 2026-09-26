/** Cached server-native Garuda address for this tab, avoids duplicate /wallet/garuda/create calls. */
let cachedServerGarudaAddress: string | null = null;
let createInFlight: Promise<string> | null = null;

export const cacheGarudaServerAddress = (address: string): void => {
  const trimmed = address?.trim();
  if (trimmed) cachedServerGarudaAddress = trimmed;
};

export const getCachedGarudaServerAddress = (): string | null => cachedServerGarudaAddress;

export const clearGarudaServerAddressCache = (): void => {
  cachedServerGarudaAddress = null;
};

/** Single-flight Garuda native wallet create, shared by bridge + connect flows. */
export const resolveGarudaServerAddress = async (
  factory: () => Promise<string>,
): Promise<string> => {
  if (cachedServerGarudaAddress) return cachedServerGarudaAddress;
  if (!createInFlight) {
    createInFlight = factory()
      .then((address) => {
        const trimmed = address?.trim();
        if (!trimmed) {
          throw Object.assign(new Error("Garuda wallet address tidak valid"), { code: "embedded/invalid-address" });
        }
        cacheGarudaServerAddress(trimmed);
        return trimmed;
      })
      .finally(() => {
        createInFlight = null;
      });
  }
  return createInFlight;
};
