import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import { motion } from "motion/react";
import {
  X, Copy, Download, Repeat2, QrCode, Send, ArrowDownLeft,
  ChevronDown, Shield, Zap, ScanLine, Share2, ArrowRight, Store, BadgeCheck, Link2, ClipboardPaste, Loader2, CreditCard, RefreshCw,
} from "lucide-react";
import { useApp, type PayQrChannel, type PayScanPrefill, type ScanMode } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { TokenIcon } from "./TokenIcon";
import { TransactionStepPanel, type TxFlowStep } from "../features/wallet/TransactionStepPanel";
import { saveQrPayloadAsPng } from "../lib/qr/saveQrImage";
import { AssetReceiveQrPanel, CustomerPayInvoicePanel, MerchantReceiveActions, MerchantReceiveQrPanel, MerchantReceiveSection } from "../features/wallet/ReceiveQrPanels";
import { encodeReceiveQrPayload, extractMerchantIdFromText, parsePayMerchantPrefill, parseQrPayload, sanitizeQrText } from "../lib/qr/parseQrPayload";
import { QrPayloadImage } from "../features/wallet/QrPayloadImage";
import {
  resolvePayScanPrefill,
} from "../lib/merchant/merchantService";
import { useOwnerMerchantQr } from "../lib/merchant/useOwnerMerchantQr";
import type { QrCameraStatus } from "../lib/qr/useQrCameraScanner";
import {
  convertToken, formatConversionLabel, formatTokenPriceUsd,
  MAIN_NETWORK, tokenToUsd,
} from "./tokenEconomy";
import { SWAP_FEE_RATE, OFFCHAIN_FEE_RATE } from "../lib/protocol/feeConfig";
import { resolveWalletSendAsset, transferWalletAsset, type TransferProgress } from "../lib/web3/walletTransfer";
import { notifyWalletTransferRecipient } from "../lib/web3/walletTransferNotify";
import { resolveWalletSession, formatAddress, isGarudaNativeWalletType, isPhraseWalletProvider } from "../lib/web3/walletService";
import { autoActivateGarudaPrimeWallet, ensureGarudaPrimeSignerForTransaction, fetchExistingGarudaWalletAddress } from "../lib/web3/garudaNativeProvision";
import { isAppLocked, unlockApp } from "../lib/security/appLock";
import { grantGarudaSignWindow } from "../lib/web3/garudaWalletSignGate";
import { cacheGarudaServerAddress } from "../lib/web3/garudaNativeSession";
import {
  formatWalletAddressShort,
  resolveTransactionWalletProvider,
  resolveWalletMoneyAddress,
  resolveWalletSessionForAddress,
} from "../lib/web3/connectedWalletUtils";
import { resolveSimpleSpendWallet, resolveSimpleTxSigner } from "../lib/web3/simpleTxSigner";
import { withWalletTimeout } from "../lib/web3/walletTimeout";
import { warmWalletConnectForProvider } from "../lib/web3/walletConnectProvider";
import { attachMobileWalletFlow } from "../lib/web3/mobileWalletFlow";
import { recordWalletTransaction } from "../lib/user/mobileWalletActivity";
import { useAuth } from "../contexts/AuthContext";
import {
  assertNotSelfTransfer,
  assertSendAmountWithinBalance,
  parseSendAmount,
  resolveSendRecipient,
  SendValidationError,
} from "../lib/web3/sendValidation";
import { PayHubApiError } from "../lib/payhub/payHubApi";
import { PAY_HUB } from "../lib/payhub/payHubService";
import { instantPayMerchant, instantTransferGat, isInstantSidraGatEnabled, warmInstantSidraWallet } from "../lib/payhub/instantSidraTx";
import { formatMerchantShopTag } from "../lib/merchant/merchantDisplay";
import { fetchMerchantProfile } from "../lib/merchant/merchantService";
import { refreshWalletPanelsInBackground, scheduleWalletActivityRefreshBurst } from "../lib/wallet/panelRefresh";
import { pollPayReceiptChainData, pollPayReceiptConfirmation } from "../lib/payhub/payReceiptSync";

export type WalletToken = {
  symbol: string; name: string; balance: number; usd: number; change: number; color: string;
  logoUrl?: string | null; contractAddress?: string;
};

type ReceiveView = "assets" | "merchant";

const LazyQrCameraView = lazy(() =>
  import("../features/wallet/QrCameraView").then((m) => ({ default: m.QrCameraView })),
);

const QrCameraFallback = () => (
  <div className="flex items-center justify-center min-h-[14rem] rounded-2xl bg-black/80">
    <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
  </div>
);

const formatShortWallet = (address: string) =>
  address.length >= 10 ? `${address.slice(0, 8)}…${address.slice(-6)}` : (address || ", ");

const ReceiveViewTabs = ({
  view,
  onChange,
  assetsLabel,
  merchantLabel,
}: {
  view: ReceiveView;
  onChange: (view: ReceiveView) => void;
  assetsLabel: string;
  merchantLabel: string;
}) => (
  <div className="flex gap-1.5 p-1 rounded-2xl gp-tab-bar">
    <button
      type="button"
      onClick={() => onChange("merchant")}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-semibold transition-all ${
        view === "merchant"
          ? "bg-amber-500/12 border border-amber-500/30 text-amber-400"
          : "gp-muted border border-transparent"
      }`}
    >
      <Store className="w-3.5 h-3.5" />
      {merchantLabel}
    </button>
    <button
      type="button"
      onClick={() => onChange("assets")}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-semibold transition-all ${
        view === "assets"
          ? "bg-cyan-500/12 border border-cyan-500/30 text-cyan-400"
          : "gp-muted border border-transparent"
      }`}
    >
      <ArrowDownLeft className="w-3.5 h-3.5" />
      {assetsLabel}
    </button>
  </div>
);

const payPrefillFromCode = async (raw: string) => {
  const trimmed = sanitizeQrText(raw);
  const parsed = parsePayMerchantPrefill(trimmed);
  if (!parsed) return null;
  return resolvePayScanPrefill(parsed, trimmed);
};

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const formatBalance = (balance: number, symbol: string) =>
  symbol === "ETH" ? balance.toFixed(4) : balance.toLocaleString();

const tokenKey = (tok: { symbol: string; contractAddress?: string }) =>
  tok.contractAddress?.toLowerCase() ?? tok.symbol;

const resolveTokenKey = (
  tokens: WalletToken[],
  prefill?: { symbol?: string; contractAddress?: string } | null,
): string => {
  if (!tokens.length) return "GAT";
  if (!prefill?.symbol && !prefill?.contractAddress) return tokenKey(tokens[0]);
  const match = tokens.find((t) => {
    if (prefill.contractAddress) {
      return t.contractAddress?.toLowerCase() === prefill.contractAddress.toLowerCase();
    }
    return t.symbol === prefill.symbol;
  });
  return match ? tokenKey(match) : tokenKey(tokens[0]);
};

function useShareWalletAddressAction() {
  const { shareWalletAddress, showToast, walletAddress } = useApp();
  const { t } = useLanguage();
  const wa = t.walletActions;

  return useCallback(async () => {
    const text = wa.shareAddressText.replace("{address}", walletAddress);
    const result = await shareWalletAddress(text, wa.shareAddress);
    if (result === "shared") showToast(wa.shareSuccess, "success");
    else if (result === "copied") showToast(wa.shareCopiedFallback, "success");
    else showToast(wa.shareFailed, "error");
  }, [shareWalletAddress, showToast, walletAddress, wa]);
}

function useShareMerchantQrAction() {
  const { shareContent, showToast } = useApp();
  const { t } = useLanguage();
  const wa = t.walletActions;

  return useCallback(async (qrPayload: string, merchantName: string) => {
    const template = wa.shareMerchantQrText ?? "Bayar ke {name} via Garuda Prime:\n{payload}";
    const text = template.replace("{name}", merchantName).replace("{payload}", qrPayload);
    const result = await shareContent(text, wa.shareMerchantQr ?? "Bagikan QR Merchant");
    if (result === "shared") showToast(wa.shareSuccess, "success");
    else if (result === "copied") showToast(wa.shareCopiedFallback, "success");
    else showToast(wa.shareFailed, "error");
  }, [shareContent, showToast, wa]);
}

function useMerchantReceiveHandlers(
  merchantId: string,
  merchantName: string,
  qrPayload: string,
  hasRequestAmount: boolean,
) {
  const { copyText, showToast } = useApp();
  const shareMerchantQr = useShareMerchantQrAction();
  const { t } = useLanguage();
  const m = t.modals;
  const wa = t.walletActions;
  const p = t.pay;

  const copyLabel = hasRequestAmount
    ? (wa.copyMerchantPayCode ?? "Salin Kode Bayar")
    : (wa.copyMerchantId ?? "Salin ID");

  const onCopy = useCallback(() => {
    copyText(hasRequestAmount ? qrPayload : merchantId, hasRequestAmount ? copyLabel : p.merchantId);
  }, [copyText, copyLabel, hasRequestAmount, merchantId, p.merchantId, qrPayload]);

  const onSaveQr = useCallback(() => {
    const suffix = hasRequestAmount ? `-req` : "";
    void saveQrPayloadAsPng(
      qrPayload,
      `garuda-merchant-${merchantId}${suffix}.png`,
    ).then((ok) => showToast(ok ? m.qrSaved : wa.shareFailed, ok ? "success" : "error"));
  }, [hasRequestAmount, merchantId, m.qrSaved, qrPayload, showToast, wa.shareFailed]);

  const onShareQr = useCallback(() => {
    void shareMerchantQr(qrPayload, merchantName);
  }, [merchantName, qrPayload, shareMerchantQr]);

  return { copyLabel, onCopy, onSaveQr, onShareQr };
}

function AssetReceiveActions({
  copyLabel,
  saveQrLabel,
  shareLabel,
  onCopy,
  onSaveQr,
  onShareAddress,
}: {
  copyLabel: string;
  saveQrLabel: string;
  shareLabel: string;
  onCopy: () => void;
  onSaveQr: () => void;
  onShareAddress: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onCopy}
          className="gp-wallet-secondary flex items-center justify-center gap-2 py-3 rounded-2xl border text-sm font-semibold transition-all active:scale-[0.98]"
        >
          <Copy className="w-4 h-4 text-emerald-400" />
          {copyLabel}
        </button>
        <button
          type="button"
          onClick={onSaveQr}
          className="gp-wallet-secondary flex items-center justify-center gap-2 py-3 rounded-2xl border text-sm font-semibold transition-all active:scale-[0.98]"
        >
          <Download className="w-4 h-4 text-cyan-400" />
          {saveQrLabel}
        </button>
      </div>

      <button
        type="button"
        onClick={onShareAddress}
        className="w-full flex items-center justify-center gap-2 gp-muted text-xs py-2 transition-colors hover:gp-text"
      >
        <Share2 className="w-3.5 h-3.5" />
        {shareLabel}
      </button>
    </>
  );
}

const payQrPayload = (channel: PayQrChannel, walletAddress: string) =>
  channel === "onchain"
    ? `sidra:pay:${walletAddress.slice(0, 10)}…?token=GAT`
    : `garuda:pay:${PAY_HUB.merchantId}?token=GAT&name=${encodeURIComponent(PAY_HUB.merchantName)}`;

const payChannelFee = (recipientAmount: number, channel: PayQrChannel) =>
  recipientAmount * (channel === "onchain" ? SWAP_FEE_RATE() : OFFCHAIN_FEE_RATE());

