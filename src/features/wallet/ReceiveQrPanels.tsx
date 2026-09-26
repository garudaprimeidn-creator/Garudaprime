import React, { useEffect } from "react";
import { BadgeCheck, Copy, Download, FileText, Link2, Loader2, RefreshCw, Share2, Store, X, Zap } from "lucide-react";
import { encodeReceiveQrPayload } from "../../lib/qr/parseQrPayload";
import { warmQrImageCache } from "../../lib/qr/qrImageCache";
import { resolveWalletMoneyAddress } from "../../lib/web3/connectedWalletUtils";
import { useApp } from "../../app/AppContext";
import { useAuth } from "../../contexts/AuthContext";
import { MAIN_NETWORK, isTokenPriceListed, tokenToUsd } from "../../app/tokenEconomy";
import { TokenIcon } from "../../app/TokenIcon";
import {
  computeMerchantServiceFee,
  formatIdr,
  formatMerchantServiceFeeGat,
} from "../../lib/merchant/merchantMdr";
import { QrPayloadImage } from "./QrPayloadImage";

const QR_SIZE = 176;

function QrFrame({
  children,
  accent = "white",
}: {
  children: React.ReactNode;
  accent?: "white" | "amber" | "cyan";
}) {
  const ring = accent === "amber"
    ? "ring-amber-500/20"
    : accent === "cyan"
      ? "ring-cyan-500/20"
      : "ring-black/5";
  return (
    <div className={`rounded-2xl bg-white p-2.5 shadow-sm ring-1 ${ring}`}>
      {children}
    </div>
  );
}

type MerchantPanelProps = {
  merchantId: string;
  merchantName: string;
  qrPayload: string;
  hint: string;
  emptyLabel: string;
  verifiedLabel: string;
  merchantIdLabel: string;
  showSkeleton?: boolean;
  requestAmount?: string;
  onRequestAmountChange?: (value: string) => void;
  requestAmountLabel?: string;
  requestAmountHint?: string;
  requestAmountPlaceholder?: string;
  clearAmountLabel?: string;
  requestAmountOptionalLabel?: string;
  requestAmountEmptyHint?: string;
  merchantNetHint?: (gross: number, net: number, fee: string) => string;
  invoiceNote?: string;
  onInvoiceNoteChange?: (value: string) => void;
  invoiceNoteLabel?: string;
  invoiceNotePlaceholder?: string;
};

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function MerchantRequestAmountField({
  value,
  onChange,
  label,
  hint,
  placeholder = "0.00",
  clearLabel = "Hapus",
  optionalLabel = "Opsional",
  emptyHint = "Kosongkan jika pelanggan tentukan nominal sendiri",
  merchantNetHint,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  hint: string;
  placeholder?: string;
  clearLabel?: string;
  optionalLabel?: string;
  emptyHint?: string;
  merchantNetHint?: (gross: number, net: number, fee: string) => string;
}) {
  const parsed = parseFloat(value.trim());
  const hasAmount = Number.isFinite(parsed) && parsed > 0;
  const feePreview = hasAmount ? computeMerchantServiceFee({ grossGat: parsed, gatUsdPrice: tokenToUsd(1, "GAT") }) : null;
  const gatListed = isTokenPriceListed("GAT");

  return (
    <div className="w-full mb-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] overflow-hidden">
      <div className="px-3.5 pt-3 pb-2 border-b border-amber-500/15">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="gp-text text-xs font-bold">{label}</p>
              <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400/90">
                {optionalLabel}
              </span>
            </div>
            <p className="gp-muted text-[10px] mt-1 leading-relaxed">
              {hasAmount ? hint : emptyHint}
            </p>
          </div>
          {hasAmount && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400/90 hover:text-amber-300 transition-colors shrink-0"
            >
              <X className="w-3 h-3" />
              {clearLabel}
            </button>
          )}
        </div>
      </div>

      <div className="px-3.5 py-3">
        <div className="flex items-center gap-3">
          <TokenIcon symbol="GAT" size="md" />
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              const next = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
              if ((next.match(/\./g) ?? []).length <= 1) onChange(next);
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-2xl font-black gp-num gp-text focus:outline-none min-w-0 placeholder:text-white/20"
          />
          <span className="text-xs font-bold text-amber-400 shrink-0">GAT</span>
        </div>
        {hasAmount && gatListed && (
          <p className="gp-muted gp-num text-[11px] mt-2 pl-12">
            ≈ {formatUsd(tokenToUsd(parsed, "GAT"))}
            {feePreview && feePreview.grossIdr > 0 ? ` · ${formatIdr(feePreview.grossIdr)}` : ""}
          </p>
        )}
      </div>

      {hasAmount && feePreview && (
        <div className="px-3.5 py-2.5 bg-black/15 border-t border-amber-500/15 space-y-1">
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="gp-muted">Pelanggan bayar</span>
            <span className="gp-num gp-text font-semibold">{parsed.toFixed(4)} GAT</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="gp-muted">Anda terima (neto)</span>
            <span className="gp-num text-emerald-400 font-semibold">{feePreview.netGat.toFixed(4)} GAT</span>
          </div>
          <p className="gp-muted text-[9px] leading-relaxed pt-0.5">
            {merchantNetHint
              ? merchantNetHint(parsed, feePreview.netGat, formatMerchantServiceFeeGat())
              : `Biaya layanan ${formatMerchantServiceFeeGat()} ditanggung merchant`}
          </p>
        </div>
      )}
    </div>
  );
}

