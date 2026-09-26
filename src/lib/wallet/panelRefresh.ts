/** Fire-and-forget refresh after wallet panel actions, never block modal close. */
export function refreshWalletPanelsInBackground(
  ...tasks: Array<((options?: { force?: boolean }) => void | Promise<void>) | undefined>
): void {
  for (const task of tasks) {
    if (!task) continue;
    void Promise.resolve(task()).catch(() => { /* best-effort */ });
  }
}

/** Poll balances after outbound tx while RPC catches up. */
export function scheduleWalletActivityRefreshBurst(
  refresh: (options?: { force?: boolean }) => void | Promise<void>,
): void {
  refreshWalletPanelsInBackground(() => refresh({ force: true }));
  for (const delayMs of [800, 2500, 6000, 12_000]) {
    window.setTimeout(() => void refresh({ force: true }), delayMs);
  }
}
