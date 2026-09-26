import { DEFAULT_APP_ORIGIN } from "./domains";

const MARKETING_HOSTS = new Set(["garudaprime.id", "www.garudaprime.id"]);

/** React app must run on app.garudaprime.id, apex domain serves marketing only. */
export function redirectMarketingHostToApp(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (!MARKETING_HOSTS.has(host)) return false;

  const path = window.location.pathname.toLowerCase();
  if (path.startsWith("/marketing/")) return false;

  const target = `${DEFAULT_APP_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
  return true;
}