const SCAN_MODE_STYLE: Record<ScanMode, {
  accent: "amber" | "emerald" | "cyan";
  corner: "amber" | "emerald" | "cyan";
  tabActive: string;
  chip: string;
  scanLine: string;
  gradient: string;
}> = {
  pay: {
    accent: "amber",
    corner: "amber",
    tabActive: "bg-amber-500/12 border border-amber-500/30 text-amber-500",
    chip: "bg-amber-500/10 border-amber-500/25 text-amber-500",
    scanLine: "from-transparent via-amber-400 to-transparent shadow-[0_0_10px_rgba(251,191,36,0.45)]",
    gradient: "from-amber-500/[0.04] via-transparent to-orange-500/[0.02]",
  },
  send: {
    accent: "emerald",
    corner: "emerald",
    tabActive: "bg-emerald-500/12 border border-emerald-500/30 text-emerald-400",
    chip: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
    scanLine: "from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_rgba(52,211,153,0.45)]",
    gradient: "from-emerald-500/[0.04] via-transparent to-teal-500/[0.02]",
  },
  receive: {
    accent: "cyan",
    corner: "cyan",
    tabActive: "bg-cyan-500/12 border border-cyan-500/30 text-cyan-400",
    chip: "bg-cyan-500/10 border-cyan-500/25 text-cyan-400",
    scanLine: "from-transparent via-cyan-400 to-transparent shadow-[0_0_10px_rgba(34,211,238,0.45)]",
    gradient: "from-cyan-500/[0.04] via-transparent to-blue-500/[0.02]",
  },
};

/* ─── Shared UI ─────────────────────────────────────────────────────────── */

const ModalShell = ({ children, flow = false }: { children: React.ReactNode; flow?: boolean }) => (
  <div className={`gp-wallet-modal px-5 pb-6 ${flow ? "gp-wallet-modal--flow pt-0" : "pt-1 space-y-5"}`}>{children}</div>
);