/** Invoice tagihan, tampil di layar Bayar (pelanggan), bukan di Terima merchant. */
export type CustomerPayInvoicePanelProps = {
  invoiceId: string;
  grossGat: number;
  merchantName: string;
  note?: string;
  labels: {
    title: string;
    invoiceNo: string;
    billAmount: string;
    totalPay: string;
    note: string;
    serviceFeeFootnote: string;
  };
};

export function CustomerPayInvoicePanel({
  invoiceId,
  grossGat,
  merchantName,
  note,
  labels,
}: CustomerPayInvoicePanelProps) {
  const gatUsd = tokenToUsd(1, "GAT");
  const fee = computeMerchantServiceFee({ grossGat, gatUsdPrice: gatUsd });
  const gatListed = isTokenPriceListed("GAT");

  return (
    <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.06] overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-indigo-500/15 flex items-center gap-2">
        <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
        <p className="gp-text text-xs font-bold">{labels.title}</p>
      </div>
      <div className="px-3.5 py-3 space-y-2 text-[11px]">
        <div className="flex justify-between gap-3">
          <span className="gp-muted shrink-0">{labels.invoiceNo}</span>
          <span className="gp-num gp-text font-medium text-right break-all">{invoiceId}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="gp-muted shrink-0">Merchant</span>
          <span className="gp-text font-medium text-right truncate">{merchantName}</span>
        </div>
        {note?.trim() && (
          <div className="rounded-lg border border-white/5 bg-black/10 px-2.5 py-2">
            <span className="gp-muted">{labels.note}: </span>
            <span className="gp-text">{note.trim()}</span>
          </div>
        )}
        <div className="rounded-lg border border-white/8 bg-black/10 px-3 py-2.5 space-y-2">
          <div className="flex justify-between gap-3 items-center">
            <span className="gp-muted">{labels.billAmount}</span>
            <span className="gp-num gp-text font-semibold text-right">
              {grossGat.toFixed(4)} GAT
              {gatListed && fee.grossIdr > 0 ? (
                <span className="block gp-muted text-[10px] font-normal">{formatIdr(fee.grossIdr)}</span>
              ) : null}
            </span>
          </div>
          <div className="flex justify-between gap-3 items-center pt-2 border-t border-white/8">
            <span className="gp-text font-bold">{labels.totalPay}</span>
            <span className="gp-num text-emerald-400 font-black text-sm">{grossGat.toFixed(4)} GAT</span>
          </div>
        </div>
        <p className="gp-muted text-[9px] leading-relaxed text-center px-1">
          {labels.serviceFeeFootnote}
        </p>
      </div>
    </div>
  );
}

