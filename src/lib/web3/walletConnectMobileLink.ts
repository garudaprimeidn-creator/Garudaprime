import type EthereumProvider from "@walletconnect/ethereum-provider";
import { formatDeeplinkUrl, getDeepLink } from "@walletconnect/utils";
import { resolveWalletAppProvider, type WalletAppTarget } from "./walletAppRouting";
import { getWalletConnectPeerName, syncWalletConnectPeerName } from "./walletConnectProvider";
import { isMobileDevice } from "./trustWalletProvider";

const WC_DEEPLINK_STORAGE_KEY = "WALLETCONNECT_DEEPLINK_CHOICE";

type WcSignClient = {
  on: (event: string, cb: (payload: SessionRequestSentPayload) => void) => void;
  core: { storage: Parameters<typeof getDeepLink>[0] };
};

type SessionRequestSentPayload = {
  id: number;
  topic: string;
  request?: { method: string };
};

type DeepLinkChoice = { href: string; name?: string };

const attachedProviders = new WeakSet<object>();

const launchUrl = (url: string) => {
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.style.display = "none";
    anchor.setAttribute("rel", "noopener noreferrer");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    window.location.href = url;
  }
};

/** Pairing, open wallet with WC URI (not dApp browser). */
export const openWalletConnectPairingUri = (uri: string, app: WalletAppTarget) => {
  if (!isMobileDevice()) return;
  const encoded = encodeURIComponent(uri);
  const url = app === "metamask"
    ? `https://metamask.app.link/wc?uri=${encoded}`
    : `https://link.trustwallet.com/wc?uri=${encoded}`;
  launchUrl(url);
};

const parseDeepLinkChoice = (raw: string | undefined): DeepLinkChoice | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DeepLinkChoice;
    if (typeof parsed?.href === "string" && parsed.href.trim()) return parsed;
  } catch {
    if (raw.includes("://")) return { href: raw };
  }
  return null;
};

const resolveWalletDeepLinkHref = async (
  provider: InstanceType<typeof EthereumProvider>,
  client: WcSignClient,
): Promise<string | null> => {
  try {
    const stored = await getDeepLink(client.core.storage, WC_DEEPLINK_STORAGE_KEY);
    const choice = parseDeepLinkChoice(stored);
    if (choice?.href) return choice.href;
  } catch {
    /* ignore */
  }

  syncWalletConnectPeerName();
  const app = resolveWalletAppProvider(undefined, getWalletConnectPeerName());
  if (app === "metamask") return "metamask://";

  const session = provider.session as {
    peer?: { metadata?: { redirect?: { native?: string; universal?: string } } };
  } | undefined;

  return session?.peer?.metadata?.redirect?.native
    ?? session?.peer?.metadata?.redirect?.universal
    ?? "trust://";
};

/** Pending sign / network switch, WalletConnect confirmation portal (not dApp browser). */
export const redirectWalletConnectSessionRequest = async (
  provider: InstanceType<typeof EthereumProvider>,
  payload: SessionRequestSentPayload,
) => {
  if (!isMobileDevice()) return;

  const client = provider.signer?.client as WcSignClient | undefined;
  if (!client) return;

  const href = await resolveWalletDeepLinkHref(provider, client);
  if (!href) return;

  const url = formatDeeplinkUrl(href, payload.id, payload.topic);
  launchUrl(url);
};

/**
 * Wire WalletConnect mobile deep links:
 * - display_uri → pairing with wc?uri= (MetaMask / Trust universal link)
 * - session_request_sent → metamask://wc?requestId=… confirmation portal
 */
export const attachWalletConnectMobileHandlers = (
  provider: InstanceType<typeof EthereumProvider>,
) => {
  if (!isMobileDevice() || attachedProviders.has(provider)) return;
  attachedProviders.add(provider);

  provider.on("display_uri", (uri: string) => {
    syncWalletConnectPeerName();
    const app = resolveWalletAppProvider(undefined, getWalletConnectPeerName());
    openWalletConnectPairingUri(uri, app);
  });

  const client = provider.signer?.client as WcSignClient | undefined;
  if (!client?.on) return;

  client.on("session_request_sent", (payload) => {
    void redirectWalletConnectSessionRequest(provider, payload);
  });
};