const ModalHeader = ({
  icon, title, subtitle, accent, onClose,
}: {
  icon: React.ReactNode; title: string; subtitle: string;
  accent: "emerald" | "cyan" | "indigo" | "amber";
  onClose: () => void;
}) => {
  const accents = {
    emerald: "from-emerald-500/25 to-teal-500/10 border-emerald-500/30 text-emerald-400",
    cyan: "from-cyan-500/25 to-blue-500/10 border-cyan-500/30 text-cyan-400",
    indigo: "from-indigo-500/25 to-violet-500/10 border-indigo-500/30 text-indigo-400",
    amber: "from-amber-500/25 to-orange-500/10 border-amber-500/30 text-amber-400",
  };
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br border flex items-center justify-center shrink-0 ${accents[accent]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="gp-text font-bold text-lg leading-tight">{title}</h3>
          <p className="gp-muted text-xs mt-0.5 leading-snug">{subtitle}</p>
        </div>
      </div>
      <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1.5 rounded-xl shrink-0 mt-0.5">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
};

const PrimaryBtn = ({
  children, onClick, disabled, className = "",
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`gp-wallet-primary w-full flex items-center justify-center gap-2 font-semibold rounded-2xl py-3.5 text-sm transition-all active:scale-[0.98] disabled:opacity-45 ${className}`}
  >
    {children}
  </button>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="gp-muted text-[10px] font-semibold uppercase tracking-widest mb-2">{children}</p>
);

const SummaryCard = ({ rows }: { rows: { label: string; value: string; highlight?: boolean }[] }) => (
  <div className="gp-wallet-summary rounded-2xl border p-3.5 space-y-2.5">
    {rows.map((r) => (
      <div key={r.label} className="flex items-center justify-between gap-3">
        <span className="gp-muted text-xs">{r.label}</span>
        <span className={`text-xs font-semibold gp-num text-right ${r.highlight ? "text-emerald-400" : "gp-text"}`}>{r.value}</span>
      </div>
    ))}
  </div>
);

const TokenPriceBadge = ({ symbol }: { symbol: string }) => (
  <span className="gp-num text-[10px] font-medium text-emerald-400/90">
    @ {formatTokenPriceUsd(symbol)}
  </span>
);

const UsdHint = ({ amount, symbol }: { amount: string | number; symbol: string }) => {
  const n = parseFloat(String(amount));
  if (!n || n <= 0) return null;
  return (
    <p className="gp-muted gp-num text-[10px] mt-1">
      ≈ {formatUsd(tokenToUsd(n, symbol))}
    </p>
  );
};

const QrChannelToggle = ({
  channel, onChange, compact = false,
}: { channel: PayQrChannel; onChange: (c: PayQrChannel) => void; compact?: boolean }) => {
  const p = useLanguage().t.pay;
  const wa = useLanguage().t.walletActions;
  return (
    <div>
      {!compact && <FieldLabel>{p.qrType}</FieldLabel>}
      {compact && (
        <p className="gp-muted text-[10px] font-semibold uppercase tracking-widest mb-2">{wa.scanPayChannelHint}</p>
      )}
      <div className="flex gap-1 p-1 rounded-2xl gp-tab-bar">
        <button
          type="button"
          onClick={() => onChange("offchain")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all border ${
            channel === "offchain"
              ? "bg-emerald-500/12 border-emerald-500/30 text-emerald-400"
              : "border-transparent gp-muted"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          {p.offchain}
        </button>
        <button
          type="button"
          onClick={() => onChange("onchain")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all border ${
            channel === "onchain"
              ? "bg-indigo-500/12 border-indigo-500/30 text-indigo-300"
              : "border-transparent gp-muted"
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          {p.onchain}
        </button>
      </div>
    </div>
  );
};

const ScanModeInfo = ({ mode, channel }: { mode: ScanMode; channel: PayQrChannel }) => {
  const { t } = useLanguage();
  const wa = t.walletActions;
  const p = t.pay;

  if (mode === "pay") {
    const isOnchain = channel === "onchain";
    return (
      <div className={`rounded-xl border p-3 ${
        isOnchain ? "border-indigo-500/20 bg-indigo-500/[0.05]" : "border-emerald-500/20 bg-emerald-500/[0.05]"
      }`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className={`text-xs font-semibold ${isOnchain ? "text-indigo-300" : "text-emerald-400"}`}>
            {isOnchain ? p.onchainTitle : p.offchainTitle}
          </p>
          <QrChannelBadge channel={channel} />
        </div>
        <p className="gp-muted text-[11px] leading-relaxed">
          {isOnchain ? p.onchainDesc : p.offchainDesc}
        </p>
      </div>
    );
  }

  if (mode === "send") {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
        <p className="text-xs font-semibold text-emerald-400 mb-1.5">{wa.scanSendTitle}</p>
        <p className="gp-muted text-[11px] leading-relaxed">{wa.scanSendInfo}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3">
      <p className="text-xs font-semibold text-cyan-400 mb-1.5">{wa.scanReceiveTitle}</p>
      <p className="gp-muted text-[11px] leading-relaxed">{wa.scanReceiveInfo}</p>
    </div>
  );
};

const QrChannelBadge = ({ channel }: { channel: PayQrChannel }) => {
  const p = useLanguage().t.pay;
  const isOnchain = channel === "onchain";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border ${
      isOnchain
        ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
        : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
    }`}>
      {isOnchain ? <Link2 className="w-2.5 h-2.5" /> : <Zap className="w-2.5 h-2.5" />}
      {isOnchain ? p.onchain : p.offchain}
    </span>
  );
};

const QrVisual = ({
  size = "lg", center = "garuda", channel,
}: { size?: "md" | "lg" | "sm"; center?: "garuda" | "gat" | "none"; channel?: PayQrChannel }) => {
  const dim = size === "lg" ? "w-44 h-44" : size === "md" ? "w-36 h-36" : "w-28 h-28";
  const filled = new Set([
    0,1,2,3,4,5,6,7, 13,14, 20,21, 27,28, 34,35, 41,42,43,44,45,46,47,48,
    8,15,22,29,36, 10,17,24,31,38, 12,19,26,33,40, 16,18,23,25,30,32,37,39,
  ]);
  return (
    <div className={`gp-wallet-qr-frame ${dim} rounded-2xl p-2.5 relative mx-auto`}>
      <div className="absolute inset-2.5 rounded-xl bg-white p-1.5">
        <div className="grid grid-cols-7 gap-[1.5px] w-full h-full">
          {Array.from({ length: 49 }).map((_, i) => (
            <div key={i} className={`rounded-[1px] ${filled.has(i) ? "bg-neutral-900" : "bg-white"}`} />
          ))}
        </div>
        {center !== "none" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-9 h-9 rounded-lg bg-white border border-neutral-100 shadow-sm flex items-center justify-center p-1">
              {center === "gat" ? (
                <TokenIcon symbol="GAT" size="xs" />
              ) : (
                <div className="w-full h-full rounded-md bg-gradient-to-br from-emerald-500 to-teal-400" />
              )}
            </div>
          </div>
        )}
      </div>
      {channel && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
          <QrChannelBadge channel={channel} />
        </div>
      )}
    </div>
  );
};

const SCAN_MODE_META = {
  send: { icon: Send, accent: "emerald" as const, corner: "emerald" as const },
  receive: { icon: ArrowDownLeft, accent: "cyan" as const, corner: "cyan" as const },
  pay: { icon: QrCode, accent: "amber" as const, corner: "amber" as const },
};

const TokenPicker = ({
  tokens, selectedKey, onSelect,
}: { tokens: WalletToken[]; selectedKey: string; onSelect: (key: string) => void }) => {
  const { t } = useLanguage();
  const wa = t.walletActions;
  return (
    <div>
      <FieldLabel>{wa.selectAsset}</FieldLabel>
      <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
        {tokens.map((tok) => {
          const key = tokenKey(tok);
          const active = selectedKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`gp-wallet-token-chip shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-2xl border transition-all ${
                active ? "gp-wallet-token-chip-active" : ""
              }`}
            >
              <TokenIcon symbol={tok.symbol} size="sm" color={tok.color} logoUrl={tok.logoUrl} contractAddress={tok.contractAddress} />
              <div className="text-left">
                <p className="gp-text text-xs font-bold leading-none">{tok.symbol}</p>
                <p className="gp-muted gp-num text-[10px] mt-0.5">{formatBalance(tok.balance, tok.symbol)}</p>
                <TokenPriceBadge symbol={tok.symbol} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ─── Send ──────────────────────────────────────────────────────────────── */

type TxFlowPhase = "idle" | "running" | "success";

const walletTransferFlowSteps = (pd: Record<string, string>): TxFlowStep[] => [
  { id: "processing", label: "Memproses", hint: pd.txFlowPleaseWait },
];

const resolveTransferFlowStepId = (_step: "idle" | TransferProgress | "confirming"): string =>
  "processing";

type SendStep = "idle" | TransferProgress | "confirming";

export const SendModalConnected = ({
  tokens, onClose,
}: { tokens: WalletToken[]; onClose: () => void }) => {
  const {
    addTransaction, patchTransaction, applyOptimisticGatDelta, applyConfirmedGatBalance,
    beginMobileTransaction, completeMobileTransaction, cancelMobileTransaction,
    showToast, refreshWalletActivity, sendPrefill, requireSpendSecurity, cancelPendingSecurityChallenge, walletAddress,
  } = useApp();
  const { connectedWallet, userProfile, user } = useAuth();
  const { t } = useLanguage();
  const m = t.modals;
  const w = t.wallet;
  const wa = t.walletActions;
  const pd = t.profileDetails;
  const spendWallet = resolveSimpleSpendWallet({
    profileAddress: userProfile?.walletAddress,
    connectedWallet,
    fallbackAddress: walletAddress,
  });
  const sendSourceAddress = spendWallet.address;
  const walletProvider = spendWallet.provider;
  const [amount, setAmount] = useState("");
  const [addr, setAddr] = useState(() => sendPrefill?.recipientAddress ?? "");
  const [selectedKey, setSelectedKey] = useState(() => resolveTokenKey(tokens, sendPrefill));
  const [sending, setSending] = useState(false);
  const [sendStep, setSendStep] = useState<SendStep>("idle");
  const [sendFlowPhase, setSendFlowPhase] = useState<TxFlowPhase>("idle");
  useEffect(() => {
    if (!user?.uid || !sendSourceAddress) return;
    if (isGarudaNativeWalletType(walletProvider)) {
      void (async () => {
        const canonical = await fetchExistingGarudaWalletAddress(user.uid);
        if (canonical) cacheGarudaServerAddress(canonical);
        await autoActivateGarudaPrimeWallet(user.uid, { profileAddress: sendSourceAddress, includePayHub: true });
      })();
    }
    void warmInstantSidraWallet(sendSourceAddress, walletProvider);
  }, [user?.uid, sendSourceAddress, walletProvider]);

  useEffect(() => {
    if (isGarudaNativeWalletType(walletProvider) || isPhraseWalletProvider(walletProvider)) return;
    warmWalletConnectForProvider(walletProvider);
  }, [walletProvider]);

  useEffect(() => {
    return attachMobileWalletFlow({
      active: sending,
      step: sendStep,
      provider: walletProvider,
      onResume: () => {
        if (sendStep === "sign" || sendStep === "network") {
          showToast(w.depositResumeInWallet, "info");
        }
      },
    });
  }, [sending, sendStep, walletProvider, showToast, w.depositResumeInWallet]);

  useEffect(() => {
    if (sendPrefill?.recipientAddress) setAddr(sendPrefill.recipientAddress);
    if (sendPrefill?.amount) setAmount(sendPrefill.amount);
    if (sendPrefill?.symbol || sendPrefill?.contractAddress) {
      setSelectedKey(resolveTokenKey(tokens, sendPrefill));
    }
  }, [sendPrefill]);

  useEffect(() => {
    if (!tokens.length) return;
    const stillValid = tokens.some((tok) => tokenKey(tok) === selectedKey);
    if (!stillValid) setSelectedKey(tokenKey(tokens[0]));
  }, [tokens, selectedKey]);

  const selected = tokens.find((tok) => tokenKey(tok) === selectedKey) ?? tokens[0];
  const token = selected?.symbol ?? "GAT";
  const maxBal = selected?.balance ?? 0;
  const usdEst = amount ? tokenToUsd(parseFloat(amount), token) : 0;
  const fee = amount ? parseFloat(amount) * SWAP_FEE_RATE() : 0;

  const sendErrorToast = (err: unknown) => {
    const code = err instanceof SendValidationError
      ? err.code
      : err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";
    const modals = m as Record<string, string>;
    switch (code) {
      case "send/invalid-recipient":
        return modals.invalidRecipient;
      case "send/insufficient-balance":
        return err instanceof Error && err.message.trim()
          ? err.message
          : modals.insufficientSendBalance;
      case "send/insufficient-gas":
        return err instanceof Error && err.message.trim()
          ? err.message
          : "Saldo SDA tidak cukup untuk biaya jaringan.";
      case "send/execution-reverted":
        return err instanceof Error && err.message.trim()
          ? err.message
          : modals.sendFailed;
      case "send/unsupported-token":
        return modals.sendUnsupportedToken;
      case "send/no-wallet":
        return modals.sendNoWallet;
      case "send/wallet-mismatch":
        return err instanceof Error && err.message.trim()
          ? err.message
          : modals.sendWalletMismatch;
      case "send/self-transfer":
        return modals.sendSelfTransfer;
      case "send/invalid-amount":
        return modals.invalidAmount;
      case "wallet/trust-not-found":
        return "Trust Wallet tidak terdeteksi · instal atau buka aplikasi Trust Wallet";
      case "wallet/metamask-not-found":
        return modals.sendNoWallet ?? "MetaMask tidak terdeteksi · instal atau buka aplikasi MetaMask";
      case "wallet/user-rejected":
        return t.toast.authPopupClosed as string;
      case "wallet/timeout":
        return w.depositWalletTimeout;
      case "wallet/chain-not-supported":
        return t.toast.walletChainNotSupported as string;
      case "payhub/approval-required":
        return modals.sendPayHubApprovalRequired ?? "Setujui GAT di Dompet untuk Pay Hub";
      case "garuda/challenge-failed":
      case "garuda/sign-failed":
      case "garuda/app-locked":
        return err instanceof Error && err.message.trim()
          ? err.message
          : "Gagal menandatangani via Garuda Wallet · buka kunci aplikasi lalu coba lagi";
      case "garuda/address-mismatch":
        return "Alamat dompet tidak cocok · tutup lalu buka lagi aplikasi, atau set Garuda Prime sebagai dompet utama.";
      default: {
        const raw = err instanceof Error ? err.message.trim() : "";
        if (/insufficient funds|exceeds the balance|gas \* gas fee|overshot/i.test(raw)) {
          return "Saldo SDA tidak cukup untuk biaya jaringan Sidra, gas sedang disponsori, coba lagi.";
        }
        return raw || modals.sendFailed;
      }
    }
  };

  const send = async () => {
    const parsedAmount = parseSendAmount(amount);
    if (parsedAmount === null) {
      showToast(m.invalidAmount, "error");
      return;
    }

    let recipient: `0x${string}`;
    try {
      recipient = resolveSendRecipient(addr);
    } catch (err) {
      showToast(sendErrorToast(err), "error");
      return;
    }

    try {
      assertSendAmountWithinBalance(parsedAmount, maxBal, fee);
    } catch (err) {
      showToast(sendErrorToast(err), "error");
      return;
    }

    const sendAsset = resolveWalletSendAsset(token, selected?.contractAddress);
    if (!sendAsset) {
      showToast(m.sendUnsupportedToken, "error");
      return;
    }

    if (!sendSourceAddress) {
      showToast(m.sendNoWallet, "error");
      return;
    }

    try {
      assertNotSelfTransfer(sendSourceAddress, recipient);
    } catch (err) {
      showToast(sendErrorToast(err), "error");
      return;
    }

    setSending(true);

    const securityOk = await withWalletTimeout(
      requireSpendSecurity(),
      30_000,
      "Verifikasi keamanan timeout, buka kunci aplikasi lalu coba lagi",
      "security/timeout",
    ).catch(() => {
      cancelPendingSecurityChallenge();
      return false;
    });
    if (!securityOk) {
      setSending(false);
      setSendFlowPhase("idle");
      setSendStep("idle");
      showToast(
        isAppLocked()
          ? "Buka kunci aplikasi terlebih dahulu"
          : m.securityRequired,
        "warning",
      );
      return;
    }
    unlockApp();
    grantGarudaSignWindow();

    setSendFlowPhase("running");
    setSendStep("connect");

    const useInstantGat = token === "GAT" && isInstantSidraGatEnabled();

    if (useInstantGat) {
      let succeeded = false;
      try {
        const result = await instantTransferGat(recipient, parsedAmount);
        const txId = addTransaction({
          type: "send",
          amount: `-${parsedAmount} ${token}`,
          addr: formatAddress(recipient),
          counterpartyWallet: recipient,
          time: new Date().toISOString(),
          usd: `-$${usdEst.toFixed(2)}`,
          status: t.confirmed,
          txHash: result.onChainTxHash ?? undefined,
          receiptCode: result.refId,
        });
        if (!result.onChainTxHash && result.refId) {
          void pollPayReceiptChainData(result.refId, { attempts: 15, delayMs: 500 }).then((chain) => {
            if (chain?.txHash) patchTransaction(txId, { txHash: chain.txHash });
          });
        }
        if (Number.isFinite(result.gatBalance)) {
          applyConfirmedGatBalance(result.gatBalance);
        } else {
          const debit = Number.isFinite(result.grossAmount) ? result.grossAmount : parsedAmount;
          applyOptimisticGatDelta(-debit);
        }
        void notifyWalletTransferRecipient({
          recipientAddress: recipient,
          senderAddress: sendSourceAddress,
          amount: parsedAmount,
          symbol: "GAT",
          txHash: result.onChainTxHash ?? undefined,
        });
        succeeded = true;
        setSendFlowPhase("success");
        showToast(m.sent(String(parsedAmount), token), "success");
        scheduleWalletActivityRefreshBurst(refreshWalletActivity);
      } catch (err) {
        showToast(sendErrorToast(err), "error");
      } finally {
        if (!succeeded) {
          setSending(false);
          setSendFlowPhase("idle");
          setSendStep("idle");
        }
      }
      return;
    }

    let fromAddress: string;
    let effectiveProvider: typeof walletProvider;
    try {
      ({ address: fromAddress, provider: effectiveProvider } = await withWalletTimeout(
        resolveSimpleTxSigner({
          profileAddress: userProfile?.walletAddress,
          connectedWallet,
          fallbackAddress: walletAddress,
          uid: user?.uid,
        }),
        15_000,
        "Dompet tidak merespons, tutup lalu buka lagi aplikasi",
        "embedded/timeout",
      ));
    } catch (err) {
      setSending(false);
      setSendFlowPhase("idle");
      setSendStep("idle");
      showToast(sendErrorToast(err), "error");
      return;
    }

    if (isPhraseWalletProvider(walletProvider) && !isPhraseWalletProvider(effectiveProvider)) {
      showToast("Dompet frasa belum aktif, masuk ulang dengan frasa sandi dan PIN.", "error");
      setSending(false);
      setSendFlowPhase("idle");
      setSendStep("idle");
      return;
    }

    let succeeded = false;
    try {
      const txDraft = {
        type: "send",
        amount: `-${parsedAmount} ${token}`,
        addr: formatAddress(recipient),
        counterpartyWallet: recipient,
        time: new Date().toISOString(),
        usd: `-$${usdEst.toFixed(2)}`,
        status: t.confirmed,
      };
      const ok = await recordWalletTransaction(
        { beginMobileTransaction, completeMobileTransaction, cancelMobileTransaction, addTransaction },
        txDraft,
        t.pending,
        async () => {
          const { txHash } = await transferWalletAsset(
            fromAddress,
            recipient,
            String(parsedAmount),
            sendAsset,
            effectiveProvider,
            {
              onProgress: (p) => setSendStep(p),
              timeoutMessage: w.depositWalletTimeout,
            },
          );
          if (txHash) {
            void notifyWalletTransferRecipient({
              recipientAddress: recipient,
              senderAddress: fromAddress,
              amount: parsedAmount,
              symbol: token === "SDA" ? "SDA" : "GAT",
              txHash,
            });
          }
          return { txHash };
        },
        { status: t.confirmed },
      );
      if (!ok) {
        showToast(m.sendFailed, "error");
        return;
      }

      succeeded = true;
      setSendFlowPhase("success");
      showToast(m.sent(String(parsedAmount), token), "success");
      if (token === "GAT") {
        applyOptimisticGatDelta(-parsedAmount);
      }
      scheduleWalletActivityRefreshBurst(refreshWalletActivity);
    } catch (err) {
      showToast(sendErrorToast(err), "error");
    } finally {
      if (!succeeded) {
        setSending(false);
        setSendFlowPhase("idle");
        setSendStep("idle");
      }
    }
  };

  const finishSendFlow = () => {
    setSending(false);
    setSendFlowPhase("idle");
    setSendStep("idle");
    onClose();
  };

  const sendStepLabel = (() => {
    switch (sendStep) {
      case "connect":
        return w.depositConnectingWallet;
      case "network":
        return w.depositSwitchNetwork;
      case "sign":
        return w.depositApproveInWallet;
      case "submitted":
        return w.depositSending;
      default:
        return m.confirmSend;
    }
  })();

  const pasteAddress = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        showToast(t.common.pasteEmpty, "warning");
        return;
      }
      setAddr(text);
      showToast(t.common.pasted, "success");
    } catch {
      showToast(t.common.pasteEmpty, "error");
    }
  };

  return (
    <>
      <ModalShell>
      {sendFlowPhase === "idle" ? (
        <>
      <ModalHeader
        icon={<Send className="w-5 h-5" />}
        title={m.sendAssets}
        subtitle={wa.sendSubtitle}
        accent="emerald"
        onClose={onClose}
      />

      <TokenPicker
        tokens={tokens}
        selectedKey={selectedKey}
        onSelect={(key) => {
          setSelectedKey(key);
          setAmount("");
        }}
      />

      <div>
        <FieldLabel>{wa.recipient}</FieldLabel>
        <div className="gp-wallet-input-wrap flex items-center gap-2 px-4 py-3 rounded-2xl border">
          <ArrowRight className="w-4 h-4 gp-muted shrink-0" />
          <input
            type="text"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder={m.recipientPlaceholder}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm gp-num gp-text focus:outline-none min-w-0 font-mono break-all"
          />
          <button
            type="button"
            onClick={pasteAddress}
            aria-label={t.common.paste}
            title={t.common.paste}
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/15 transition-colors"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold">{t.common.paste}</span>
          </button>
        </div>
      </div>

      <div>
        <FieldLabel>{wa.amount}</FieldLabel>
        <div className="gp-wallet-amount-card rounded-2xl border p-4">
          <div className="flex items-center gap-3 mb-1">
            <TokenIcon symbol={token} size="md" color={selected?.color} logoUrl={selected?.logoUrl} contractAddress={selected?.contractAddress} />
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-2xl font-black gp-num gp-text focus:outline-none min-w-0"
            />
            <button
              type="button"
              onClick={() => {
                const rate = SWAP_FEE_RATE();
                const maxSend = rate > 0 ? maxBal / (1 + rate) : maxBal;
                const rounded = Math.floor(maxSend * 1e6) / 1e6;
                setAmount(String(rounded));
              }}
              className="text-[10px] font-bold text-emerald-400 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25"
            >
              {t.max}
            </button>
          </div>
          <p className="gp-muted gp-num text-xs pl-12">
            ≈ {amount ? formatUsd(usdEst) : formatUsd(0)}
          </p>
          <div className="flex items-center gap-2 mt-1 pl-12">
            <TokenPriceBadge symbol={token} />
          </div>
          <p className="gp-muted text-[10px] mt-2 pl-12">
            {wa.available}: <span className="gp-num gp-text font-medium">{formatBalance(maxBal, token)} {token}</span>
            <span className="gp-muted"> ◈ {formatUsd(tokenToUsd(maxBal, token))}</span>
          </p>
        </div>
      </div>

      <SummaryCard rows={[
        { label: wa.senderWallet ?? "Dompet pengirim", value: formatWalletAddressShort(sendSourceAddress) },
        { label: wa.unitPrice, value: formatTokenPriceUsd(token) },
        { label: wa.network, value: MAIN_NETWORK.name },
        { label: wa.networkFee, value: `${fee.toFixed(4)} ${token}` },
        { label: wa.feeUsd, value: formatUsd(tokenToUsd(fee, token)) },
        { label: wa.valueUsd, value: amount ? formatUsd(usdEst) : ", ", highlight: !!amount },
        { label: wa.estimatedTime, value: wa.sidraConfirmation ?? t.pay.onchainSettlement },
      ]} />

      <PrimaryBtn onClick={send} disabled={sending}>
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
        {sendStepLabel}
      </PrimaryBtn>
        </>
      ) : (
        <p className="gp-muted text-center text-sm py-10">{pd.txFlowPleaseWait}</p>
      )}
    </ModalShell>
    {sendFlowPhase !== "idle" ? (
      <TransactionStepPanel
        title={pd.txFlowSendTitle}
        subtitle={pd.txFlowPleaseWait}
        steps={walletTransferFlowSteps(pd)}
        currentStepId={resolveTransferFlowStepId(sendStep)}
        phase={sendFlowPhase === "success" ? "success" : "running"}
        accent="emerald"
        successTitle={pd.txFlowSendSuccess}
        successHint={pd.txFlowSendSuccessHint}
        onSuccessDone={finishSendFlow}
      />
    ) : null}
    </>
  );
};

/* ─── Receive ───────────────────────────────────────────────────────────── */

export const ReceiveModalConnected = ({ onClose }: { onClose: () => void }) => {
  const { walletAddress, copyText, showToast, receiveViewPrefill } = useApp();
  const shareAddress = useShareWalletAddressAction();
  const { t } = useLanguage();
  const m = t.modals;
  const wa = t.walletActions;
  const p = t.pay;
  const [receiveView, setReceiveView] = useState<ReceiveView>(() => receiveViewPrefill ?? "assets");

  useEffect(() => {
    setReceiveView(receiveViewPrefill ?? "assets");
  }, [receiveViewPrefill]);

  const {
    merchantId,
    merchantName,
    qrPayload,
    requestAmount,
    setRequestAmount,
    hasRequestAmount,
    invoiceNote,
    setInvoiceNote,
    loading: merchantLoading,
    ready: merchantQrReady,
    refresh: refreshMerchantQr,
  } = useOwnerMerchantQr();
  const merchantReceive = useMerchantReceiveHandlers(
    merchantId,
    merchantName,
    qrPayload,
    hasRequestAmount,
  );

  return (
    <ModalShell>
      <ModalHeader
        icon={receiveView === "merchant" ? <Store className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
        title={receiveView === "merchant" ? (wa.receiveMerchantTab ?? "ID Merchant") : m.receiveAssets}
        subtitle={receiveView === "merchant" ? wa.receiveMerchantSubtitle : wa.receiveSubtitle}
        accent={receiveView === "merchant" ? "amber" : "cyan"}
        onClose={onClose}
      />

      <ReceiveViewTabs
        view={receiveView}
        onChange={setReceiveView}
        assetsLabel={m.receiveAssets}
        merchantLabel={wa.receiveMerchantTab ?? "ID Merchant"}
      />

      {receiveView === "assets" ? (
        <>
          <AssetReceiveQrPanel
            walletAddress={walletAddress}
            addressLabel={m.walletAddress}
            hint={wa.showMyQr ?? wa.receiveSubtitle}
          />

          <AssetReceiveActions
            copyLabel={t.common.copy}
            saveQrLabel={m.saveQr}
            shareLabel={wa.shareAddress}
            onCopy={() => copyText(walletAddress, t.common.address)}
            onSaveQr={() => {
              void saveQrPayloadAsPng(
                encodeReceiveQrPayload(walletAddress),
                `garuda-wallet-${walletAddress.slice(2, 10)}.png`,
              ).then((ok) => showToast(ok ? m.qrSaved : wa.shareFailed, ok ? "success" : "error"));
            }}
            onShareAddress={() => void shareAddress()}
          />
        </>
      ) : (
        <MerchantReceiveSection
          merchantId={merchantId}
          merchantName={merchantName}
          qrPayload={qrPayload}
          requestAmount={requestAmount}
          onRequestAmountChange={setRequestAmount}
          hasRequestAmount={hasRequestAmount}
          loading={merchantLoading}
          ready={merchantQrReady}
          onRefresh={refreshMerchantQr}
          hint={wa.receiveMerchantHint ?? "Tampilkan QR ini di kasir · pelanggan scan via Bayar"}
          hintWithAmount={wa.receiveMerchantHintWithAmount ?? "QR berisi nominal tagihan · pelanggan scan via Bayar"}
          emptyLabel={wa.merchantQrUnavailable ?? "ID merchant belum siap · muat ulang atau buka Merchant Center"}
          verifiedLabel={p.verified}
          merchantIdLabel={p.merchantId}
          requestAmountLabel={wa.requestPaymentAmount ?? "Nominal Tagihan"}
          requestAmountHint={wa.requestPaymentAmountHint ?? "Nominal ini ikut ke QR · pelanggan bayar persis jumlah ini"}
          requestAmountPlaceholder="0.00"
          clearAmountLabel={wa.clearRequestAmount ?? "Hapus"}
          requestAmountOptionalLabel={wa.requestPaymentAmountOptional ?? "Opsional"}
          requestAmountEmptyHint={wa.requestPaymentAmountEmpty ?? "Kosongkan jika pelanggan tentukan nominal sendiri"}
          merchantNetHint={wa.merchantReceiveNetHint}
          invoiceNote={invoiceNote}
          onInvoiceNoteChange={setInvoiceNote}
          invoiceNoteLabel={wa.merchantInvoiceNote ?? "Catatan Tagihan"}
          invoiceNotePlaceholder={wa.merchantInvoiceNotePlaceholder ?? "Catatan untuk pelanggan (opsional, tampil di invoice)"}
          refreshLabel={wa.refreshMerchantQr ?? "Muat ulang QR merchant"}
          copyLabel={merchantReceive.copyLabel}
          saveQrLabel={m.saveQr}
          shareLabel={wa.shareMerchantQr ?? "Bagikan QR Merchant"}
          onCopy={merchantReceive.onCopy}
          onSaveQr={merchantReceive.onSaveQr}
          onShareQr={merchantReceive.onShareQr}
        />
      )}
    </ModalShell>
  );
};

/* ─── Swap ──────────────────────────────────────────────────────────────── */

type SwapStep = "idle" | TransferProgress;

export const SwapModal = ({ tokens, onClose }: { tokens: WalletToken[]; onClose: () => void }) => {
  const {
    showToast, swapWalletTokens, requireSecurityStep, addTransaction,
    beginMobileTransaction, completeMobileTransaction, cancelMobileTransaction,
    refreshWalletActivity, applyOptimisticGatDelta, walletAddress,
  } = useApp();
  const { connectedWallet, userProfile } = useAuth();
  const { t } = useLanguage();
  const m = t.modals;
  const wa = t.walletActions;
  const w = t.wallet;
  const c = t.common;
  const pd = t.profileDetails;

  const swappable = tokens.filter((tok) => tok.symbol === "GAT" || tok.symbol === "SDA");
  const [from, setFrom] = useState(swappable[0]?.symbol ?? "GAT");
  const [to, setTo] = useState(swappable[1]?.symbol ?? "SDA");
  const [amount, setAmount] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapStep, setSwapStep] = useState<SwapStep>("idle");
  const [swapFlowPhase, setSwapFlowPhase] = useState<TxFlowPhase>("idle");
  const swapSourceAddress = resolveWalletMoneyAddress({
    profileAddress: userProfile?.walletAddress,
    connectedWallet,
    fallbackAddress: walletAddress,
  });
  const walletProvider = resolveTransactionWalletProvider(swapSourceAddress, connectedWallet);

  useEffect(() => {
    if (isGarudaNativeWalletType(walletProvider) || isPhraseWalletProvider(walletProvider)) return;
    warmWalletConnectForProvider(walletProvider);
  }, [walletProvider]);

  useEffect(() => {
    return attachMobileWalletFlow({
      active: swapping,
      step: swapStep,
      provider: walletProvider,
      onResume: () => {
        if (swapStep === "sign" || swapStep === "network") {
          showToast(w.depositResumeInWallet, "info");
        }
      },
    });
  }, [swapping, swapStep, walletProvider, showToast, w.depositResumeInWallet]);

  const fromTok = swappable.find((tok) => tok.symbol === from) ?? swappable[0];
  const toTok = swappable.find((tok) => tok.symbol === to) ?? swappable[1];
  const parsedAmount = amount ? parseFloat(amount) : 0;
  const availableBal = fromTok?.balance ?? 0;

  const receiveAfterFee = amount
    ? (convertToken(parseFloat(amount), from, to) * (1 - SWAP_FEE_RATE())).toFixed(4)
    : "0.00";
  const fromUsd = amount ? tokenToUsd(parseFloat(amount), from) : 0;
  const toUsd = receiveAfterFee !== "0.00" ? tokenToUsd(parseFloat(receiveAfterFee), to) : 0;

  const flip = () => {
    setFrom(to);
    setTo(from);
    setAmount("");
  };

  const swap = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      showToast(m.invalidAmount, "error");
      return;
    }
    if (from === to) {
      showToast(wa.swapSameToken ?? m.invalidAmount, "error");
      return;
    }
    if (parsedAmount > availableBal) {
      showToast(wa.swapInsufficient ?? m.insufficientSendBalance, "error");
      return;
    }

    const wallet = resolveWalletSessionForAddress(swapSourceAddress, connectedWallet);
    if (!wallet?.address) {
      showToast(m.sendNoWallet, "error");
      return;
    }

    setSwapping(true);
    setSwapFlowPhase("running");
    setSwapStep("connect");

    const securityOk = await withWalletTimeout(
      requireSecurityStep(),
      120_000,
      "Verifikasi keamanan timeout",
      "security/timeout",
    ).catch(() => false);
    if (!securityOk) {
      setSwapping(false);
      setSwapFlowPhase("idle");
      setSwapStep("idle");
      showToast(m.securityRequired, "warning");
      return;
    }
    let succeeded = false;
    try {
      const txDraft = {
        type: "swap",
        amount: `-${parsedAmount} ${from}`,
        addr: `+${receiveAfterFee} ${to}`,
        time: new Date().toISOString(),
        usd: `$${fromUsd.toFixed(2)}`,
        status: t.confirmed,
      };
      let swapResult: Awaited<ReturnType<typeof swapWalletTokens>> | null = null;
      const ok = await recordWalletTransaction(
        { beginMobileTransaction, completeMobileTransaction, cancelMobileTransaction, addTransaction },
        txDraft,
        t.pending,
        async () => {
          swapResult = await swapWalletTokens(
            from as "GAT" | "SDA",
            to as "GAT" | "SDA",
            parsedAmount,
            {
              onProgress: (p) => setSwapStep(p),
              timeoutMessage: w.depositWalletTimeout,
            },
          );
          return { txHash: swapResult.txHash };
        },
        () => ({
          status: t.confirmed,
          addr: swapResult ? `+${swapResult.netToAmount.toFixed(4)} ${to}` : txDraft.addr,
        }),
      );
      if (!ok || !swapResult) {
        showToast(wa.swapFailed ?? m.sendFailed, "error");
        return;
      }
      const deliveryMsg = swapResult.delivery === "wallet" && to === "SDA"
        ? (wa.swapSdaToWallet ?? `+${swapResult.netToAmount.toFixed(4)} SDA dikirim ke dompet`)
        : m.swapped(String(parsedAmount), from, to);
      succeeded = true;
      setSwapFlowPhase("success");
      showToast(deliveryMsg, "success");
      if (from === "GAT") applyOptimisticGatDelta(-parsedAmount);
      scheduleWalletActivityRefreshBurst(refreshWalletActivity);
    } catch (err) {
      showToast(err instanceof Error ? err.message : (wa.swapFailed ?? m.sendFailed), "error");
    } finally {
      if (!succeeded) {
        setSwapping(false);
        setSwapFlowPhase("idle");
        setSwapStep("idle");
      }
    }
  };

  const finishSwapFlow = () => {
    setSwapping(false);
    setSwapFlowPhase("idle");
    setSwapStep("idle");
    onClose();
  };

  const swapStepLabel = (() => {
    switch (swapStep) {
      case "connect":
        return w.depositConnectingWallet;
      case "network":
        return w.depositSwitchNetwork;
      case "sign":
        return w.depositApproveInWallet;
      case "submitted":
        return wa.swapProcessing ?? m.confirmSwap;
      default:
        return m.confirmSwap;
    }
  })();

  const SwapCard = ({
    label, symbol, value, onChange, readOnlyAmount, token, onSymbolChange, exclude,
  }: {
    label: string; symbol: string; value: string;
    onChange?: (v: string) => void; readOnlyAmount?: boolean;
    token?: WalletToken; onSymbolChange?: (s: string) => void;
    exclude?: string;
  }) => {
    const options = exclude
      ? swappable.filter((tok) => tok.symbol !== exclude)
      : swappable;
    return (
      <div className="gp-wallet-swap-card rounded-2xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="gp-muted text-[10px] font-semibold uppercase tracking-widest">{label}</span>
          {!readOnlyAmount && token && (
            <span className="gp-muted gp-num text-[10px]">
              {wa.available}: {formatBalance(availableBal, token.symbol)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl gp-subtle border">
              <TokenIcon symbol={symbol} size="sm" color={token?.color} />
              {onSymbolChange ? (
                <>
                  <select
                    value={symbol}
                    onChange={(e) => onSymbolChange(e.target.value)}
                    className="bg-transparent text-sm font-bold gp-text focus:outline-none appearance-none pr-4 cursor-pointer"
                  >
                    {options.map((tok) => (
                      <option key={tok.symbol} value={tok.symbol}>{tok.symbol}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 gp-muted absolute right-2 pointer-events-none" />
                </>
              ) : (
                <span className="gp-text text-sm font-bold">{symbol}</span>
              )}
            </div>
          </div>
          <input
            type="number"
            value={value}
            readOnly={readOnlyAmount}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-right text-xl font-black gp-num gp-text focus:outline-none min-w-0"
          />
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t gp-divider">
          <TokenPriceBadge symbol={symbol} />
          <UsdHint amount={value} symbol={symbol} />
        </div>
      </div>
    );
  };

  return (
    <>
      <ModalShell flow={swapFlowPhase !== "idle"}>
      {swapFlowPhase !== "idle" ? (
        <TransactionStepPanel
          title={pd.txFlowSwapTitle}
          subtitle={pd.txFlowPleaseWait}
          steps={walletTransferFlowSteps(pd)}
          currentStepId={resolveTransferFlowStepId(swapStep)}
          phase={swapFlowPhase === "success" ? "success" : "running"}
          accent="indigo"
          successTitle={pd.txFlowSwapSuccess}
          successHint={pd.txFlowSwapSuccessHint}
          onSuccessDone={finishSwapFlow}
        />
      ) : (
        <>
      <ModalHeader
        icon={<Repeat2 className="w-5 h-5" />}
        title={m.swap}
        subtitle={wa.swapSubtitle}
        accent="indigo"
        onClose={onClose}
      />

      <div className="relative space-y-1">
        <SwapCard
          label={c.from} symbol={from} value={amount} onChange={setAmount}
          token={fromTok} onSymbolChange={setFrom} exclude={to}
        />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <button
            type="button"
            onClick={flip}
            className="gp-wallet-flip w-10 h-10 rounded-xl border flex items-center justify-center transition-all active:scale-95 hover:border-indigo-500/40"
          >
            <Repeat2 className="w-4 h-4 text-indigo-400" />
          </button>
        </div>
        <SwapCard label={c.to} symbol={to} value={receiveAfterFee} readOnlyAmount token={toTok} onSymbolChange={setTo} exclude={from} />
      </div>

      <SummaryCard rows={[
        { label: wa.unitPrice, value: `${formatTokenPriceUsd(from)} → ${formatTokenPriceUsd(to)}` },
        { label: wa.exchangeRate, value: formatConversionLabel(from, to) },
        { label: wa.slippage, value: "0.1%" },
        { label: wa.valueUsd, value: amount ? `${formatUsd(fromUsd)} → ${formatUsd(toUsd)}` : ", " },
        { label: wa.youReceive, value: `${receiveAfterFee} ${to}`, highlight: true },
        ...(amount ? [{
          label: wa.swapSource ?? "Sumber",
          value: wa.swapSourceWallet ?? "Dompet On-Chain",
        }] : []),
      ]} />

      <PrimaryBtn onClick={() => void swap()} disabled={!amount || parseFloat(amount) <= 0 || swapping || from === to}>
        {swapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat2 className="w-4 h-4" />}
        {m.confirmSwap}
      </PrimaryBtn>
        </>
      )}
    </ModalShell>
    </>
  );
};

/* ─── Scan ──────────────────────────────────────────────────────────────── */

export const ScanModal = ({ onClose }: { onClose: () => void }) => {
  const {
    showToast, requestPayOverlay, requestSendOverlay,
    payQrChannel, setPayQrChannel,
    walletAddress, copyText, scanMode, setScanMode, scanLockedMode,
    receiveViewPrefill,
  } = useApp();
  const shareAddress = useShareWalletAddressAction();
  const { t } = useLanguage();
  const m = t.modals;
  const wa = t.walletActions;
  const p = t.pay;
  const tp = t.toolsPanel;
  const [scanKey, setScanKey] = useState(0);
  const [detected, setDetected] = useState(false);
  const [pastePayCode, setPastePayCode] = useState("");
  const [receiveView, setReceiveView] = useState<ReceiveView>(() => receiveViewPrefill ?? "assets");
  const {
    merchantId,
    merchantName,
    qrPayload: merchantQrPayload,
    requestAmount,
    setRequestAmount,
    hasRequestAmount,
    invoiceNote,
    setInvoiceNote,
    loading: merchantLoading,
    ready: merchantQrReady,
    refresh: refreshMerchantQr,
  } = useOwnerMerchantQr();
  const scanMerchantReceive = useMerchantReceiveHandlers(
    merchantId,
    merchantName,
    merchantQrPayload,
    hasRequestAmount,
  );
  const handlingRef = useRef(false);

  const applyPastedPayCode = useCallback(async (raw: string) => {
    const prefill = await payPrefillFromCode(raw);
    if (!prefill) {
      showToast(wa.scanInvalidQr ?? m.invalidQr ?? "Kode merchant tidak valid", "error");
      return false;
    }
    if (!requestPayOverlay(prefill)) {
      showToast(wa.scanInvalidQr ?? m.invalidQr ?? "Kode merchant tidak valid", "error");
      return false;
    }
    setPayQrChannel("onchain");
    showToast(p.qrDetectedOnchain ?? p.qrDetectedOffchain, "success");
    return true;
  }, [showToast, wa, m, p, requestPayOverlay, setPayQrChannel]);

  const pastePayCodeFromClipboard = useCallback(async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        showToast(t.common.pasteEmpty, "warning");
        return;
      }
      setPastePayCode(text);
      applyPastedPayCode(text);
    } catch {
      showToast(t.common.pasteEmpty, "error");
    }
  }, [applyPastedPayCode, showToast, t.common.pasteEmpty]);

  const mode = scanMode;
  const locked = scanLockedMode !== null;
  const style = SCAN_MODE_STYLE[mode];
  const meta = SCAN_MODE_META[mode];
  const ModeIcon = meta.icon;
  const shortAddr = formatShortWallet(walletAddress);
  const isReceive = mode === "receive";
  const isReceiveMerchant = isReceive && receiveView === "merchant";
  const cameraActive = !isReceive && !detected;

  const cameraStatusLabels: Record<QrCameraStatus, string> & { uploadFallback: string } = {
    idle: "",
    starting: wa.scanCameraStarting ?? m.scanCamera,
    scanning: m.scanCamera,
    denied: wa.scanCameraDenied ?? "Izin kamera ditolak",
    unsupported: wa.scanCameraUnsupported ?? "Kamera tidak didukung",
    error: wa.scanCameraError ?? "Gagal membuka kamera",
    uploadFallback: wa.uploadQrImage ?? "Unggah / Upload QR",
    uploadHint: wa.uploadQrHint,
  };

  const resetScanCamera = useCallback(() => {
    handlingRef.current = false;
    setDetected(false);
    setScanKey((k) => k + 1);
  }, []);

  const handleDecoded = useCallback((raw: string): boolean => {
    if (handlingRef.current || isReceive) return false;
    const text = sanitizeQrText(raw);
    if (!text) return false;

    const quickMerchantId = extractMerchantIdFromText(text);
    const hasWalletAddr = /0x[a-fA-F0-9]{40}/.test(text);
    if (text.length < 10 && !quickMerchantId && !hasWalletAddr) return false;

    try {
      handlingRef.current = true;
      setDetected(true);

      const parsed = parseQrPayload(text);

      if (parsed.kind === "unknown") {
        if (mode === "send") {
          const embedded = text.match(/0x[a-fA-F0-9]{40}/i)?.[0];
          if (embedded) {
            const shortAddr = `${embedded.slice(0, 6)}…${embedded.slice(-4)}`;
            const detectedMsg = (m.qrDetected ?? "QR terdeteksi: {addr}").replace("0x9b3c...2f7a", shortAddr);
            showToast(detectedMsg, "success");
            window.setTimeout(() => {
              onClose();
              requestSendOverlay({ recipientAddress: embedded });
              handlingRef.current = false;
            }, 200);
            return true;
          }
        }

        const extractedId = extractMerchantIdFromText(text);
        if (extractedId) {
          void (async () => {
            try {
              const prefill = await resolvePayScanPrefill(
                { kind: "pay", channel: "onchain", merchantId: extractedId },
                text,
              );
              if (!prefill?.merchantId) {
                showToast(wa.scanInvalidQr ?? m.invalidQr ?? "QR merchant tidak dikenali", "error");
                resetScanCamera();
                return;
              }
              setPayQrChannel("onchain");
              showToast(p.qrDetectedOnchain ?? p.qrDetectedOffchain, "success");
              window.setTimeout(() => {
                const ok = requestPayOverlay(prefill);
                if (!ok) resetScanCamera();
                else handlingRef.current = false;
              }, 350);
            } catch (err) {
              console.error("[Garuda Prime scan]", err);
              showToast(wa.scanInvalidQr ?? m.invalidQr ?? "QR merchant tidak dikenali", "error");
              resetScanCamera();
            }
          })();
          return true;
        }
        showToast(wa.scanInvalidQr ?? m.invalidQr ?? "QR tidak dikenali", "error");
        resetScanCamera();
        return false;
      }

      if (mode === "pay") {
        if (parsed.kind === "send") {
          const shortAddr = `${parsed.recipientAddress.slice(0, 6)}…${parsed.recipientAddress.slice(-4)}`;
          showToast(
            (wa.scanRedirectSend ?? "QR alamat dompet · dialihkan ke Kirim: {addr}").replace("{addr}", shortAddr),
            "success",
          );
          window.setTimeout(() => {
            onClose();
            requestSendOverlay({
              recipientAddress: parsed.recipientAddress,
              amount: parsed.amount,
              symbol: parsed.token,
            });
            handlingRef.current = false;
          }, 200);
          return true;
        }
        if (parsed.kind !== "pay") {
          showToast(wa.scanWrongMode ?? "QR ini bukan kode bayar merchant", "warning");
          resetScanCamera();
          return false;
        }
        const payParsed = !parsed.merchantId
          ? {
            ...parsed,
            merchantId: extractMerchantIdFromText(text),
          }
          : parsed;
        void (async () => {
          try {
            const prefill = await resolvePayScanPrefill(payParsed, text);
            if (!prefill?.merchantId) {
              showToast(wa.scanInvalidQr ?? m.invalidQr ?? "QR merchant tidak dikenali", "error");
              resetScanCamera();
              return;
            }
            const channel: PayQrChannel = "onchain";
            setPayQrChannel("onchain");
            showToast(p.qrDetectedOnchain ?? p.qrDetectedOffchain, "success");
            window.setTimeout(() => {
              const ok = requestPayOverlay(prefill);
              if (!ok) {
                resetScanCamera();
                return;
              }
              handlingRef.current = false;
            }, 350);
          } catch (err) {
            console.error("[Garuda Prime scan]", err);
            showToast(wa.scanInvalidQr ?? m.invalidQr ?? "QR merchant tidak dikenali", "error");
            resetScanCamera();
          }
        })();
        return true;
      }

      if (mode === "send") {
        if (parsed.kind === "pay" && parsed.merchantId) {
          void (async () => {
            try {
              const prefill = await resolvePayScanPrefill(parsed, text);
              if (!prefill?.merchantId) {
                showToast(wa.scanInvalidQr ?? m.invalidQr ?? "QR merchant tidak dikenali", "error");
                resetScanCamera();
                return;
              }
              showToast(wa.scanRedirectPay ?? "QR merchant · dialihkan ke Bayar", "success");
              setPayQrChannel("onchain");
              window.setTimeout(() => {
                onClose();
                const ok = requestPayOverlay(prefill);
                if (!ok) resetScanCamera();
                else handlingRef.current = false;
              }, 200);
            } catch (err) {
              console.error("[Garuda Prime scan]", err);
              showToast(wa.scanInvalidQr ?? m.invalidQr ?? "QR merchant tidak dikenali", "error");
              resetScanCamera();
            }
          })();
          return true;
        }

        const sendTarget = parsed.kind === "send"
          ? parsed
          : parsed.kind === "pay" && parsed.recipientAddress
            ? {
              recipientAddress: parsed.recipientAddress,
              amount: parsed.amount,
              token: parsed.token,
            }
            : null;

        if (!sendTarget?.recipientAddress) {
          showToast(wa.scanWrongModeSend ?? "QR ini bukan alamat dompet", "warning");
          resetScanCamera();
          return false;
        }
        const shortAddr = `${sendTarget.recipientAddress.slice(0, 6)}…${sendTarget.recipientAddress.slice(-4)}`;
        const detectedMsg = (m.qrDetected ?? "QR terdeteksi: {addr}").replace("0x9b3c...2f7a", shortAddr);
        showToast(detectedMsg, "success");
        window.setTimeout(() => {
          onClose();
          requestSendOverlay({
            recipientAddress: sendTarget.recipientAddress,
            amount: sendTarget.amount,
            symbol: sendTarget.token,
          });
          handlingRef.current = false;
        }, 200);
        return true;
      }

      resetScanCamera();
      return false;
    } catch (err) {
      console.error("[Garuda Prime scan]", err);
      showToast(wa.scanCameraError ?? "Gagal memproses QR", "error");
      resetScanCamera();
      return false;
    }
  }, [
    isReceive, mode, showToast, wa, m, p,
    onClose, requestPayOverlay, requestSendOverlay, resetScanCamera, setPayQrChannel,
  ]);

  useEffect(() => {
    setDetected(false);
    handlingRef.current = false;
    setScanKey((k) => k + 1);
    if (mode === "receive") {
      setReceiveView(receiveViewPrefill ?? "assets");
    }
  }, [mode, receiveViewPrefill]);

  const modes: { id: ScanMode; label: string; icon: React.ReactNode }[] = [
    { id: "pay", label: t.common.pay, icon: <QrCode className="w-3.5 h-3.5" /> },
    { id: "send", label: t.common.send, icon: <Send className="w-3.5 h-3.5" /> },
    { id: "receive", label: t.common.receive, icon: <ArrowDownLeft className="w-3.5 h-3.5" /> },
  ];

  const hints: Record<ScanMode, string> = {
    pay: wa.scanPayHint,
    send: wa.scanSendHint,
    receive: wa.scanReceiveHint,
  };

  return (
    <ModalShell>
      <ModalHeader
        icon={isReceive ? <ArrowDownLeft className="w-5 h-5" /> : locked ? <CreditCard className="w-5 h-5" /> : <ScanLine className="w-5 h-5" />}
        title={locked
          ? tp.paymentScanTitle
          : isReceive
            ? (receiveView === "merchant" ? (wa.receiveMerchantTab ?? "ID Merchant") : m.receiveAssets)
            : m.scanQr}
        subtitle={locked
          ? tp.paymentScanSubtitle
          : isReceive
            ? (receiveView === "merchant" ? wa.receiveMerchantSubtitle : hints.receive)
            : hints[mode]}
        accent={style.accent}
        onClose={onClose}
      />

      {!locked && (
      <div className="flex gap-1.5 p-1 rounded-2xl gp-tab-bar">
        {modes.map((mItem) => {
          const active = mode === mItem.id;
          const tabStyle = SCAN_MODE_STYLE[mItem.id];
          return (
            <button
              key={mItem.id}
              type="button"
              onClick={() => setScanMode(mItem.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-semibold transition-all ${
                active ? tabStyle.tabActive : "gp-muted border border-transparent"
              }`}
            >
              {mItem.icon}
              {mItem.label}
            </button>
          );
        })}
      </div>
      )}

      {isReceive && (
        <ReceiveViewTabs
          view={receiveView}
          onChange={setReceiveView}
          assetsLabel={m.receiveAssets}
          merchantLabel={wa.receiveMerchantTab ?? "ID Merchant"}
        />
      )}

      {isReceive ? (
        isReceiveMerchant ? (
          <>
            <MerchantReceiveQrPanel
              merchantId={merchantId}
              merchantName={merchantName}
              qrPayload={merchantQrPayload}
              hint={
                hasRequestAmount
                  ? (wa.receiveMerchantHintWithAmount ?? "QR berisi nominal tagihan · pelanggan scan via Bayar")
                  : (wa.receiveMerchantHint ?? "Tampilkan QR ini di kasir · pelanggan scan via Bayar")
              }
              emptyLabel={wa.merchantQrUnavailable ?? "ID merchant belum siap · muat ulang atau buka Merchant Center"}
              verifiedLabel={p.verified}
              merchantIdLabel={p.merchantId}
              showSkeleton={merchantLoading && !merchantQrReady}
              requestAmount={requestAmount}
              onRequestAmountChange={setRequestAmount}
              requestAmountLabel={wa.requestPaymentAmount ?? "Nominal Tagihan"}
              requestAmountHint={wa.requestPaymentAmountHint ?? "Nominal ini ikut ke QR · pelanggan bayar persis jumlah ini"}
              requestAmountPlaceholder="0.00"
              clearAmountLabel={wa.clearRequestAmount ?? "Hapus"}
              requestAmountOptionalLabel={wa.requestPaymentAmountOptional ?? "Opsional"}
              requestAmountEmptyHint={wa.requestPaymentAmountEmpty ?? "Kosongkan jika pelanggan tentukan nominal sendiri"}
              merchantNetHint={wa.merchantReceiveNetHint}
              invoiceNote={invoiceNote}
              onInvoiceNoteChange={setInvoiceNote}
              invoiceNoteLabel={wa.merchantInvoiceNote ?? "Catatan Tagihan"}
              invoiceNotePlaceholder={wa.merchantInvoiceNotePlaceholder ?? "Catatan untuk pelanggan (opsional, tampil di invoice)"}
            />
            {!merchantQrReady && !merchantLoading && (
              <button
                type="button"
                onClick={refreshMerchantQr}
                className="-mt-2 mb-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-amber-400 mx-auto"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {wa.refreshMerchantQr ?? "Muat ulang QR merchant"}
              </button>
            )}
          </>
        ) : (
          <AssetReceiveQrPanel
            walletAddress={walletAddress}
            addressLabel={m.walletAddress}
            hint={wa.showMyQr ?? hints.receive}
          />
        )
      ) : (
        <div className="gp-wallet-scanner relative rounded-2xl border overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-b ${style.gradient} pointer-events-none`} />

          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2 relative z-10">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${style.chip}`}>
              <ModeIcon className="w-3 h-3 shrink-0" />
              {modes.find((x) => x.id === mode)?.label}
            </span>

            {mode === "pay" && (
              <span className="inline-flex items-center gap-1 gp-num text-[10px] font-semibold text-emerald-400 shrink-0">
                <TokenIcon symbol="GAT" size="xs" />
                GAT ◈ {formatTokenPriceUsd("GAT")}
              </span>
            )}
            {mode === "send" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold shrink-0">
                <Link2 className="w-3 h-3" />
                {MAIN_NETWORK.name}
              </span>
            )}
          </div>

          <div className="px-3 sm:px-4 pt-3.5 pb-5 flex flex-col items-center relative z-10 w-full">
            <div className="relative mx-auto w-full">
              {detected && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center min-h-[14rem] rounded-2xl bg-black/75">
                  <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center ${
                    mode === "pay" ? "bg-amber-500/15 border-amber-500/30" : "bg-emerald-500/15 border-emerald-500/30"
                  }`}>
                    <BadgeCheck className={`w-7 h-7 ${mode === "pay" ? "text-amber-400" : "text-emerald-400"}`} />
                  </div>
                  <p className="gp-muted text-[11px] text-center px-6 pt-3">
                    {wa.scanSuccess ?? "QR terdeteksi"}
                  </p>
                </div>
              )}
              <div className={detected ? "opacity-0 pointer-events-none" : ""} aria-hidden={detected}>
                <Suspense fallback={<QrCameraFallback />}>
                  <LazyQrCameraView
                    key={scanKey}
                    active={cameraActive}
                    cornerColor={style.corner}
                    scanLineClass={style.scanLine}
                    hint={m.scanCamera}
                    statusLabels={cameraStatusLabels}
                    onDecode={handleDecoded}
                    onUploadFail={() => showToast(wa.uploadQrFailed ?? m.invalidQr, "error")}
                  />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isReceive && <ScanModeInfo mode={mode} channel={payQrChannel} />}

      {isReceive ? (
        receiveView === "merchant" ? (
          <MerchantReceiveActions
            loading={merchantLoading}
            merchantIdLabel={scanMerchantReceive.copyLabel}
            saveQrLabel={m.saveQr}
            shareLabel={wa.shareMerchantQr ?? "Bagikan QR Merchant"}
            onCopyId={scanMerchantReceive.onCopy}
            onSaveQr={scanMerchantReceive.onSaveQr}
            onShareQr={scanMerchantReceive.onShareQr}
          />
        ) : (
          <AssetReceiveActions
            copyLabel={t.common.copy}
            saveQrLabel={m.saveQr}
            shareLabel={wa.shareAddress}
            onCopy={() => copyText(walletAddress, t.common.address)}
            onSaveQr={() => {
              void saveQrPayloadAsPng(
                encodeReceiveQrPayload(walletAddress),
                `garuda-wallet-${walletAddress.slice(2, 10)}.png`,
              ).then((ok) => showToast(ok ? m.qrSaved : wa.shareFailed, ok ? "success" : "error"));
            }}
            onShareAddress={() => void shareAddress()}
          />
        )
      ) : (
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              setDetected(false);
              handlingRef.current = false;
              setScanKey((k) => k + 1);
            }}
            className="w-full py-3 rounded-2xl border border-dashed border-emerald-500/30 text-emerald-400 text-sm font-semibold flex items-center justify-center gap-2 gp-hover-row"
          >
            <RefreshCw className="w-4 h-4" />
            {wa.rescanQr ?? m.rescanQr ?? "Pindai ulang"}
          </button>

          {mode === "pay" && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/5 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                {wa.pastePayCodeLabel ?? "Tempel kode merchant"}
              </p>
              <p className="text-[10px] leading-relaxed text-slate-600 dark:gp-muted">
                {wa.pastePayCodeHint ?? "Salin dari Merchant Center lalu tempel di sini"}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pastePayCode}
                  onChange={(e) => setPastePayCode(e.target.value)}
                  placeholder={wa.pastePayCodePlaceholder ?? "garuda:pay:GP-MRT-2847?..."}
                  className="flex-1 min-w-0 rounded-xl border border-amber-400/50 bg-white dark:bg-black/30 px-3 py-2.5 text-[11px] text-slate-900 dark:gp-text font-mono placeholder:text-slate-400"
                  spellCheck={false}
                  autoCapitalize="off"
                />
                <button
                  type="button"
                  onClick={() => void pastePayCodeFromClipboard()}
                  className="shrink-0 px-3 py-2.5 rounded-xl border border-amber-400/60 bg-white dark:bg-amber-500/10 text-amber-900 dark:text-amber-300 text-xs font-semibold flex items-center gap-1"
                  aria-label={t.common.paste}
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!pastePayCode.trim()}
                  onClick={() => applyPastedPayCode(pastePayCode)}
                  className="shrink-0 px-3.5 py-2.5 rounded-xl bg-amber-500 border border-amber-600 text-white text-xs font-bold disabled:opacity-45 disabled:bg-slate-200 disabled:text-slate-500 disabled:border-slate-300"
                >
                  {wa.scanManualMerchantGo ?? "Lanjut"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="gp-muted text-[10px] text-center leading-relaxed px-1">
        {isReceive
          ? (receiveView === "merchant" ? wa.receiveMerchantInfo : wa.scanReceiveInfo)
          : wa.scanHint}
      </p>
    </ModalShell>
  );
};

/* ─── Pay (QR Merchant) ───────────────────────────────────────────────────── */

export const PayModal = ({ onClose }: { onClose: () => void }) => {
  const {
    showToast, addTransaction, patchTransaction, payQrChannel, setPayQrChannel,
    walletAddress, refreshWalletActivity, payScanPrefill, requestPayOverlay, garudaPrimeSpendableGat,
    applyOptimisticGatDelta, requireSpendSecurity, cancelPendingSecurityChallenge,
  } = useApp();
  const { user, connectedWallet, userProfile } = useAuth();
  const { t } = useLanguage();
  const m = t.modals;
  const wa = t.walletActions;
  const p = t.pay;
  const w = t.wallet;
  const pd = t.profileDetails;
  const [amount, setAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [payStep, setPayStep] = useState<"prepare" | "approve" | "settle" | "confirm">("prepare");
  const [payFlowPhase, setPayFlowPhase] = useState<TxFlowPhase>("idle");
  const [paySuccessHint, setPaySuccessHint] = useState("");
  const [pastePayCode, setPastePayCode] = useState("");
  const token = "GAT";
  const payWallet = resolveSimpleSpendWallet({
    profileAddress: userProfile?.walletAddress,
    connectedWallet,
    fallbackAddress: walletAddress,
  });
  const payerAddress = payWallet.address;
  const payWalletProvider = payWallet.provider;

  const lockedTarget = payScanPrefill?.merchantId;
  const merchantId = lockedTarget ?? ", ";
  const merchantName = payScanPrefill?.merchantName ?? PAY_HUB.merchantName;
  const [merchantBranding, setMerchantBranding] = useState<{ shopSymbol?: string; shopLocation?: string }>({});
  const shopTag = formatMerchantShopTag({
    shopSymbol: merchantBranding.shopSymbol ?? payScanPrefill?.shopSymbol,
    shopLocation: merchantBranding.shopLocation ?? payScanPrefill?.shopLocation,
  });
  const channel: PayQrChannel = "onchain";
  const isOnchain = true;
  const recipientVault = payScanPrefill?.recipientAddress?.trim();

  useEffect(() => {
    setPayQrChannel("onchain");
    if (payScanPrefill?.amount) setAmount(payScanPrefill.amount);
    setMerchantBranding({
      shopSymbol: payScanPrefill?.shopSymbol,
      shopLocation: payScanPrefill?.shopLocation,
    });
  }, [payScanPrefill, setPayQrChannel]);

  useEffect(() => {
    if (!lockedTarget) return;
    if (payScanPrefill?.shopSymbol || payScanPrefill?.shopLocation) return;
    let cancelled = false;
    void fetchMerchantProfile(lockedTarget).then((profile) => {
      if (cancelled || !profile) return;
      setMerchantBranding({
        shopSymbol: profile.shopSymbol?.trim() || undefined,
        shopLocation: profile.shopLocation?.trim() || undefined,
      });
    });
    return () => { cancelled = true; };
  }, [lockedTarget, payScanPrefill?.shopSymbol, payScanPrefill?.shopLocation]);

  useEffect(() => {
    if (!user?.uid || !payerAddress) return;
    if (isGarudaNativeWalletType(payWalletProvider)) {
      void (async () => {
        const canonical = await fetchExistingGarudaWalletAddress(user.uid);
        if (canonical) cacheGarudaServerAddress(canonical);
        await autoActivateGarudaPrimeWallet(user.uid, { profileAddress: payerAddress, includePayHub: true });
      })();
    }
    void warmInstantSidraWallet(payerAddress, payWalletProvider);
  }, [user?.uid, payerAddress, payWalletProvider]);

  const applyPastedPayCode = useCallback(async (raw: string) => {
    const prefill = await payPrefillFromCode(raw);
    if (!prefill) {
      showToast(wa.scanInvalidQr ?? m.invalidQr ?? "Kode merchant tidak valid", "error");
      return;
    }
    if (!requestPayOverlay(prefill)) {
      showToast(wa.scanInvalidQr ?? m.invalidQr ?? "Kode merchant tidak valid", "error");
      return;
    }
    if (prefill.amount) setAmount(prefill.amount);
    showToast(wa.pastePayCodeApplied ?? t.common.pasted, "success");
  }, [showToast, wa, m, requestPayOverlay, t.common.pasted]);

  const pastePayCodeFromClipboard = useCallback(async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        showToast(t.common.pasteEmpty, "warning");
        return;
      }
      setPastePayCode(text);
      applyPastedPayCode(text);
    } catch {
      showToast(t.common.pasteEmpty, "error");
    }
  }, [applyPastedPayCode, showToast, t.common.pasteEmpty]);

  const usdVal = amount ? tokenToUsd(parseFloat(amount), token) : 0;
  const parsedAmount = amount ? parseFloat(amount) : 0;
  const fee = parsedAmount > 0 && channel !== "onchain" ? payChannelFee(parsedAmount, channel) : 0;
  const totalDebit = parsedAmount > 0 ? parsedAmount + fee : 0;
  const hasInvoice = Boolean(payScanPrefill?.invoiceId && parsedAmount > 0);
  const amountLocked = Boolean(payScanPrefill?.amount && parsedAmount > 0);
  const qrPayload = payScanPrefill?.qrPayload?.trim()
    || (lockedTarget
      ? buildMerchantPayQrPayload(
        lockedTarget,
        merchantName,
        recipientVault,
      )
      : "");

  const payErrorToast = (err: unknown) => {
    if (err instanceof PayHubApiError) return err.message;
    const code = err && typeof err === "object" && "code" in err
      ? String((err as { code: string }).code)
      : "";
    if (code === "payhub/auth") return p.payHubAuthRequired ?? m.sendNoWallet;
    if (code === "payhub/timeout") {
      return "Pembayaran membutuhkan waktu lebih lama · cek riwayat dompet sebelum mencoba lagi";
    }
    if (code === "payhub/quota") return err instanceof PayHubApiError ? err.message : "Layanan sibuk · tunggu 1-2 menit lalu coba lagi";
    const raw = err instanceof Error ? err.message : "";
    if (/signal is aborted|aborted without reason/i.test(raw)) {
      return "Pembayaran membutuhkan waktu lebih lama · cek riwayat dompet sebelum mencoba lagi";
    }
    if (/resource_exhausted|quota exceeded/i.test(raw)) {
      return "Layanan sibuk · tunggu 1-2 menit lalu coba lagi";
    }
    if (/insufficient gat balance/i.test(raw)) {
      return p.payHubInsufficient?.replace("{need}", totalDebit.toFixed(4)).replace("{have}", garudaPrimeSpendableGat.toFixed(4))
        ?? "Saldo GAT tidak cukup";
    }
    if (/approval required|approve pay hub/i.test(raw)) {
      return "Persetujuan GAT diperlukan · buka Dompet dan setujui Pay Hub";
    }
    if (/insufficient funds|exceeds the balance|gas \* gas fee|saldo sda tidak cukup|transfer gat on-chain gagal/i.test(raw)) {
      return "Saldo SDA tidak cukup untuk biaya jaringan Sidra, gas sedang disponsori, coba lagi.";
    }
    return raw.trim() ? raw : m.enterAmount;
  };

  const pay = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      showToast(m.enterAmount, "error");
      return;
    }
    if (!lockedTarget) {
      showToast(wa.scanInvalidQr ?? m.invalidQr ?? "Scan atau tempel kode merchant terlebih dahulu", "error");
      return;
    }

    const parsedAmount = parseFloat(amount);
    const totalDebitCheck = parsedAmount + (channel !== "onchain" ? payChannelFee(parsedAmount, channel) : 0);

    const walletBal = garudaPrimeSpendableGat;
    if (totalDebitCheck > walletBal) {
      showToast(
        p.payHubInsufficient?.replace("{need}", totalDebitCheck.toFixed(4)).replace("{have}", walletBal.toFixed(4))
          ?? `Saldo GAT tidak cukup (${walletBal} GAT)`,
        "error",
      );
      return;
    }

    setPaying(true);

    const securityOk = await withWalletTimeout(
      requireSpendSecurity(),
      30_000,
      "Verifikasi keamanan timeout, buka kunci aplikasi lalu coba lagi",
      "security/timeout",
    ).catch(() => {
      cancelPendingSecurityChallenge();
      return false;
    });
    if (!securityOk) {
      setPaying(false);
      setPayFlowPhase("idle");
      setPayStep("prepare");
      showToast(
        isAppLocked() ? "Buka kunci aplikasi terlebih dahulu" : m.securityRequired,
        "warning",
      );
      return;
    }
    unlockApp();
    grantGarudaSignWindow();

    setPayFlowPhase("running");
    setPayStep("prepare");

    const activePayer = payerAddress;
    const effectivePayProvider = payWalletProvider;

    let succeeded = false;
    try {
      const settlePayload = {
        channel,
        amount,
        payerAddress: activePayer,
        merchantId: lockedTarget,
        merchantName,
        recipientAddress: recipientVault,
        walletProvider: effectivePayProvider,
        uid: user?.uid,
        invoiceId: payScanPrefill?.invoiceId,
        invoiceNote: payScanPrefill?.invoiceNote,
      };

      const { receipt } = await instantPayMerchant(settlePayload);

      setPayStep("confirm");

      const txId = addTransaction({
        type: "pay",
        amount: `-${parsedAmount.toFixed(4)} ${token}`,
        addr: `${merchantName} · ${receipt.receiptCode}`,
        time: new Date().toISOString(),
        usd: `-$${tokenToUsd(parsedAmount, token).toFixed(2)}`,
        status: receipt.status === "confirmed" ? t.confirmed : t.pending,
        txHash: receipt.txHash,
        receiptCode: receipt.receiptCode,
        merchantId: lockedTarget,
        invoiceId: payScanPrefill?.invoiceId,
      });

      const payDebit = receipt.grossAmountGat ?? totalDebit;

      if (receipt.status === "confirmed") {
        applyOptimisticGatDelta(-payDebit);
      }

      const schedulePostPayRefresh = () => {
        scheduleWalletActivityRefreshBurst(refreshWalletActivity);
      };

      const confirmPayInBackground = (hash: string) => {
        void pollPayReceiptConfirmation(hash, { timeoutMs: 120_000 }).then((result) => {
          if (result?.confirmed) {
            patchTransaction(txId, { status: t.confirmed, txHash: hash });
            applyOptimisticGatDelta(-payDebit);
            schedulePostPayRefresh();
            return;
          }
          if (result?.reverted) {
            patchTransaction(txId, { status: t.failed ?? "Gagal" });
          }
        });
      };

      if (receipt.txHash && receipt.status !== "confirmed") {
        confirmPayInBackground(receipt.txHash);
      } else if (receipt.receiptCode && !receipt.txHash) {
        void pollPayReceiptChainData(receipt.receiptCode, { attempts: 15, delayMs: 500 }).then((chain) => {
          if (!chain?.txHash) return;
          patchTransaction(txId, { txHash: chain.txHash, status: t.pending });
          confirmPayInBackground(chain.txHash);
        });
      }

      schedulePostPayRefresh();
      succeeded = true;
      setPaySuccessHint(
        receipt.status === "confirmed"
          ? pd.txFlowPaySuccessHint
          : pd.txFlowPayPendingHint,
      );
      setPayFlowPhase("success");
      showToast(
        isOnchain ? (m.paidOnchain?.(amount) ?? m.paidOffchain(amount)) : m.paidOffchain(amount),
        receipt.status === "failed" ? "error" : "success",
      );
    } catch (err) {
      showToast(payErrorToast(err), "error");
    } finally {
      if (!succeeded) {
        setPaying(false);
        setPayFlowPhase("idle");
        setPayStep("prepare");
      }
    }
  };

  const payFlowSteps: TxFlowStep[] = [
    { id: "processing", label: "Memproses", hint: pd.txFlowPleaseWait },
  ];

  const finishPayFlow = () => {
    setPaying(false);
    setPayFlowPhase("idle");
    setPayStep("prepare");
    onClose();
  };

  return (
    <>
      <ModalShell>
      {payFlowPhase === "idle" ? (
        <>
      <ModalHeader
        icon={<QrCode className="w-5 h-5" />}
        title={m.payWithGat}
        subtitle={p.subtitle}
        accent="amber"
        onClose={onClose}
      />

      <div className="gp-wallet-pay-merchant rounded-2xl border p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
          <Store className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="gp-text text-sm font-bold truncate">{merchantName}</p>
          {shopTag ? (
            <p className="gp-muted text-[10px] mt-0.5 truncate gp-num">{shopTag}</p>
          ) : null}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <BadgeCheck className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="text-emerald-400 text-[10px] font-semibold">{p.verified}</span>
            <QrChannelBadge channel={channel} />
          </div>
        </div>
        <div className="text-right shrink-0 min-w-0 max-w-[38%]">
          <p className="gp-muted text-[9px] uppercase tracking-wide">{p.merchantId}</p>
          <p className="gp-num gp-text text-[10px] font-medium truncate">{merchantId}</p>
        </div>
      </div>

      {hasInvoice ? (
        <CustomerPayInvoicePanel
          invoiceId={payScanPrefill!.invoiceId!}
          grossGat={parsedAmount}
          merchantName={merchantName}
          note={payScanPrefill?.invoiceNote}
          labels={{
            title: wa.customerInvoiceTitle ?? "Invoice Tagihan",
            invoiceNo: wa.merchantInvoiceNo ?? "No. Invoice",
            billAmount: wa.customerInvoiceBill ?? "Nominal Tagihan",
            totalPay: p.totalDebit ?? "Total Bayar",
            note: wa.merchantInvoiceNote ?? "Catatan",
            serviceFeeFootnote: wa.customerInvoiceServiceFeeFootnote
              ?? "Biaya layanan 0,0002 GAT per transaksi ditanggung merchant · Anda bayar nominal tagihan saja",
          }}
        />
      ) : (
        <>
          <div>
            <FieldLabel>{p.enterAmount}</FieldLabel>
            <p className="gp-muted text-[10px] mb-2 leading-relaxed">{p.enterAmountHint}</p>
            <div className="gp-wallet-amount-card rounded-2xl border p-4">
              <div className="flex items-center gap-3">
                <TokenIcon symbol={token} size="md" />
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  readOnly={amountLocked}
                  className={`flex-1 bg-transparent text-2xl font-black gp-num gp-text focus:outline-none min-w-0 ${amountLocked ? "opacity-90" : ""}`}
                />
                <span className="gp-text text-sm font-bold">{token}</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t gp-divider pl-12">
                <TokenPriceBadge symbol={token} />
                <span className="gp-num gp-muted text-xs">
                  {amount ? formatUsd(usdVal) : ", "}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-3 space-y-2">
            <p className="text-[11px] font-semibold text-amber-400/95">
              {wa.pastePayCodeLabel ?? "Tempel kode merchant"}
            </p>
            <p className="text-[10px] leading-relaxed gp-muted">
              {wa.pastePayCodeHint ?? "Salin payload QR dari Merchant Center, tempel di bawah, lalu ketuk Gunakan"}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={pastePayCode}
                onChange={(e) => setPastePayCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pastePayCode.trim()) applyPastedPayCode(pastePayCode);
                }}
                placeholder={wa.pastePayCodePlaceholder ?? "garuda:pay:GP-MRT-2847?..."}
                className="flex-1 min-w-0 rounded-xl border border-amber-500/30 bg-black/20 px-3 py-2.5 text-[11px] gp-text font-mono placeholder:gp-muted/60"
                spellCheck={false}
                autoCapitalize="off"
              />
              <button
                type="button"
                onClick={() => void pastePayCodeFromClipboard()}
                className="shrink-0 px-3 py-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-300 text-xs font-semibold flex items-center gap-1"
                aria-label={t.common.paste}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                {t.common.paste}
              </button>
            </div>
            <button
              type="button"
              disabled={!pastePayCode.trim()}
              onClick={() => applyPastedPayCode(pastePayCode)}
              className="w-full py-2.5 rounded-xl bg-amber-500/90 border border-amber-500 text-white text-xs font-bold disabled:opacity-45"
            >
              {wa.pastePayCodeApply ?? "Gunakan kode merchant"}
            </button>
          </div>
        </>
      )}

      {!hasInvoice && (
        <div className="flex flex-col items-center py-1">
          <div className="rounded-2xl bg-white p-2 shadow-sm">
            <QrPayloadImage payload={qrPayload} size={120} alt={`${merchantName} payment QR`} />
          </div>
          <p className="gp-muted text-[10px] text-center mt-2 px-4">{m.scanMerchant}</p>
        </div>
      )}

      <SummaryCard rows={hasInvoice ? [
        { label: p.channel, value: p.onchainChannel },
        { label: p.settlement, value: p.onchainSettlement },
      ] : [
        { label: p.channel, value: isOnchain ? p.onchainChannel : p.offchainChannel },
        { label: p.settlement, value: isOnchain ? p.onchainSettlement : p.offchainSettlement },
        { label: p.totalDebit, value: amount ? `${parsedAmount.toFixed(4)} ${token}` : ", ", highlight: !!amount },
        { label: wa.unitPrice, value: formatTokenPriceUsd(token) },
        { label: wa.valueUsd, value: amount ? formatUsd(tokenToUsd(parsedAmount, token)) : ", " },
      ]} />

      <PrimaryBtn onClick={pay} disabled={!amount || parseFloat(amount) <= 0 || paying}>
        {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
        {m.confirmPayment}
      </PrimaryBtn>
        </>
      ) : (
        <p className="gp-muted text-center text-sm py-10">{pd.txFlowPleaseWait}</p>
      )}
    </ModalShell>
    {payFlowPhase !== "idle" ? (
      <TransactionStepPanel
        title={pd.txFlowPayTitle}
        subtitle={pd.txFlowPleaseWait}
        steps={payFlowSteps}
        currentStepId="processing"
        phase={payFlowPhase === "success" ? "success" : "running"}
        accent="amber"
        successTitle={pd.txFlowPaySuccess}
        successHint={paySuccessHint || pd.txFlowPaySuccessHint}
        onSuccessDone={finishPayFlow}
      />
    ) : null}
    </>
  );
};