export function MerchantReceiveQrPanel({
  merchantId,
  merchantName,
  qrPayload,
  hint,
  emptyLabel,
  verifiedLabel,
  merchantIdLabel,
  showSkeleton,
  requestAmount = "",
  onRequestAmountChange,
  requestAmountLabel,
  requestAmountHint,
  requestAmountPlaceholder,
  clearAmountLabel,
  requestAmountOptionalLabel,
  requestAmountEmptyHint,
  merchantNetHint,
  invoiceNote = "",
  onInvoiceNoteChange,
  invoiceNoteLabel,
  invoiceNotePlaceholder,
}: MerchantPanelProps) {
  useEffect(() => {
    if (qrPayload) warmQrImageCache(qrPayload, QR_SIZE);
  }, [qrPayload]);

  const parsedAmount = parseFloat(requestAmount.trim());
  const hasRequestAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

  return (
    <div className="gp-wallet-scanner relative rounded-2xl border overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.05] via-transparent to-orange-500/[0.03] pointer-events-none" />

      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2 relative z-10">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border bg-amber-500/10 border-amber-500/25 text-amber-500">
          <Store className="w-3 h-3 shrink-0" />
          ID Merchant
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-semibold shrink-0">
          <Link2 className="w-3 h-3" />
          On-Chain
        </span>
      </div>

      <div className="flex flex-col items-center px-4 pb-4 relative z-10">
        <div className="w-full gp-wallet-pay-merchant rounded-xl border p-3.5 flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
            <Store className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="gp-text text-sm font-bold truncate">{merchantName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <BadgeCheck className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="text-emerald-400 text-[10px] font-semibold">{verifiedLabel}</span>
            </div>
          </div>
          <div className="text-right shrink-0 min-w-0 max-w-[42%]">
            <p className="gp-muted text-[9px] uppercase tracking-wide">{merchantIdLabel}</p>
            <p className="gp-num gp-text text-[10px] font-medium truncate">{merchantId}</p>
          </div>
        </div>

        {onRequestAmountChange && requestAmountLabel && requestAmountHint && (
          <MerchantRequestAmountField
            value={requestAmount}
            onChange={onRequestAmountChange}
            label={requestAmountLabel}
            hint={requestAmountHint}
            placeholder={requestAmountPlaceholder}
            clearLabel={clearAmountLabel}
            optionalLabel={requestAmountOptionalLabel}
            emptyHint={requestAmountEmptyHint}
            merchantNetHint={merchantNetHint}
          />
        )}

        {hasRequestAmount && onInvoiceNoteChange && invoiceNoteLabel && (
          <div className="w-full mb-3">
            <p className="gp-muted text-[10px] font-semibold uppercase tracking-widest mb-1.5">{invoiceNoteLabel}</p>
            <input
              type="text"
              value={invoiceNote}
              onChange={(e) => onInvoiceNoteChange(e.target.value)}
              placeholder={invoiceNotePlaceholder}
              className="w-full rounded-xl border border-amber-500/25 bg-black/10 px-3 py-2.5 text-[11px] gp-text focus:outline-none focus:border-amber-500/40"
            />
          </div>
        )}

        {showSkeleton && !qrPayload ? (
          <div
            className="rounded-2xl bg-white flex items-center justify-center"
            style={{ width: QR_SIZE + 20, height: QR_SIZE + 20 }}
          >
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          </div>
        ) : (
          <QrFrame accent="amber">
            <QrPayloadImage
              payload={qrPayload}
              size={QR_SIZE}
              alt={`${merchantName} merchant QR`}
              emptyLabel={emptyLabel}
            />
          </QrFrame>
        )}

        <p className="gp-muted text-[11px] text-center mt-3 px-2 leading-relaxed">{hint}</p>
      </div>
    </div>
  );
}

type MerchantReceiveSectionProps = {
  merchantId: string;
  merchantName: string;
  qrPayload: string;
  requestAmount: string;
  onRequestAmountChange: (value: string) => void;
  hasRequestAmount: boolean;
  loading: boolean;
  ready: boolean;
  onRefresh: () => void;
  hint: string;
  hintWithAmount?: string;
  emptyLabel: string;
  verifiedLabel: string;
  merchantIdLabel: string;
  requestAmountLabel: string;
  requestAmountHint: string;
  requestAmountPlaceholder?: string;
  clearAmountLabel?: string;
  requestAmountOptionalLabel?: string;
  requestAmountEmptyHint?: string;
  merchantNetHint?: (gross: number, net: number, fee: string) => string;
  invoiceNote?: string;
  onInvoiceNoteChange?: (value: string) => void;
  invoiceNoteLabel?: string;
  invoiceNotePlaceholder?: string;
  refreshLabel: string;
  copyLabel: string;
  saveQrLabel: string;
  shareLabel: string;
  onCopy: () => void;
  onSaveQr: () => void;
  onShareQr: () => void;
};

export function MerchantReceiveActions({
  loading,
  merchantIdLabel,
  saveQrLabel,
  shareLabel,
  onCopyId,
  onSaveQr,
  onShareQr,
}: {
  loading: boolean;
  merchantIdLabel: string;
  saveQrLabel: string;
  shareLabel: string;
  onCopyId: () => void;
  onSaveQr: () => void;
  onShareQr: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={loading}
          onClick={onCopyId}
          className="gp-wallet-secondary flex items-center justify-center gap-2 py-3 rounded-2xl border text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Copy className="w-4 h-4 text-amber-400" />
          {merchantIdLabel}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onSaveQr}
          className="gp-wallet-secondary flex items-center justify-center gap-2 py-3 rounded-2xl border text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Download className="w-4 h-4 text-cyan-400" />
          {saveQrLabel}
        </button>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={onShareQr}
        className="w-full flex items-center justify-center gap-2 gp-muted text-xs py-2 transition-colors hover:gp-text disabled:opacity-50"
      >
        <Share2 className="w-3.5 h-3.5" />
        {shareLabel}
      </button>
    </>
  );
}

