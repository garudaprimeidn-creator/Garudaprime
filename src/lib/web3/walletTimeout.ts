export const withWalletTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  code = "wallet/timeout",
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(Object.assign(new Error(message), { code }));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });

/** Default max wait for wallet connect + sign on mobile (ms). */
export const WALLET_TX_TIMEOUT_MS = 120_000;

/** Shorter wait while establishing / reconnecting WalletConnect on mobile. */
export const WALLET_CONNECT_TIMEOUT_MS = 45_000;
