import { encodeFunctionData, formatUnits, parseUnits, toHex, type Address, type Hash } from "viem";
import { ERC20_ABI } from "./contracts/erc20Abi";
import { GAT_TOKEN, isGatContractConfigured } from "./gatToken";
import type { TrustEthereumProvider } from "./trustWalletProvider";
import { ensureSidraNetwork } from "./ensureSidraNetwork";
import { resolveSendRecipient, SendValidationError } from "./sendValidation";
import { SIDRA_CHAIN } from "./sidraNetwork";
import { getPublicClient } from "./publicClient";
import { formatWalletAddressShort } from "./connectedWalletUtils";
import { withWalletTimeout, WALLET_CONNECT_TIMEOUT_MS, WALLET_TX_TIMEOUT_MS } from "./walletTimeout";
import type { WalletProvider } from "./walletService";
import { isGarudaNativeWalletType, isPhraseWalletProvider } from "./walletService";
import { ensureSignerForAddress, getInjectedEthereumProvider } from "./walletProviderResolution";
import { isGarudaNativeAddress } from "./garudaWalletBridge";
import { isPhraseWalletAddress } from "./phraseWalletBridge";
import { requestGarudaGasTopUp } from "../payhub/walletActivationService";
import { isMobileDevice } from "./trustWalletProvider";
import {
  refreshWalletConnectSession,
  waitUntilPageVisible,
} from "./mobileWalletFlow";
import { stashMobileTxHash } from "../user/mobileWalletActivity";
import { auth as firebaseAuth } from "../firebase/config";
import { getGarudaSignerProvider } from "./simpleTxSigner";

export type TransferProgress = "connect" | "network" | "sign" | "submitted";

export type TransferOptions = {
  onProgress?: (step: TransferProgress) => void;
  timeoutMs?: number;
  timeoutMessage?: string;
};

export type TransferResult = {
  txHash: Hash | null;
  simulated: boolean;
};

export type WalletSendAsset =
  | { kind: "native-sda"; decimals: number }
  | { kind: "erc20"; contractAddress: `0x${string}`; decimals: number };

const resolveSignerFromAddress = async (
  eth: TrustEthereumProvider,
  preferred: string,
): Promise<string> => {
  try {
    const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    const account = accounts.find(Boolean);
    if (account) return account;
  } catch {
    /* fall back to preferred */
  }
  return preferred;
};

const rejectIfUserDenied = (e: unknown): void => {
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  if (msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel")) {
    throw Object.assign(e instanceof Error ? e : new Error("User rejected"), { code: "wallet/user-rejected" });
  }
};

const mapExecutionReverted = (e: unknown, signerFrom: string): Error => {
  const msg = e instanceof Error ? e.message.toLowerCase() : "";
  if (msg.includes("execution reverted") || msg.includes("revert")) {
    return Object.assign(
      new Error(
        `Transfer gagal, saldo GAT atau SDA tidak cukup di dompet pengirim (${formatWalletAddressShort(signerFrom)}). Segarkan halaman lalu coba lagi.`,
      ),
      { code: "send/execution-reverted" },
    );
  }
  return e instanceof Error ? e : new Error(String(e));
};

