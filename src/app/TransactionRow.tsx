import { ArrowDownLeft, ArrowDownToLine, ArrowUpFromLine, Repeat2, Send, ShoppingBag, TrendingUp } from "lucide-react";
import type { Tx } from "./AppContext";
import { GP_SEP_INLINE } from "./garudaUi";
import { formatTxDisplayTime, formatTxUsdDisplay } from "../lib/user/txDisplay";
import { useLanguage } from "./LanguageContext";
import { useTxCounterpartyLabel } from "../hooks/useTxCounterpartyLabel";

export const txVisual = (type: string | undefined) => {
  const kind = (type ?? "send").toLowerCase();
  if (kind === "receive" || kind === "deposit") {
    return {
      icon: kind === "deposit"
        ? <ArrowUpFromLine className="w-4 h-4 text-cyan-400" />
        : <ArrowDownLeft className="w-4 h-4 text-emerald-400" />,
      bg: kind === "deposit" ? "bg-cyan-500/15" : "bg-emerald-500/15",
      amountClass: kind === "deposit" ? "text-cyan-400" : "text-emerald-400",
    };
  }
  if (kind === "withdraw") {
    return {
      icon: <ArrowDownToLine className="w-4 h-4 text-amber-400" />,
      bg: "bg-amber-500/15",
      amountClass: "text-amber-400",
    };
  }
  if (kind === "invest") {
    return {
      icon: <TrendingUp className="w-4 h-4 text-amber-400" />,
      bg: "bg-amber-500/15",
      amountClass: "gp-text-secondary",
    };
  }
  if (kind === "swap") {
    return {
      icon: <Repeat2 className="w-4 h-4 text-violet-400" />,
      bg: "bg-violet-500/15",
      amountClass: "gp-text-secondary",
    };
  }
  if (kind === "pay") {
    return {
      icon: <ShoppingBag className="w-4 h-4 text-indigo-400" />,
      bg: "bg-indigo-500/15",
      amountClass: "gp-text-secondary",
    };
  }
  return {
    icon: <Send className="w-4 h-4 text-red-400" />,
    bg: "bg-red-500/15",
    amountClass: "gp-text-secondary",
  };
};

export const resolveTxTypeLabel = (
  type: string,
  labels: {
    receive: string;
    send: string;
    invest: string;
    deposit?: string;
    withdraw?: string;
    pay?: string;
    swap?: string;
  },
) => {
  const kind = type.toLowerCase();
  if (kind === "receive") return labels.receive;
  if (kind === "invest") return labels.invest;
  if (kind === "deposit") return labels.deposit ?? "Deposit";
  if (kind === "withdraw") return labels.withdraw ?? "Withdraw";
  if (kind === "pay") return labels.pay ?? "Pay";
  if (kind === "swap") return labels.swap ?? "Swap";
  return labels.send;
};

export const TransactionRow = ({
  tx,
  onClick,
  className = "",
}: {
  tx: Tx;
  onClick?: () => void;
  className?: string;
}) => {
  const { t } = useLanguage();
  const m = t.modals;
  const v = txVisual(tx.type);
  const typeLabel = resolveTxTypeLabel(tx.type, {
    receive: m.txTypeReceive,
    send: m.txTypeSend,
    invest: m.txTypeInvest,
    deposit: m.txTypeDeposit,
    withdraw: m.txTypeWithdraw,
    pay: m.txTypePay,
    swap: m.txTypeSwap,
  });
  const displayTime = formatTxDisplayTime(tx.time);
  const displayUsd = formatTxUsdDisplay(tx);
  const txKind = (tx.type ?? "send").toLowerCase();
  const counterparty = useTxCounterpartyLabel(tx);
  const showCounterparty = (txKind === "send" || txKind === "receive" || txKind === "pay")
    && counterparty.trim().length > 0;
  const showUsd = displayUsd.trim().length > 0;
  const inner = (
    <>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${v.bg}`}>
        {v.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="gp-text text-sm font-medium truncate">{typeLabel}</p>
        {showCounterparty && (
          <p className="gp-muted text-[10px] truncate mt-0.5">{counterparty}</p>
        )}
        <p className="gp-muted text-[10px] mt-0.5">{displayTime}{GP_SEP_INLINE}{tx.status}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm gp-num font-semibold ${v.amountClass}`}>{tx.amount}</p>
        {showUsd ? (
          <p className="gp-muted text-[11px] gp-num">{displayUsd}</p>
        ) : null}
      </div>
    </>
  );

  if (!onClick) {
    return (
      <div className={`p-3.5 flex items-center gap-3 gp-glass backdrop-blur-xl border rounded-2xl ${className}`}>
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`w-full p-3.5 flex items-center gap-3 gp-glass backdrop-blur-xl border rounded-2xl text-left gp-hover-row transition-all active:scale-[0.99] cursor-pointer ${className}`}
    >
      {inner}
    </button>
  );
};