/** Merchant receive, amount request, QR, and copy/save/share actions in one block. */
export function MerchantReceiveSection({
  merchantId,
  merchantName,
  qrPayload,
  requestAmount,
  onRequestAmountChange,
  hasRequestAmount,
  loading,
  ready,
  onRefresh,
  hint,
  hintWithAmount,
  emptyLabel,
  verifiedLabel,
  merchantIdLabel,
  requestAmountLabel,
  requestAmountHint,
  requestAmountPlaceholder,
  clearAmountLabel,
  requestAmountOptionalLabel,
  requestAmountEmptyHint,
  merchantNetHint,
  invoiceNote,
  onInvoiceNoteChange,
  invoiceNoteLabel,
  invoiceNotePlaceholder,
  refreshLabel,
  copyLabel,
  saveQrLabel,
  shareLabel,
  onCopy,
  onSaveQr,
  onShareQr,
}: MerchantReceiveSectionProps) {
  return (
    <>
      <MerchantReceiveQrPanel
        merchantId={merchantId}
        merchantName={merchantName}
        qrPayload={qrPayload}
        hint={hasRequestAmount && hintWithAmount ? hintWithAmount : hint}
        emptyLabel={emptyLabel}
        verifiedLabel={verifiedLabel}
        merchantIdLabel={merchantIdLabel}
        showSkeleton={loading && !ready}
        requestAmount={requestAmount}
        onRequestAmountChange={onRequestAmountChange}
        requestAmountLabel={requestAmountLabel}
        requestAmountHint={requestAmountHint}
        requestAmountPlaceholder={requestAmountPlaceholder}
        clearAmountLabel={clearAmountLabel}
        requestAmountOptionalLabel={requestAmountOptionalLabel}
        requestAmountEmptyHint={requestAmountEmptyHint}
        merchantNetHint={merchantNetHint}
        invoiceNote={invoiceNote}
        onInvoiceNoteChange={onInvoiceNoteChange}
        invoiceNoteLabel={invoiceNoteLabel}
        invoiceNotePlaceholder={invoiceNotePlaceholder}
      />
      {!ready && !loading && (
        <button
          type="button"
          onClick={onRefresh}
          className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-amber-400 mx-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {refreshLabel}
        </button>
      )}
      <MerchantReceiveActions
        loading={loading}
        merchantIdLabel={copyLabel}
        saveQrLabel={saveQrLabel}
        shareLabel={shareLabel}
        onCopyId={onCopy}
        onSaveQr={onSaveQr}
        onShareQr={onShareQr}
      />
    </>
  );
}