const preflightWalletSend = async (
  signerFrom: string,
  recipient: `0x${string}`,
  amount: string,
  asset: WalletSendAsset,
  requestedFrom?: string,
): Promise<void> => {
  const client = getPublicClient();
  const from = signerFrom as Address;

  if (asset.kind === "native-sda") {
    const value = parseUnits(amount, asset.decimals);
    const balance = await client.getBalance({ address: from, blockTag: "latest" });
    if (balance < value) {
      throw new SendValidationError(
        "send/insufficient-balance",
        `Saldo SDA tidak cukup di dompet ${formatWalletAddressShort(signerFrom)}.`,
      );
    }
    return;
  }

  const value = parseUnits(amount, asset.decimals);
  const tokenBalance = await client.readContract({
    address: asset.contractAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [from],
    blockTag: "latest",
  });
  if (tokenBalance < value) {
    const legacyFrom = requestedFrom?.trim().toLowerCase();
    const signerKey = signerFrom.toLowerCase();
    if (legacyFrom && legacyFrom !== signerKey) {
      try {
        const legacyBalance = await client.readContract({
          address: asset.contractAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [requestedFrom as Address],
          blockTag: "latest",
        });
        if (legacyBalance >= value) {
          throw new SendValidationError(
            "send/insufficient-balance",
            `GAT ada di alamat lama (${formatWalletAddressShort(requestedFrom!)}), bukan dompet Garuda Prime aktif (${formatWalletAddressShort(signerFrom)}). Segarkan halaman, saldo akan diselaraskan otomatis.`,
          );
        }
      } catch (e) {
        if (e instanceof SendValidationError) throw e;
      }
    }
    throw new SendValidationError(
      "send/insufficient-balance",
      `Saldo GAT tidak cukup di dompet pengirim (${formatWalletAddressShort(signerFrom)}). Segarkan halaman jika saldo tampil berbeda.`,
    );
  }

  const gasBalance = await client.getBalance({ address: from, blockTag: "latest" });
  const garudaNative = isGarudaNativeAddress(from);
  const minGasWei = parseUnits("0.04", 18);
  if (!garudaNative && gasBalance < minGasWei) {
    throw Object.assign(
      new Error("Saldo SDA tidak cukup untuk biaya jaringan Sidra, gas sedang disponsori, coba lagi."),
      { code: "send/insufficient-gas" },
    );
  }

  try {
    await client.simulateContract({
      address: asset.contractAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipient, value],
      account: from,
    });
  } catch (e) {
    const shortfall = formatUnits(value - tokenBalance, asset.decimals);
    if (tokenBalance < value) {
      throw new SendValidationError(
        "send/insufficient-balance",
        `Kurang ${shortfall} GAT di dompet ${formatWalletAddressShort(signerFrom)}.`,
      );
    }
    throw mapExecutionReverted(e, signerFrom);
  }
};

export const resolveWalletSendAsset = (
  symbol: string,
  contractAddress?: string,
): WalletSendAsset | null => {
  const upper = symbol.toUpperCase();
  if (upper === "SDA") return { kind: "native-sda", decimals: 18 };
  if (upper === "GAT") {
    if (!isGatContractConfigured() || !GAT_TOKEN.address) return null;
    return { kind: "erc20", contractAddress: GAT_TOKEN.address, decimals: GAT_TOKEN.decimals };
  }
  if (contractAddress && /^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
    return {
      kind: "erc20",
      contractAddress: contractAddress as `0x${string}`,
      decimals: 18,
    };
  }
  return null;
};

const isWalletConnectMobile = (provider?: WalletProvider) =>
  isMobileDevice() && !getInjectedEthereumProvider(provider);

const requestSendTransaction = async (
  eth: TrustEthereumProvider,
  from: string,
  recipient: `0x${string}`,
  amount: string,
  asset: WalletSendAsset,
): Promise<Hash> => {
  if (asset.kind === "native-sda") {
    const value = parseUnits(amount, asset.decimals);
    return (await eth.request({
      method: "eth_sendTransaction",
      params: [{
        from,
        to: recipient,
        value: toHex(value),
        chainId: toHex(SIDRA_CHAIN.chainId),
      }],
    })) as Hash;
  }

  const value = parseUnits(amount, asset.decimals);
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [recipient, value],
  });

  return (await eth.request({
    method: "eth_sendTransaction",
    params: [{
      from,
      to: asset.contractAddress,
      data,
      chainId: toHex(SIDRA_CHAIN.chainId),
    }],
  })) as Hash;
};

