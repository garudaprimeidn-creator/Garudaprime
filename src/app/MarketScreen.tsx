import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, Gem, Zap, ChevronRight, ShoppingBag, Plus, Minus, Trash2, X, CheckCircle,
  ShieldCheck, Mail, Package, Loader2,
} from "lucide-react";
import { useApp } from "./AppContext";
import { formatMerchantShopTag } from "../lib/merchant/merchantDisplay";
import { useLanguage } from "./LanguageContext";
import { formatTokenPriceUsd, getTokenPriceUsd } from "./tokenEconomy";
import { usdToGatPayHub } from "../lib/payhub/payHubAmounts";
import { getFeeRate } from "../lib/protocol/feeConfig";
import { feeLabel } from "../lib/protocol/feeTypes";
import { PriceWithGat, formatUsd, formatGatFromUsd } from "./PriceWithGat";
import {
  MARKET_CATEGORIES, marketCartDiscountUsd, marketCartTotalUsd, isDigitalMarketProduct, type MarketProduct,
} from "./marketData";
import { ProductThumbGallery } from "./ProductThumbGallery";
import { MarketShippingForm } from "./MarketShippingForm";
import { CheckoutPaymentSummary, CartCheckoutBarSummary } from "./CheckoutPaymentSummary";
import { missingShippingFields } from "../lib/merchant/shippingAddress";

const usdToGat = usdToGatPayHub;

type CartStep = "cart" | "shipping" | "confirm" | "success";

const SyariahBadge = () => {
  const { t } = useLanguage();
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold">
      <CheckCircle className="w-2.5 h-2.5" /> {t.syariah}
    </span>
  );
};

