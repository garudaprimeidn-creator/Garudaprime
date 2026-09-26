import React, { useEffect, useState } from "react";
import {
  X, Send, ArrowDownLeft, ShoppingBag, TrendingUp, ZoomIn, Zap,
  Star, Store, Tag, ShieldCheck, ExternalLink,
} from "lucide-react";
import { sidraExplorerTxUrl } from "../lib/web3/sidraExplorer";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { showAppToast } from "./appToast";
import { TokenIcon } from "./TokenIcon";
import { displayTokenSymbol, tokenToUsd, MAIN_NETWORK, type TokenRow } from "./tokenEconomy";
import { txVisual, resolveTxTypeLabel } from "./TransactionRow";
import type { Tx } from "./AppContext";
import { formatTxDisplayTime, formatTxUsdDisplay, isMerchantPayHubReceive } from "../lib/user/txDisplay";
import { ProductThumbGallery } from "./ProductThumbGallery";
import { ProductThumb } from "./ProductThumb";
import { FullscreenImageViewer } from "./FullscreenImageViewer";
import { getProductImages } from "../lib/merchant/productImages";
import { PriceWithGat, formatUsd } from "./PriceWithGat";
import { formatTokenPriceUsd } from "./tokenEconomy";
import { calcInvestProfit, parseApr } from "../lib/invest/investPortfolio";
import { fundSlotsLeft, formatCapacityUsd, isFundAlmostFull, type InvestmentFund } from "./investData";
import { GP_SEP_INLINE } from "./garudaUi";
import { useTxCounterpartyLabel } from "../hooks/useTxCounterpartyLabel";
import { pollPayReceiptChainData, subscribePayReceiptChainData } from "../lib/payhub/payReceiptSync";
import { extractReceiptCode } from "../lib/user/transactionDedup";
import { enrichReceiveTransaction } from "../lib/user/enrichReceiveTransaction";
import { isMeaningfulTxField } from "../lib/user/txCounterpartyDisplay";
import { formatMerchantShopTag } from "../lib/merchant/merchantDisplay";
import { receivePanelViewForToken } from "../lib/wallet/receivePanelView";

type Investment = {
  id: number; name: string; type: string; typeColor: string; apr: string; min: number;
  term: string; raised: number; capacityUsd?: number; round?: string;
  myInvest: number; myProfit: number; cert: string;
  category: string; risk: string; icon: React.ReactNode;
};
type Product = {
  id: number; name: string; price: number; seller: string; cat: string;
  rating: number; orders: number; emoji?: string; imageUrl?: string; imageUrls?: string[];
  description?: string; merchantId?: string; shopSymbol?: string; shopLocation?: string;
};

const findTokenDetail = (tokens: TokenRow[], detail: ReturnType<typeof useApp>["detail"]) => {
  if (detail?.kind !== "token") return undefined;
  if (detail.contractAddress) {
    const addr = detail.contractAddress.toLowerCase();
    return tokens.find((tok) => tok.contractAddress?.toLowerCase() === addr);
  }
  return tokens.find((tok) => tok.symbol === detail.symbol);
};

const EmeraldBtn = ({
  children, onClick, className = "", variant = "solid", size = "md", disabled,
}: {
  children: React.ReactNode; onClick?: () => void; className?: string;
  variant?: "solid" | "outline" | "danger"; size?: "sm" | "md" | "lg"; disabled?: boolean;
}) => {
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2.5 text-sm", lg: "px-5 py-3.5 text-base" };
  const variants = {
    solid: "bg-gradient-to-r from-emerald-500 to-teal-400 text-black hover:from-emerald-400 hover:to-teal-300 shadow-lg shadow-emerald-500/20",
    outline: "border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10",
    danger: "border border-red-500/40 text-red-400 hover:bg-red-500/10",
  };
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all active:scale-[0.97] disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`gp-glass backdrop-blur-xl border rounded-2xl ${className}`}>{children}</div>
);