export const transferWalletAsset = async (
  from: string,
  to: string,
  amount: string,
  asset: WalletSendAsset,
  provider?: WalletProvider,
  options?: TransferOptions,
): Promise<TransferResult> => {
  const recipient = resolveSendRecipient(to);
  const timeoutMs = options?.timeoutMs ?? WALLET_TX_TIMEOUT_MS;
  const timeoutMessage = options?.timeoutMessage ?? "Wallet request timed out";

  // Garuda Prime, langsung server signer, tanpa WalletConnect / MetaMask
  if (isGarudaNativeWalletType(provider)) {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      throw Object.assign(new Error("Login diperlukan"), { code: "embedded/auth-required" });
    }
    options?.onProgress?.("connect");
    const eth = await withWalletTimeout(
      getGarudaSignerProvider(uid, from),
      12_000,
      timeoutMessage,
      "wallet/timeout",
    );
    options?.onProgress?.("network");
    await withWalletTimeout(ensureSidraNetwork(eth), timeoutMs, timeoutMessage, "wallet/timeout");
    options?.onProgress?.("sign");
    const signerFrom = await resolveSignerFromAddress(eth, from);
    const gas = await requestGarudaGasTopUp(signerFrom);
    if (gas?.error && !gas?.ok) {
      throw Object.assign(
        new Error(gas.error || "Gas sponsorship gagal, coba lagi."),
        { code: "send/insufficient-gas" },
      );
    }
    try {
      await preflightWalletSend(signerFrom, recipient, amount, asset, from);
    } catch (e) {
      rejectIfUserDenied(e);
      throw e;
    }
    let txHash: Hash;
    try {
      txHash = await withWalletTimeout(
        requestSendTransaction(eth, signerFrom, recipient, amount, asset),
        timeoutMs,
        timeoutMessage,
        "wallet/timeout",
      );
    } catch (e) {
      rejectIfUserDenied(e);
      throw mapExecutionReverted(e, signerFrom);
    }
    options?.onProgress?.("submitted");
    if (isMobileDevice()) stashMobileTxHash(txHash);
    return { txHash, simulated: false };
  }

  const isLocalSigner = isPhraseWalletProvider(provider)
    || isPhraseWalletAddress(from)
    || isGarudaNativeAddress(from)
    || isGarudaNativeWalletType(provider);
  const connectTimeoutMs = isLocalSigner
    ? 12_000
    : isMobileDevice()
      ? WALLET_CONNECT_TIMEOUT_MS
      : timeoutMs;
  const wcMobile = !isLocalSigner && isWalletConnectMobile(provider);

  options?.onProgress?.("connect");

  const eth = await withWalletTimeout(
    ensureSignerForAddress(from, provider, {
      allowNewWalletConnect: !isGarudaNativeWalletType(provider) && !isGarudaNativeAddress(from),
    }),
    connectTimeoutMs,
    timeoutMessage,
    "wallet/timeout",
  );

  options?.onProgress?.("network");

  const switchNetwork = async () => {
    await ensureSidraNetwork(eth);
    if (wcMobile) {
      await waitUntilPageVisible(12_000);
      await refreshWalletConnectSession();
    }
  };

  await withWalletTimeout(switchNetwork(), timeoutMs, timeoutMessage, "wallet/timeout");

  options?.onProgress?.("sign");

  const signerFrom = await resolveSignerFromAddress(eth, from);

  if (isGarudaNativeAddress(from)) {
    const gas = await requestGarudaGasTopUp(signerFrom);
    if (gas?.error && !gas?.ok) {
      throw Object.assign(
        new Error(gas.error || "Gas sponsorship gagal, coba lagi dalam beberapa detik."),
        { code: "send/insufficient-gas" },
      );
    }
  }

  try {
    await preflightWalletSend(signerFrom, recipient, amount, asset, from);
  } catch (e) {
    rejectIfUserDenied(e);
    throw e;
  }

  let txHash: Hash;
  try {
    txHash = await withWalletTimeout(
      requestSendTransaction(eth, signerFrom, recipient, amount, asset),
      timeoutMs,
      timeoutMessage,
      "wallet/timeout",
    );
  } catch (e) {
    rejectIfUserDenied(e);
    throw mapExecutionReverted(e, signerFrom);
  }

  options?.onProgress?.("submitted");
  if (isMobileDevice()) stashMobileTxHash(txHash);
  return { txHash, simulated: false };
};

/** @deprecated use transferWalletAsset */
export const transferGat = async (
  from: string,
  to: string,
  amount: string,
  provider?: WalletProvider,
  options?: TransferOptions,
): Promise<TransferResult> => {
  const asset = resolveWalletSendAsset("GAT");
  if (!asset) return { txHash: null, simulated: true };
  return transferWalletAsset(from, to, amount, asset, provider, options);
};