const WorkflowSteps = ({ activeStep }: { activeStep: 0 | 1 | 2 | 3 }) => {
  const { t } = useLanguage();
  const m = t.market;
  return (
    <div className="flex items-center gap-1">
      {m.workflowSteps.map((label, i) => (
        <React.Fragment key={label}>
          <div className="flex flex-col items-center flex-1 min-w-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold gp-num ${
              i <= activeStep ? "bg-emerald-500 text-black" : "gp-subtle gp-muted"
            }`}>
              {i + 1}
            </div>
            <p className={`text-[9px] mt-1 text-center leading-tight truncate w-full ${
              i <= activeStep ? "text-emerald-400 font-semibold" : "gp-muted"
            }`}>{label}</p>
          </div>
          {i < m.workflowSteps.length - 1 && (
            <div className={`h-0.5 w-3 shrink-0 rounded ${i < activeStep ? "bg-emerald-500" : "gp-subtle"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

const CartSheet = ({
  open,
  onClose,
  onRequireKyc,
}: {
  open: boolean;
  onClose: () => void;
  onRequireKyc: () => void;
}) => {
  const {
    cart, cartTotal, removeFromCart, updateCartQty, checkoutCart, showToast,
    shippingAddress, setShippingAddress, saveShippingAddressProfile, buildDefaultShipping,
    openBuyerOrders, profileName,
    isKycVerified,
  } = useApp();
  const { t } = useLanguage();
  const m = t.market;
  const discount = marketCartDiscountUsd(cartTotal);
  const total = marketCartTotalUsd(cartTotal);
  const gatTotal = usdToGat(total);
  const marketFeeGat = gatTotal * getFeeRate("market");
  const [checkingOut, setCheckingOut] = useState(false);
  const [step, setStep] = useState<CartStep>("cart");
  const [fieldErrors, setFieldErrors] = useState<Set<keyof typeof shippingAddress>>(new Set());

  useEffect(() => {
    if (open) {
      setStep("cart");
      setFieldErrors(new Set());
    }
  }, [open]);

  const workflowStep: 0 | 1 | 2 | 3 =
    step === "success" || step === "confirm" ? 3
      : step === "shipping" ? 2
        : cart.length > 0 ? 1 : 0;

  const stepHint =
    step === "confirm" ? m.checkoutConfirm
      : step === "shipping" ? m.cartStepShipping
        : m.cartStepReview;

  const applyProfileDelivery = () => {
    const synced = buildDefaultShipping();
    setShippingAddress(synced);
    setFieldErrors(new Set());
    showToast(m.shippingKycSynced, "success");
  };

  const handlePrimary = async () => {
    if (cart.length === 0 || checkingOut) return;

    if (!isKycVerified) {
      onRequireKyc();
      return;
    }

    if (step === "cart") {
      setShippingAddress(buildDefaultShipping());
      setFieldErrors(new Set());
      setStep("shipping");
      return;
    }

    if (step === "shipping") {
      const missing = missingShippingFields(shippingAddress);
      if (missing.length > 0) {
        setFieldErrors(new Set(missing));
        showToast(m.shippingInvalid, "error");
        return;
      }
      saveShippingAddressProfile(shippingAddress);
      setFieldErrors(new Set());
      setStep("confirm");
      return;
    }

    if (step === "confirm") {
      setCheckingOut(true);
      try {
        const result = await checkoutCart(shippingAddress);
        if (result.ok) {
          showToast(m.checkoutSuccess(gatTotal.toFixed(2)), "success");
          if (result.hasMerchantOrder) {
            setStep("success");
          } else {
            handleClose();
          }
        } else {
          const missing = missingShippingFields(shippingAddress);
          if (missing.length > 0) {
            setStep("shipping");
            setFieldErrors(new Set(missing));
            showToast(m.shippingInvalid, "error");
          }
        }
      } finally {
        setCheckingOut(false);
      }
    }
  };

  const handleClose = () => {
    setStep("cart");
    onClose();
  };

  const primaryLabel = !isKycVerified
    ? m.kycGoSettingsCheckout
    : step === "confirm"
      ? m.checkoutConfirm
      : step === "shipping"
        ? m.shippingContinue
        : m.cartContinueShipping;

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 gp-overlay-panel z-[80]"
            onClick={handleClose}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className={`fixed bottom-0 left-0 right-0 z-[80] gp-modal-sheet border-t rounded-t-3xl overflow-hidden mx-auto max-w-[430px] w-full grid grid-rows-[auto_auto_1fr_auto] ${
              cart.length > 0 ? "h-[92dvh]" : "max-h-[92dvh]"
            }`}
          >
            <div className="gp-modal-handle w-10 h-1 rounded-full mx-auto mt-3 mb-2 shrink-0" />
            <div className="gp-panel-head shrink-0">
            <div className="flex items-center justify-between px-5 pb-3">
              <h3 className="gp-text font-bold text-base flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-400" /> {m.cart}
              </h3>
              <button type="button" onClick={handleClose} className="gp-muted gp-icon-btn p-1"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-5 py-3">
              <WorkflowSteps activeStep={workflowStep} />
              <p className="gp-muted text-[10px] text-center mt-2">{stepHint}</p>
            </div>
            </div>

            <div
              className="gp-panel-body min-h-0 px-5 py-3 space-y-2"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {step === "success" ? (
                <div className="py-6 space-y-4 text-center">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-7 h-7 text-emerald-400" />
                  </div>
                  <div>
                    <p className="gp-text font-bold text-base">{m.merchantCheckoutDoneTitle}</p>
                    <p className="gp-muted text-xs mt-2 leading-relaxed px-2">{m.merchantCheckoutDoneInfo}</p>
                    <p className="gp-num text-emerald-400 text-lg font-black mt-3">{formatGatFromUsd(total)}</p>
                    <p className="gp-muted text-[10px] mt-0.5">{formatUsd(total)} · {m.checkoutPaidLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { handleClose(); openBuyerOrders(); }}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm flex items-center justify-center gap-2"
                  >
                    <Package className="w-4 h-4" /> {m.merchantCheckoutViewMyOrders}
                  </button>
                  <button type="button" onClick={handleClose} className="w-full py-2 rounded-xl gp-pill text-xs font-semibold">
                    {m.merchantCheckoutClose}
                  </button>
                </div>
              ) : cart.length === 0 ? (
                <p className="gp-muted text-sm text-center py-8">{m.cartEmpty}</p>
              ) : step === "shipping" ? (
                <div className="space-y-3 pb-2">
                  <p className="gp-text text-xs font-semibold flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-emerald-400" /> {m.shippingTitle}
                  </p>
                  <p className="gp-muted text-[10px] leading-relaxed">{m.inlineShippingHint}</p>
                  <MarketShippingForm
                    value={shippingAddress}
                    onChange={(v) => {
                      setShippingAddress(v);
                      if (fieldErrors.size > 0) setFieldErrors(new Set(missingShippingFields(v)));
                    }}
                    buyerName={profileName}
                    fieldErrors={fieldErrors}
                    compact
                  />
                  <button
                    type="button"
                    onClick={applyProfileDelivery}
                    className="w-full py-2 rounded-xl border border-emerald-500/30 text-emerald-400 text-xs font-semibold"
                  >
                    {m.shippingUseKyc}
                  </button>
                </div>
              ) : (
                <>
                  {step === "confirm" && (
                    <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3 mb-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="gp-text text-xs font-semibold">{m.shippingConfirmAddress}</p>
                          <p className="gp-text text-xs mt-1.5 font-medium">{shippingAddress.recipientName}</p>
                          <p className="gp-muted text-[10px] mt-0.5">{shippingAddress.email}</p>
                          <p className="gp-muted text-[10px] mt-0.5">{shippingAddress.phone}</p>
                          {shippingAddress.notes.trim() ? (
                            <p className="gp-muted text-[10px] mt-1 leading-relaxed italic">{shippingAddress.notes}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => setStep("shipping")}
                          className="text-emerald-400 text-[10px] font-semibold shrink-0"
                        >
                          {m.editShipping}
                        </button>
                      </div>
                    </div>
                  )}
                  {cart.map((item) => {
                    const lineUsd = item.price * item.qty;
                    return (
                    <div key={item.productId} className="flex items-center gap-3 rounded-xl border gp-glass p-3">
                      <div className="flex-1 min-w-0">
                        <p className="gp-text text-sm font-semibold truncate">{item.name}</p>
                        {step === "confirm" ? (
                          <p className="gp-muted text-[10px] mt-0.5">×{item.qty}</p>
                        ) : (
                          <>
                            <PriceWithGat usd={lineUsd} size="md" />
                            {item.qty > 1 && (
                              <p className="gp-muted text-[9px] mt-0.5">
                                {formatUsd(item.price)} × {item.qty}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                      {step === "cart" && (
                        <>
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => updateCartQty(item.productId, item.qty - 1)} className="w-7 h-7 rounded-lg gp-subtle flex items-center justify-center">
                              <Minus className="w-3 h-3 gp-muted" />
                            </button>
                            <span className="gp-num gp-text text-xs font-bold w-5 text-center">{item.qty}</span>
                            <button type="button" onClick={() => updateCartQty(item.productId, item.qty + 1)} className="w-7 h-7 rounded-lg gp-subtle flex items-center justify-center">
                              <Plus className="w-3 h-3 gp-muted" />
                            </button>
                          </div>
                          <button type="button" onClick={() => removeFromCart(item.productId)} className="p-1 text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {step === "confirm" && (
                        <PriceWithGat usd={lineUsd} size="sm" align="right" />
                      )}
                    </div>
                    );
                  })}
                </>
              )}

              {cart.length > 0 && step !== "success" && step !== "shipping" && (
                <div className="pt-1 pb-2">
                  <CheckoutPaymentSummary
                    itemCount={cart.length}
                    subtotalUsd={cartTotal}
                    discountUsd={discount}
                    protocolFeeUsd={marketFeeGat * getTokenPriceUsd("GAT")}
                    protocolFeeGat={marketFeeGat}
                    protocolFeeLabel={feeLabel("market")}
                    totalUsd={total}
                    gatTotal={gatTotal}
                    gatRateLabel={m.gatRateHint(formatTokenPriceUsd("GAT"))}
                    showConfirmNote={step === "confirm"}
                  />
                </div>
              )}
            </div>

            {cart.length > 0 && step !== "success" && (
              <div className="px-5 py-3 border-t gp-divider space-y-2.5 shrink-0 bg-[var(--gp-bg-modal)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {(step === "shipping" || step === "confirm") && (
                  <button
                    type="button"
                    onClick={() => setStep(step === "confirm" ? "shipping" : "cart")}
                    className="w-full py-2 rounded-xl gp-pill text-xs font-semibold"
                  >
                    {t.auth.back}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePrimary}
                  disabled={checkingOut}
                  className={`w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 ${
                    !isKycVerified
                      ? "bg-gradient-to-r from-amber-500 to-orange-400 text-black"
                      : "bg-gradient-to-r from-emerald-500 to-teal-400 text-black"
                  }`}
                >
                  {!isKycVerified ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : step === "shipping" ? (
                    <MapPin className="w-4 h-4" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {checkingOut ? "…" : primaryLabel}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(sheet, document.body);
};

export const MarketScreen = () => {
  const {
    openDetail, addToCart, cartTotal, cartCount, showToast, marketProducts, marketplaceLoading,
    isKycVerified, startKycUpgrade, openBuyerOrders, marketCartOpen, closeMarketCart,
    refreshMarketplace,
  } = useApp();
  const { t } = useLanguage();
  const m = t.market;
  type CatKey = keyof typeof m.categories;
  const catKeys: CatKey[] = ["All", ...MARKET_CATEGORIES];
  const [catFilter, setCatFilter] = useState<CatKey>("All");
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const productsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshMarketplace();
  }, [refreshMarketplace]);

  useEffect(() => {
    if (!marketCartOpen) return;
    setCartOpen(true);
    closeMarketCart();
  }, [marketCartOpen, closeMarketCart]);

  const filtered = (catFilter === "All" ? marketProducts : marketProducts.filter((p) => p.cat === catFilter))
    .filter((p) => isDigitalMarketProduct(p))
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.seller.toLowerCase().includes(search.toLowerCase()));

  const discount = marketCartDiscountUsd(cartTotal);
  const cartFinal = marketCartTotalUsd(cartTotal);
  const cartGat = usdToGat(cartFinal);

  const productDesc = (p: MarketProduct) =>
    (p.description || "").trim() || m.noProductDescription;

  const goToKycSettings = () => {
    setCartOpen(false);
    showToast(m.kycRequiredCheckout, "warning");
    startKycUpgrade();
  };

  const handleCheckoutFromBar = () => {
    if (cartCount === 0) {
      productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!isKycVerified) {
      goToKycSettings();
      return;
    }
    setCartOpen(true);
  };

  const scrollToProducts = () => {
    productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleQuickAdd = (e: React.MouseEvent, product: MarketProduct) => {
    e.stopPropagation();
    if (addToCart(product.id, product.name, product.price)) {
      showToast(m.addedToCart(product.name), "success");
    }
  };

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="gp-text font-bold text-lg">{t.screens.market}</h2>
          <p className="gp-muted text-xs">{m.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={openBuyerOrders}
            className="h-10 px-3 rounded-xl gp-glass border flex items-center justify-center gap-1.5 gp-hover-row text-cyan-400"
            aria-label={m.myOrders}
          >
            <Package className="w-4 h-4" />
            <span className="text-[11px] font-semibold hidden sm:inline">{m.myOrders}</span>
          </button>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative w-10 h-10 rounded-xl gp-glass border flex items-center justify-center gp-hover-row"
            aria-label={m.openCart}
          >
            <ShoppingBag className="w-5 h-5 text-emerald-400" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-black text-[10px] font-bold flex items-center justify-center gp-num">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 gp-muted" />
        <input
          type="text" placeholder={m.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl gp-input border focus:outline-none focus:border-emerald-500/40 transition-colors text-sm"
        />
      </div>

      <div className="gp-hero gp-hero-market relative rounded-2xl overflow-hidden p-5">
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none" />
        <p className="text-emerald-400 text-xs font-semibold mb-1">{m.ramadanSpecial}</p>
        <h3 className="gp-text font-bold text-lg leading-tight">{m.halalMarketplace}</h3>
        <p className="gp-muted text-xs mt-1">{m.payWithGat} ◈ {formatTokenPriceUsd("GAT")}</p>
        <button
          type="button"
          onClick={() => { setCatFilter("Digital"); scrollToProducts(); }}
          className="mt-3 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black text-sm font-semibold"
        >
          {m.shopNow}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {catKeys.map((c) => (
          <button key={c} type="button" onClick={() => setCatFilter(c)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              catFilter === c ? "gp-pill-active" : "gp-pill"
            }`}
          >
            {m.categories[c]}
          </button>
        ))}
      </div>

      <div ref={productsRef}>
        {marketplaceLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="gp-muted text-sm">{m.loadingProducts ?? "Memuat produk…"}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 gp-muted text-sm">{m.emptySearch}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}>
                <div
                  className="gp-glass border rounded-2xl p-3 cursor-pointer hover:border-emerald-500/20 transition-all active:scale-[0.98]"
                  onClick={() => openDetail({ kind: "product", id: p.id })}
                >
                  <ProductThumbGallery product={p} gradientIndex={i} max={1} />
                  <p className="gp-text text-xs font-semibold leading-tight mb-1 line-clamp-2">{p.name}</p>
                  <p className="gp-muted text-[10px] mb-1 line-clamp-2 leading-snug">{productDesc(p)}</p>
                  <p className="gp-muted text-[10px] mb-2 leading-snug">
                    <span className="truncate block">{p.seller}</span>
                    {formatMerchantShopTag(p) ? (
                      <span className="gp-num text-amber-400/90">{formatMerchantShopTag(p)}</span>
                    ) : null}
                    {p.merchantId ? (
                      <span className="block gp-num text-emerald-400/80 truncate mt-0.5">{p.merchantId}</span>
                    ) : null}
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="gp-num text-emerald-400 font-bold text-sm">{formatUsd(p.price)}</p>
                      <p className="gp-num text-teal-500/90 text-[10px] font-semibold">{formatGatFromUsd(p.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Gem className="w-2.5 h-2.5 text-amber-400" />
                      <span className="text-[10px] gp-muted">{p.rating}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 gap-1">
                    <SyariahBadge />
                    <button
                      type="button"
                      onClick={(e) => handleQuickAdd(e, p)}
                      className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[10px] font-bold"
                    >
                      <Plus className="w-3 h-3" /> {m.quickAdd}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleCheckoutFromBar}
        className="gp-glass w-full p-4 flex items-center gap-4 border border-emerald-500/25 rounded-2xl hover:border-emerald-500/40 transition-all text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="gp-text text-sm font-semibold">
            {cartCount > 0 ? m.payGatTitle : m.startShopping}
          </p>
          {cartCount > 0 ? (
            <CartCheckoutBarSummary itemCount={cartCount} totalUsd={cartFinal} gatTotal={cartGat} />
          ) : (
            <p className="gp-muted text-xs mt-0.5">{m.browseCart}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 gp-muted shrink-0" />
      </button>

      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onRequireKyc={goToKycSettings}
      />
    </div>
  );
};
