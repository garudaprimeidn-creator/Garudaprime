/** Fast wallet activity sync, balances, inbound txs, Pay Hub ledger, history merge. */

export const WALLET_ACTIVITY_POLL_VISIBLE_MS = 12_000;
export const WALLET_ACTIVITY_POLL_HIDDEN_MS = 120_000;
export const WALLET_ACTIVITY_BURST_POLL_MS = 4_000;
export const WALLET_ACTIVITY_BURST_DURATION_MS = 90_000;

export function isAppVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function walletActivityPollDelayMs(burstUntilMs: number, now = Date.now()): number {
  if (now < burstUntilMs) return WALLET_ACTIVITY_BURST_POLL_MS;
  if (!isAppVisible()) return WALLET_ACTIVITY_POLL_HIDDEN_MS;
  return WALLET_ACTIVITY_POLL_VISIBLE_MS;
}

export function balanceRefreshMinIntervalMs(burstUntilMs: number, now = Date.now()): number {
  if (now < burstUntilMs) return WALLET_ACTIVITY_BURST_POLL_MS;
  if (!isAppVisible()) return WALLET_ACTIVITY_POLL_HIDDEN_MS;
  return WALLET_ACTIVITY_POLL_VISIBLE_MS;
}
