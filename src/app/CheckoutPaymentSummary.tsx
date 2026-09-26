import { Info, Receipt, Tag, Wallet } from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { formatUsd } from "./PriceWithGat";
import { isGatUsingPayHubPeg } from "../lib/payhub/payHubAmounts";
import { GAT_NOT_LISTED_LABEL } from "./tokenEconomy";
import { formatGatFromUsd } from "./PriceWithGat";

const SummaryRow = ({
  label,
  value,
  gatValue,
  hint,
  labelClass = "",
  valueClass = "",
}: {
  label: string;
  value: string;
  gatValue?: string;
  hint?: string;
  labelClass?: string;
  valueClass?: string;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <p className={`gp-text text-xs ${labelClass}`}>{label}</p>
      {hint && <p className="gp-muted text-[10px] mt-0.5 leading-snug">{hint}</p>}
    </div>
    <div className="text-right shrink-0">
      <span className={`gp-num gp-text text-xs tabular-nums block ${valueClass}`}>{value}</span>
      {gatValue && (
        <span className="gp-num text-teal-500/90 text-[10px] font-semibold tabular-nums block mt-0.5">
          {gatValue}
        </span>
      )}
    </div>
  </div>
);

export const CheckoutPaymentSummary = ({
  itemCount,
  subtotalUsd,
  discountUsd,
  protocolFeeUsd,
  protocolFeeGat,
  protocolFeeLabel,
  totalUsd,
  gatTotal,
  gatRateLabel,
  showConfirmNote = false,
}: {
  itemCount: number;
  subtotalUsd: number;
  discountUsd: number;
  protocolFeeUsd?: number;
  protocolFeeGat?: number;
  protocolFeeLabel?: string;
  totalUsd: number;
  gatTotal: number;
  gatRateLabel: string;
  showConfirmNote?: boolean;
}) => {
  const { t } = useLanguage();
  const m = t.market;
  const gatNotListed = isGatUsingPayHubPeg();
  const checkoutGatLabel = (usd: number) => (gatNotListed ? GAT_NOT_LISTED_LABEL : formatGatFromUsd(usd));

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.07] to-transparent overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-3 border-b border-emerald-500/10">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
          <Receipt className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="gp-text text-sm font-bold leading-tight">{m.checkoutSummary}</p>
          <p className="gp-muted text-[10px] mt-0.5">{m.checkoutSummaryHint}</p>
        </div>
      </div>

      <div className="px-4 py-3.5 space-y-3">
        <SummaryRow
          label={m.subtotalItems(itemCount)}
          value={formatUsd(subtotalUsd)}
          gatValue={checkoutGatLabel(subtotalUsd)}
        />

        <div className="flex items-start justify-between gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5">
          <div className="flex items-start gap-2 min-w-0">
            <Tag className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="gp-text text-xs font-semibold text-emerald-500">{m.discount}</p>
              <p className="gp-muted text-[10px] mt-0.5 leading-snug">{m.discountHint}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="gp-num text-emerald-500 text-sm font-bold tabular-nums block">
              {discountUsd > 0 ? `−${formatUsd(discountUsd)}` : formatUsd(0)}
            </span>
            {discountUsd > 0 ? (
              <span className="gp-num text-teal-500/90 text-[10px] font-semibold tabular-nums block mt-0.5">
                −{formatGatFromUsd(discountUsd)}
              </span>
            ) : (
              <span className="gp-muted text-[10px] block mt-0.5">{GAT_NOT_LISTED_LABEL}</span>
            )}
          </div>
        </div>

        {(protocolFeeGat ?? 0) > 0 && (
          <SummaryRow
            label={protocolFeeLabel ?? "Protocol fee"}
            value={formatUsd(protocolFeeUsd ?? 0)}
            gatValue={gatNotListed ? GAT_NOT_LISTED_LABEL : `${protocolFeeGat!.toFixed(4)} GAT`}
            hint="Distributed to treasury buckets"
          />
        )}

        <div className="h-px bg-emerald-500/10" />

        <SummaryRow
          label={m.totalUsd}
          value={formatUsd(totalUsd)}
          gatValue={checkoutGatLabel(totalUsd)}
          labelClass="font-medium gp-muted"
          valueClass="font-bold text-sm"
        />

        <div className="rounded-xl border-2 border-emerald-500/35 bg-emerald-500/[0.1] px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="gp-text text-xs font-bold leading-tight">{m.payWithGatAmount}</p>
                {!gatNotListed && (
                  <p className="gp-muted text-[10px] mt-0.5 tabular-nums">{gatRateLabel}</p>
                )}
                {gatNotListed && (
                  <p className="gp-muted text-[10px] mt-0.5 leading-snug">{m.discountHint}</p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`gp-num text-2xl font-black leading-none tabular-nums ${
                gatNotListed ? "gp-muted text-sm font-semibold" : "text-emerald-400"
              }`}>
                {gatNotListed ? GAT_NOT_LISTED_LABEL : gatTotal.toFixed(2)}
              </p>
              {!gatNotListed && (
                <p className="gp-muted text-[10px] font-bold mt-0.5 tracking-wide">GAT</p>
              )}
            </div>
          </div>
        </div>

        {showConfirmNote && (
          <div className="rounded-xl border gp-divider bg-black/[0.02] dark:bg-white/[0.03] px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="w-3.5 h-3.5 gp-muted shrink-0" />
              <p className="gp-text text-[10px] font-semibold">{m.checkoutNoteTitle}</p>
            </div>
            <ul className="space-y-1.5">
              {m.checkoutNoteLines.map((line) => (
                <li key={line} className="gp-muted text-[10px] leading-relaxed flex gap-2">
                  <span className="text-emerald-400 shrink-0 mt-px">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export const CartCheckoutBarSummary = ({
  itemCount,
  totalUsd,
  gatTotal,
}: {
  itemCount: number;
  totalUsd: number;
  gatTotal: number;
}) => {
  const { t } = useLanguage();
  const m = t.market;

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs mt-0.5">
      <span className="gp-muted">{m.subtotalItems(itemCount)}</span>
      <span className="gp-muted opacity-40">·</span>
      <span className="gp-num gp-text font-medium tabular-nums">{formatUsd(totalUsd)}</span>
      <span className="gp-muted opacity-40">→</span>
      <span className="gp-num text-emerald-400 font-bold tabular-nums">
        {isGatUsingPayHubPeg() ? GAT_NOT_LISTED_LABEL : `${gatTotal.toFixed(2)} GAT`}
      </span>
      <span className="gp-muted text-[10px] w-full">{m.cartCheckoutSaving}</span>
    </div>
  );
};