const formatTxHash = (tx: Tx, full = false) => {
  if (tx.txHash) {
    if (full) return tx.txHash;
    return tx.txHash.length > 14
      ? `${tx.txHash.slice(0, 8)}…${tx.txHash.slice(-4)}`
      : tx.txHash;
  }
  return full ? "" : "·";
};

export const TransactionDetailModal = ({
  txId, transactions, onClose,
}: { txId: number; transactions: Tx[]; onClose: () => void }) => {
  const { copyText, patchTransaction, walletAddress } = useApp();
  const { t } = useLanguage();
  const m = t.modals;
  const tx = transactions.find((item) => item.id === txId);
  const counterpartyName = useTxCounterpartyLabel(tx ?? {
    id: txId,
    type: "send",
    amount: "",
    addr: "",
    time: "",
    usd: "",
    status: "",
  });

  useEffect(() => {
    const receiptCode = extractReceiptCode(tx ?? { addr: "" });
    if (!receiptCode) return;
    if (tx?.txHash?.trim() && tx?.invoiceId?.trim()) return;
    const kind = (tx?.type ?? "").toLowerCase();
    if (kind !== "pay" && kind !== "receive") return;

    const applyChain = (chain: { txHash?: string; feeAmountGat?: number; invoiceId?: string }) => {
      if (!chain.txHash && !chain.invoiceId) return;
      patchTransaction(tx!.id, {
        ...(chain.txHash ? { txHash: chain.txHash } : {}),
        receiptCode,
        ...(chain.feeAmountGat != null && kind === "receive" && !tx?.networkFee?.trim()
          ? { networkFee: `${chain.feeAmountGat.toFixed(4)} GAT` }
          : {}),
        ...(chain.invoiceId && !tx?.invoiceId?.trim() ? { invoiceId: chain.invoiceId } : {}),
        status: t.confirmed,
      });
    };

    let cancelled = false;
    const unsub = subscribePayReceiptChainData(receiptCode, (chain) => {
      if (cancelled) return;
      applyChain(chain);
    });

    void pollPayReceiptChainData(receiptCode, { attempts: 24, delayMs: 800 }).then((chain) => {
      if (cancelled || !chain) return;
      applyChain(chain);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [tx?.id, tx?.type, tx?.receiptCode, tx?.addr, tx?.txHash, tx?.networkFee, tx?.invoiceId, patchTransaction, t.confirmed]);

  useEffect(() => {
    if (!tx || !walletAddress) return;
    if ((tx.type ?? "").toLowerCase() !== "receive") return;
    if (tx.counterpartyWallet?.trim() && tx.txHash?.trim()) return;

    let cancelled = false;
    void enrichReceiveTransaction(walletAddress, tx).then((patch) => {
      if (cancelled || !patch) return;
      patchTransaction(tx.id, patch);
    });
    return () => { cancelled = true; };
  }, [tx, walletAddress, patchTransaction]);

  if (!tx) {
    return (
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="gp-text font-bold text-lg">{m.txDetailTitle}</h3>
          <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1"><X className="w-5 h-5" /></button>
        </div>
        <p className="gp-muted text-sm text-center py-6">Transaksi tidak ditemukan</p>
      </div>
    );
  }

  const v = txVisual(tx.type ?? "send");
  const typeLabel = resolveTxTypeLabel(tx.type ?? "send", {
    receive: m.txTypeReceive,
    send: m.txTypeSend,
    invest: m.txTypeInvest,
    deposit: m.txTypeDeposit,
    withdraw: m.txTypeWithdraw,
    pay: m.txTypePay,
    swap: m.txTypeSwap,
  });
  const txKind = (tx.type ?? "send").toLowerCase();
  const merchantReceipt = extractReceiptCode(tx);
  const displayTime = formatTxDisplayTime(tx.time);
  const displayUsd = formatTxUsdDisplay(tx);
  const isConfirmed = (tx.status ?? "").toLowerCase().includes("confirm") || tx.status === t.confirmed;
  const statusLabel = isConfirmed ? t.confirmed : tx.status;
  const showNetworkFee = txKind !== "pay" && isMeaningfulTxField(tx.networkFee);
  const feeDisplay = tx.networkFee?.trim() ?? null;
  const showUsdRow = !isMerchantPayHubReceive(tx) && isMeaningfulTxField(displayUsd);
  const hasTxHash = Boolean(tx.txHash?.trim());

  const partyRows = (() => {
    if (txKind === "send") {
      return <Row label={m.txRecipient} value={counterpartyName} />;
    }
    if (txKind === "receive") {
      return <Row label={m.txSender} value={counterpartyName} />;
    }
    const counterpartyRowLabel = txKind === "pay"
      ? (m.txMerchant ?? m.txRecipient)
      : txKind === "deposit" || txKind === "withdraw"
        ? "Pay Hub"
        : m.txCounterparty;
    return <Row label={counterpartyRowLabel} value={counterpartyName} />;
  })();

  const receiptCode = merchantReceipt;
  const invoiceNo = tx.invoiceId?.trim();

  return (
    <div className="space-y-4 p-5 max-h-[85vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${v.bg}`}>
            {v.icon}
          </div>
          <div>
            <h3 className="gp-text font-bold text-lg leading-tight">{m.txDetailTitle}</h3>
            <p className="gp-muted text-xs mt-0.5">{typeLabel}{GP_SEP_INLINE}{displayTime}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1"><X className="w-5 h-5" /></button>
      </div>

      <GlassCard className="p-4 text-center">
        <p className={`text-2xl font-black gp-num ${v.amountClass}`}>{tx.amount}</p>
        {showUsdRow ? (
          <p className="gp-muted gp-num text-sm mt-1">{displayUsd}</p>
        ) : null}
        <span className={`inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${
          isConfirmed ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
        }`}>
          {statusLabel}
        </span>
      </GlassCard>

      <GlassCard className="p-4 space-y-2.5">
        <Row label={m.txType} value={typeLabel} />
        {partyRows}
        <Row label={m.txAmount} value={tx.amount} />
        {showUsdRow ? <Row label={m.txValueUsd} value={displayUsd} /> : null}
        <Row label={m.txTime} value={displayTime} />
        <Row label={m.txStatus} value={statusLabel} />
        <Row label={m.txNetwork} value={MAIN_NETWORK.name} />
        {showNetworkFee && feeDisplay ? <Row label={m.txFee} value={feeDisplay} /> : null}
        {txKind === "pay" && (
          <p className="gp-muted text-[10px] leading-relaxed pt-1 border-t border-white/5">
            {m.txPayFeeMerchantNote ?? "Biaya layanan ditanggung merchant · tidak dipotong dari nominal bayar Anda"}
          </p>
        )}
        {txKind === "receive" && merchantReceipt && (
          <p className="gp-muted text-[10px] leading-relaxed pt-1 border-t border-white/5">
            {m.txReceiveMerchantNote ?? "Pembayaran GAT via Pay Hub · nilai USD tidak ditampilkan"}
          </p>
        )}
        {invoiceNo ? <Row label={m.txInvoiceNo} value={invoiceNo} mono /> : null}
        {(txKind === "pay" || (txKind === "receive" && merchantReceipt)) && tx.merchantId?.trim() ? (
          <Row label={m.txMerchantId ?? m.txMerchant} value={tx.merchantId} mono />
        ) : null}
        {receiptCode ? (
          <div className="flex items-start justify-between gap-3 pt-1">
            <span className="gp-muted text-xs shrink-0">{m.txReceiptCode}</span>
            <button
              type="button"
              onClick={() => void copyText(receiptCode, m.txReceiptCode)}
              className="gp-text text-xs gp-num text-right break-all hover:text-emerald-400 transition-colors font-medium"
            >
              {receiptCode}
            </button>
          </div>
        ) : null}
        {(hasTxHash || receiptCode) ? (
        <div className="flex items-start justify-between gap-3 pt-1">
          <span className="gp-muted text-xs shrink-0">{m.txHash}</span>
          {hasTxHash ? (
            <div className="flex flex-col items-end gap-1 min-w-0">
              <button
                type="button"
                onClick={() => void copyText(tx.txHash!, m.txHash)}
                className="gp-text text-xs gp-num text-right break-all hover:text-emerald-400 transition-colors"
              >
                {formatTxHash(tx)}
              </button>
              <a
                href={sidraExplorerTxUrl(tx.txHash!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-emerald-400/90 hover:text-emerald-300"
              >
                {m.viewOnExplorer ?? "Blockscout"}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          ) : (
            <span className="gp-muted text-[10px] leading-snug text-right max-w-[200px]">
              {m.txHashPending}
            </span>
          )}
        </div>
        ) : null}
      </GlassCard>
    </div>
  );
};

const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="gp-muted text-xs shrink-0">{label}</span>
    <span className={`gp-text text-xs text-right ${mono ? "gp-num break-all" : "font-medium"}`}>{value}</span>
  </div>
);

export const TokenDetailModal = ({ tokens, onClose }: { tokens: TokenRow[]; onClose: () => void }) => {
  const { detail, requestReceiveOverlay, requestSendOverlay } = useApp();
  const { t } = useLanguage();
  const c = t.common;
  const token = findTokenDetail(tokens, detail);
  if (!token) return null;
  const displaySymbol = displayTokenSymbol(token.symbol);

  return (
    <div className="space-y-4 p-5 max-h-[85vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TokenIcon
            symbol={token.symbol}
            size="lg"
            color={token.color}
            logoUrl={token.logoUrl}
            contractAddress={token.contractAddress}
          />
          <h3 className="gp-text font-bold text-lg">{displaySymbol}</h3>
        </div>
        <button onClick={onClose} className="gp-muted gp-icon-btn p-1"><X className="w-5 h-5" /></button>
      </div>
      <GlassCard className="p-4 text-center">
        <p className="gp-muted text-xs mb-1">{token.name}</p>
        <p className="text-3xl font-black gp-text gp-num">{formatUsd(token.usd)}</p>
        <p className={`text-sm mt-1 ${token.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>{token.change >= 0 ? "+" : ""}{token.change}% (24h)</p>
      </GlassCard>
      <div className="grid grid-cols-2 gap-2">
        <EmeraldBtn onClick={() => {
          requestSendOverlay({
            symbol: token.symbol,
            ...(token.contractAddress ? { contractAddress: token.contractAddress } : {}),
          });
        }}><Send className="w-4 h-4" /> {c.send}</EmeraldBtn>
        <EmeraldBtn variant="outline" onClick={() => {
          onClose();
          requestReceiveOverlay(receivePanelViewForToken(token.symbol));
        }}><ArrowDownLeft className="w-4 h-4" /> {c.receive}</EmeraldBtn>
      </div>
    </div>
  );
};

export const FundDetailModal = ({
  investments, onClose,
}: { investments: Investment[]; onClose: () => void }) => {
  const { detail, requestOverlay, investedFunds, investPositions, openInvestTab } = useApp();
  const { t } = useLanguage();
  const m = t.modals;
  const il = t.invest;
  const fund = investments.find((f) => f.id === (detail?.kind === "fund" ? detail.id : -1));
  if (!fund) return null;

  const fundPositions = investPositions.filter((p) => p.fundId === fund.id);
  const invested = investedFunds[fund.id] || fund.myInvest;
  const totalProfit = fundPositions.reduce(
    (s, p) => s + calcInvestProfit(p.principalUsd, parseApr(fund.apr), p.startedAt),
    0,
  );
  const minGat = (fund.min / tokenToUsd(1, "GAT")).toFixed(2);
  const desc = il.fundDesc[fund.id as keyof typeof il.fundDesc] ?? "";
  const contractHint = il.contractTypes[fund.type as keyof typeof il.contractTypes] ?? "";
  const slotsLeft = fundSlotsLeft(fund as InvestmentFund);
  const almostFull = isFundAlmostFull(fund as InvestmentFund);

  return (
    <div className="space-y-4 p-5 max-h-[85vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="gp-text font-bold text-base leading-tight pr-4">{fund.name}</h3>
        <button onClick={onClose} className="gp-muted gp-icon-btn p-1 shrink-0"><X className="w-5 h-5" /></button>
      </div>

      <p className="gp-muted text-sm leading-relaxed">{desc}</p>
      <p className="gp-muted text-xs italic opacity-80">{contractHint}</p>

      <GlassCard className="p-4 space-y-2.5">
        <div className="flex justify-between"><span className="gp-muted text-xs">{t.apr}</span><span className="text-emerald-400 font-bold">{fund.apr}</span></div>
        <div className="flex justify-between"><span className="gp-muted text-xs">{m.type}</span><span className={`text-xs ${fund.typeColor}`}>{fund.type}</span></div>
        <div className="flex justify-between"><span className="gp-muted text-xs">{t.invest.minInvest}</span><span className="gp-text text-xs gp-num">${fund.min} ◈ {minGat} GAT</span></div>
        <div className="flex justify-between"><span className="gp-muted text-xs">{t.invest.term}</span><span className="gp-text text-xs">{fund.term}</span></div>
        <div className="flex justify-between"><span className="gp-muted text-xs">{t.risk}</span><span className={`text-xs ${fund.risk === "Low" ? "text-emerald-400" : "text-amber-400"}`}>{t.riskLevels[fund.risk as keyof typeof t.riskLevels] ?? fund.risk}</span></div>
        <div className="flex justify-between"><span className="gp-muted text-xs">{il.categoryLabel}</span><span className="gp-text text-xs">{fund.category}</span></div>
        {fund.round && (
          <div className="flex justify-between"><span className="gp-muted text-xs">{il.roundLabel ?? "Gelombang"}</span><span className="text-cyan-400 text-xs">{fund.round}</span></div>
        )}
        {"capacityUsd" in fund && fund.capacityUsd != null && (
          <div className="flex justify-between"><span className="gp-muted text-xs">{il.capacityLabel ?? "Target dana"}</span><span className="gp-text text-xs gp-num">{formatCapacityUsd(fund.capacityUsd)}</span></div>
        )}
        <div className="flex justify-between"><span className="gp-muted text-xs">{m.yourInvestment}</span><span className="gp-text text-xs gp-num">${invested.toLocaleString()}</span></div>
        {invested > 0 && (
          <div className="flex justify-between"><span className="gp-muted text-xs">{il.yourProfit}</span><span className="text-emerald-400 text-xs gp-num font-bold">+{formatUsd(totalProfit)}</span></div>
        )}
        <div className="flex justify-between"><span className="gp-muted text-xs">{m.certificate}</span><span className="gp-text text-xs gp-num">{fund.cert}</span></div>
        <div className="pt-1">
          <div className="flex justify-between text-[10px] mb-1">
            <span className="gp-muted">{fund.raised}% {il.raised}</span>
            <span className={almostFull ? "text-amber-500" : "gp-muted"}>{il.slotsLeft(slotsLeft)}</span>
          </div>
          <div className="h-1.5 gp-progress-track rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${almostFull ? "bg-gradient-to-r from-amber-500 to-orange-400" : "bg-gradient-to-r from-emerald-500 to-teal-400"}`} style={{ width: `${fund.raised}%` }} />
          </div>
        </div>
      </GlassCard>
      <div className="grid grid-cols-2 gap-2">
        <EmeraldBtn className="w-full" size="lg" onClick={() => { onClose(); requestOverlay("invest"); }}>
          <TrendingUp className="w-4 h-4" /> {invested > 0 ? il.addMore : t.invest.investNow}
        </EmeraldBtn>
        {invested > 0 ? (
          <EmeraldBtn className="w-full" size="lg" variant="outline" onClick={() => { onClose(); openInvestTab("portfolio"); }}>
            <TrendingUp className="w-4 h-4" /> {il.portfolio}
          </EmeraldBtn>
        ) : (
          <EmeraldBtn className="w-full" size="lg" variant="outline" onClick={() => { onClose(); openInvestTab("opportunities"); }}>
            <TrendingUp className="w-4 h-4" /> {il.opportunities}
          </EmeraldBtn>
        )}
      </div>
    </div>
  );
};

const resolveProductDescription = (
  product: Product,
  fallbackDesc: Partial<Record<number, string>>,
): string => {
  const merchantText = product.description?.trim();
  if (merchantText) return merchantText;
  return fallbackDesc[product.id] ?? "";
};

export const ProductDetailModal = ({
  products, onClose,
}: { products: Product[]; onClose: () => void }) => {
  const { detail, addToCart, openMarketCart, showToast } = useApp();
  const { t } = useLanguage();
  const m = t.modals;
  const market = t.market;
  const product = products.find((p) => p.id === (detail?.kind === "product" ? detail.id : -1));
  const [activeImage, setActiveImage] = useState(0);
  const [imageOpen, setImageOpen] = useState(false);

  useEffect(() => {
    setImageOpen(false);
    setActiveImage(0);
  }, [product?.id]);

  if (!product) return null;

  const productImages = getProductImages(product);

  const description = resolveProductDescription(product, market.productDesc) || market.noProductDescription;
  const catLabel = market.categories[product.cat as keyof typeof market.categories] ?? product.cat;
  const gatRate = formatTokenPriceUsd("GAT");

  const handleAddToCart = () => {
    addToCart(product.id, product.name, product.price);
    showToast(market.addedToCart(product.name), "success");
    onClose();
  };

  const handleCheckout = () => {
    addToCart(product.id, product.name, product.price);
    onClose();
    openMarketCart();
  };

  return (
    <div className="gp-product-detail flex flex-col min-h-0">
      <div className="shrink-0 flex items-start gap-3 px-5 pt-2 pb-3 border-b gp-divider">
        <div className="flex-1 min-w-0">
          <p className="gp-muted text-[10px] font-semibold uppercase tracking-wide mb-1">
            {market.subtitle}
          </p>
          <h3 className="gp-text font-bold text-base leading-snug line-clamp-2">{product.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="gp-muted gp-icon-btn p-1.5 shrink-0 rounded-xl"
          aria-label={t.common.cancel}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {productImages.length > 0 ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setImageOpen(true)}
              className="relative w-full block rounded-2xl overflow-hidden cursor-zoom-in ring-1 ring-black/5 dark:ring-white/10 active:scale-[0.99] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
              aria-label={m.tapFullImage}
            >
              <ProductThumb
                product={{
                  name: product.name,
                  emoji: product.emoji ?? "📦",
                  imageUrl: productImages[activeImage] ?? productImages[0],
                }}
                size="detail"
                className="!mb-0 pointer-events-none"
              />
              <span className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/60 text-white text-[10px] font-semibold flex items-center gap-1 backdrop-blur-sm">
                <ZoomIn className="w-3 h-3" /> {m.tapFullImage}
              </span>
            </button>
            {productImages.length > 1 && (
              <div className="grid grid-cols-3 gap-2">
                {productImages.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={`rounded-lg overflow-hidden ring-2 transition-all ${
                      activeImage === i ? "ring-emerald-500" : "ring-transparent opacity-70"
                    }`}
                  >
                    <img src={url} alt="" className="w-full aspect-[4/3] object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ProductThumbGallery
            product={{ ...product, emoji: product.emoji ?? "📦" }}
            size="detail"
            className="!mb-0 ring-1 ring-black/5 dark:ring-white/10"
          />
        )}
        {imageOpen && productImages[activeImage] && (
          <FullscreenImageViewer
            src={productImages[activeImage]}
            alt={product.name}
            onClose={() => setImageOpen(false)}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 text-[10px] font-semibold">
            <Tag className="w-3 h-3" /> {catLabel}
          </span>
          {product.merchantId && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-500 text-[10px] font-semibold">
              <Store className="w-3 h-3" /> {market.merchantBadge}
            </span>
          )}
        </div>

        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <Store className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="gp-text text-sm font-semibold truncate">{product.seller}</p>
              {formatMerchantShopTag(product) ? (
                <p className="gp-muted text-[10px] mt-0.5 gp-num">{formatMerchantShopTag(product)}</p>
              ) : null}
              {product.merchantId ? (
                <p className="gp-num text-emerald-400/80 text-[10px] mt-0.5 truncate">{product.merchantId}</p>
              ) : (
                <p className="gp-muted text-[10px] mt-0.5">{catLabel}</p>
              )}
            </div>
          </div>
          <div className="h-px bg-emerald-500/10" />
          <div className="flex items-end justify-between gap-3">
            <PriceWithGat usd={product.price} size="lg" align="left" />
            <p className="gp-muted text-[10px] text-right leading-snug max-w-[42%]">
              {market.gatRateHint(gatRate)}
            </p>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1 gp-text font-medium">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              {product.rating.toFixed(1)}
            </span>
            <span className="gp-muted">
              {product.orders.toLocaleString()} {t.orders}
            </span>
          </div>
        </GlassCard>

        <div className="rounded-2xl border gp-glass p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="gp-text text-xs font-bold">{market.productDescriptionTitle}</p>
          </div>
          {description ? (
            <p className="gp-text text-sm leading-relaxed whitespace-pre-wrap">{description}</p>
          ) : (
            <p className="gp-muted text-sm leading-relaxed italic">{market.noProductDescription}</p>
          )}
        </div>

        <p className="gp-muted text-[10px] text-center leading-relaxed px-1">{market.syariahCertified}</p>
      </div>

      <div className="shrink-0 px-5 py-4 border-t gp-divider space-y-2 bg-[var(--gp-bg-modal,var(--gp-surface))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <EmeraldBtn className="w-full" size="md" onClick={handleCheckout}>
          <Zap className="w-4 h-4 shrink-0" />
          {market.checkout}
        </EmeraldBtn>
        <EmeraldBtn className="w-full" size="md" variant="outline" onClick={handleAddToCart}>
          <ShoppingBag className="w-4 h-4 shrink-0" />
          {m.addToCart}
        </EmeraldBtn>
      </div>
    </div>
  );
};

export const InvestModal = ({
  investments, onClose,
}: { investments: Investment[]; onClose: () => void }) => {
  const { detail, investInFund, garudaPrimeSpendableGat } = useApp();
  const { t } = useLanguage();
  const m = t.modals;
  const fundId = detail?.kind === "fund" ? detail.id : investments[0]?.id;
  const fund = investments.find((f) => f.id === fundId);
  const [amount, setAmount] = useState(String(fund?.min ?? 500));
  const [investing, setInvesting] = useState(false);

  if (!fund) return null;

  const invest = async () => {
    const val = parseFloat(amount);
    if (!val || val < fund.min) {
      showAppToast(m.minInvestError(fund.min), "error");
      return;
    }
    setInvesting(true);
    try {
      const ok = await investInFund(fund.id, val, fund.name);
      if (ok) onClose();
    } finally {
      setInvesting(false);
    }
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="gp-text font-bold text-lg">{m.investInGat}</h3>
        <button onClick={onClose} className="gp-muted gp-icon-btn p-1"><X className="w-5 h-5" /></button>
      </div>
      <p className="gp-muted text-sm">{fund.name}</p>
      <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
        className="w-full px-4 py-3 rounded-xl gp-input border gp-num text-sm" />
      <p className="gp-muted text-xs">{m.minGat(fund.min)}</p>
      <p className="gp-muted text-[10px]">
        Saldo GAT dompet: {garudaPrimeSpendableGat.toLocaleString()} GAT
      </p>
      <EmeraldBtn className="w-full" size="lg" onClick={invest} disabled={investing}>
        {investing ? "…" : m.confirmInvest}
      </EmeraldBtn>
    </div>
  );
};