type AssetPanelProps = {
  walletAddress: string;
  addressLabel: string;
  hint: string;
  emptyLabel?: string;
};

export function AssetReceiveQrPanel({
  walletAddress,
  addressLabel,
  hint,
  emptyLabel = "Alamat dompet belum siap",
}: AssetPanelProps) {
  const { connectedWallet, userProfile } = useAuth();
  const { walletAddress: appWallet } = useApp();

  const resolvedAddress = walletAddress
    || resolveWalletMoneyAddress({
      profileAddress: userProfile?.walletAddress,
      connectedWallet,
      fallbackAddress: appWallet,
    })
    || "";

  const payload = resolvedAddress ? encodeReceiveQrPayload(resolvedAddress) : "";
  const short = resolvedAddress.length >= 10
    ? `${resolvedAddress.slice(0, 8)}…${resolvedAddress.slice(-6)}`
    : ", ";

  useEffect(() => {
    if (payload) warmQrImageCache(payload, QR_SIZE);
  }, [payload]);

  return (
    <div className="gp-wallet-scanner relative rounded-2xl border overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/[0.05] via-transparent to-emerald-500/[0.03] pointer-events-none" />

      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-2 relative z-10">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border bg-cyan-500/12 border-cyan-500/30 text-cyan-400">
          <Zap className="w-3 h-3 shrink-0" />
          Terima Aset
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-semibold shrink-0">
          <Zap className="w-3 h-3" />
          {MAIN_NETWORK.name}
        </span>
      </div>

      <div className="flex flex-col items-center px-4 pb-4 relative z-10">
        {!resolvedAddress ? (
          <div
            className="rounded-2xl bg-white flex items-center justify-center"
            style={{ width: QR_SIZE + 20, height: QR_SIZE + 20 }}
          >
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        ) : (
          <QrFrame accent="cyan">
            <QrPayloadImage
              payload={payload}
              size={QR_SIZE}
              alt="Wallet receive QR"
              emptyLabel={emptyLabel}
            />
          </QrFrame>
        )}

        <p className="gp-muted text-[11px] text-center mt-3 px-2">{hint}</p>

        <div className="mt-3 w-full gp-wallet-address-card rounded-2xl border p-3.5 text-center">
          <p className="gp-muted text-[10px] font-semibold uppercase tracking-widest mb-1.5">{addressLabel}</p>
          <p className="gp-text gp-num text-xs font-medium break-all leading-relaxed">{short}</p>
          <p className="gp-muted text-[10px] mt-1.5">{MAIN_NETWORK.name}</p>
        </div>
      </div>
    </div>
  );
}

export { QR_SIZE as RECEIVE_QR_SIZE };
