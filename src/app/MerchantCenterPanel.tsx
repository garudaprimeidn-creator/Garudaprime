import { useState, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  X, Store, DollarSign, Package, ShoppingBag,
  Upload, BarChart3, Eye, EyeOff, Trash2, ExternalLink, Plus, Mail, User,
  Pencil, Loader2,
} from "lucide-react";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { ToolInfoBox } from "./ToolGuideSheet";
import {
  fetchMerchantProfile,
  resolvePrimaryMerchantForOwner,
  canonicalMerchantIdForOwner,
  isValidMerchantId,
  syncOwnerMerchantSession,
  getLast7Days,
  getTodayStats,
  MERCHANT_NAME,
  buildMerchantPayQrPayload,
  type MerchantProduct,
} from "../lib/merchant/merchantService";
import { updateMerchantProfileApi } from "../lib/payhub/payHubApi";
import { writeMerchantQrSnapshot } from "../lib/merchant/merchantQrCache";
import { emitMerchantProfileSaved } from "../lib/merchant/merchantProfileEvents";
import { createMerchantInvoiceId } from "../lib/merchant/merchantMdr";
import { resolveOwnerUid } from "../lib/merchant/useOwnerMerchantQr";
import { getSessionUidAsync } from "../lib/security/sessionManager";
import { useAuth } from "../contexts/AuthContext";
import { getMerchantOrders, type MarketOrder, type OrderStatus } from "../lib/merchant/orderService";
import { formatShippingAddress } from "../lib/merchant/shippingAddress";
import { syncLocalProductsToFirestore } from "../lib/merchant/marketplaceFirestore";
import { getProductImages } from "../lib/merchant/productImages";
import { ProductThumbGallery } from "./ProductThumbGallery";
import { ProductImagesUpload } from "./ProductImagesUpload";
import { QrPayloadImage } from "../features/wallet/QrPayloadImage";

type Tab = "dashboard" | "products" | "upload" | "orders";

import { MARKET_CATEGORIES, coerceMarketCategory, type MarketCategory } from "./marketData";

const formatGat = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });


export const MerchantCenterPanel = ({
  onClose,
  initialTab = "dashboard",
}: {
  onClose: () => void;
  initialTab?: Tab;
}) => {
  const {
    merchantProducts, merchantStats, marketOrders, updateOrderStatus,
    addMerchantProduct, updateMerchantProduct, toggleMerchantProductPublished,
    removeMerchantProduct, openMarket, copyText, showToast, userId,
    syncMerchantShopBranding,
    garudaPrimeSpendableGat, activeOnChainGat, onChainGat, refreshBalances, walletAddress,
  } = useApp();
  const { connectedWallet, userProfile, user } = useAuth();
  const { t } = useLanguage();
  const tp = t.toolsPanel;
  const mp = tp.merchantPanel;
  const [merchantVaultAddress, setMerchantVaultAddress] = useState<string | null>(null);
  const common = t.common;
  const tg = t.toolsGuide;

  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState<MarketCategory>("Digital");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [publish, setPublish] = useState(true);
  const [editingProduct, setEditingProduct] = useState<MerchantProduct | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCat, setEditCat] = useState<MarketCategory>("Digital");
  const [editImageUrls, setEditImageUrls] = useState<string[]>([]);
  const [editDescription, setEditDescription] = useState("");
  const [editPublish, setEditPublish] = useState(true);
  const [editImageLoading, setEditImageLoading] = useState(false);
  const [sessionUid, setSessionUid] = useState<string | null>(null);
  const ownerUid = resolveOwnerUid(userId, user?.uid, userProfile?.uid, sessionUid);

  useEffect(() => {
    if (ownerUid) return;
    let cancelled = false;
    void getSessionUidAsync().then((uid) => {
      if (!cancelled && uid?.trim()) setSessionUid(uid.trim());
    });
    return () => { cancelled = true; };
  }, [ownerUid]);

  const [activeMerchantId, setActiveMerchantId] = useState(() =>
    ownerUid ? canonicalMerchantIdForOwner(ownerUid) : "",
  );
  const [activeMerchantName, setActiveMerchantName] = useState(MERCHANT_NAME);
  const [merchantLoading, setMerchantLoading] = useState(Boolean(ownerUid));
  const [shopName, setShopName] = useState("");
  const [shopSymbol, setShopSymbol] = useState("");
  const [shopLocation, setShopLocation] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (!ownerUid) {
      setMerchantLoading(false);
      return;
    }
    setActiveMerchantId(canonicalMerchantIdForOwner(ownerUid));
    setMerchantLoading(true);
    void (async () => {
      try {
        await syncOwnerMerchantSession(userProfile?.displayName);
        const primary = await resolvePrimaryMerchantForOwner(
          ownerUid,
          userProfile?.displayName,
        );
        setActiveMerchantId(isValidMerchantId(primary.merchantId) ? primary.merchantId : canonicalMerchantIdForOwner(ownerUid));
        setActiveMerchantName(primary.merchantName);
        const profile = await fetchMerchantProfile(primary.merchantId);
        const resolvedName = profile?.name?.trim() || primary.merchantName;
        setActiveMerchantName(resolvedName);
        setShopName(resolvedName);
        setShopSymbol(profile?.shopSymbol?.trim() ?? "");
        setShopLocation(profile?.shopLocation?.trim() ?? "");
        const vault = profile?.walletAddress?.trim()
          || connectedWallet?.address
          || userProfile?.walletAddress
          || walletAddress;
        setMerchantVaultAddress(vault?.startsWith("0x") ? vault : null);
        void syncLocalProductsToFirestore(primary.merchantId);
      } catch {
        setActiveMerchantId(canonicalMerchantIdForOwner(ownerUid));
      } finally {
        setMerchantLoading(false);
      }
    })();
  }, [ownerUid, connectedWallet?.address, userProfile?.walletAddress, userProfile?.displayName, walletAddress]);

  useEffect(() => {
    if (!userId) return;
    void refreshBalances({ force: true });
  }, [userId, tab, walletAddress, connectedWallet?.address, refreshBalances]);

  const walletGatBalance = garudaPrimeSpendableGat;
  const displayOnChainGat = activeOnChainGat;

  const today = getTodayStats(merchantStats);
  const week = getLast7Days(merchantStats);
  const maxGat = Math.max(...week.map((d) => d.gat), 1);
  const publishedCount = merchantProducts.filter((p) => p.published).length;
  const merchantQr = useMemo(() => {
    if (!isValidMerchantId(activeMerchantId)) {
      return ownerUid ? canonicalMerchantIdForOwner(ownerUid) : "";
    }
    return buildMerchantPayQrPayload(
      activeMerchantId,
      activeMerchantName,
      merchantVaultAddress,
    );
  }, [activeMerchantId, activeMerchantName, merchantVaultAddress, ownerUid]);
  const incomingOrders = getMerchantOrders(marketOrders, activeMerchantId);

  const statusLabel = (status: OrderStatus) => {
    const map: Record<OrderStatus, string> = {
      pending: mp.orderStatusPending,
      processing: mp.orderStatusProcessing,
      shipped: mp.orderStatusShipped,
      delivered: mp.orderStatusDelivered,
      cancelled: mp.orderStatusCancelled,
    };
    return map[status];
  };

  const statusClass = (status: OrderStatus) => {
    const map: Record<OrderStatus, string> = {
      pending: "bg-amber-500/15 text-amber-400",
      processing: "bg-cyan-500/15 text-cyan-400",
      shipped: "bg-indigo-500/15 text-indigo-400",
      delivered: "bg-emerald-500/15 text-emerald-400",
      cancelled: "bg-red-500/15 text-red-400",
    };
    return map[status];
  };

  const nextStatus = (status: OrderStatus): OrderStatus | null => {
    if (status === "cancelled") return null;
    if (status === "pending") return "processing";
    if (status === "processing") return "shipped";
    if (status === "shipped") return "delivered";
    return null;
  };

  const nextStatusAction = (status: OrderStatus) => {
    const map = {
      pending: mp.orderMarkProcessing,
      processing: mp.orderMarkShipped,
      shipped: mp.orderMarkDelivered,
    };
    return status === "delivered" ? null : map[status];
  };

  const resetForm = () => {
    setName("");
    setPrice("");
    setCat("Digital");
    setImageUrls([]);
    setDescription("");
    setPublish(true);
  };

  const openProductEdit = (product: MerchantProduct) => {
    setEditingProduct(product);
    setEditName(product.name);
    setEditPrice(String(product.price));
    setEditCat(coerceMarketCategory(product.cat));
    setEditImageUrls(getProductImages(product));
    setEditDescription(product.description ?? "");
    setEditPublish(product.published);
  };

  const closeProductEdit = () => {
    setEditingProduct(null);
    setEditImageLoading(false);
  };

  const handleSaveProductEdit = () => {
    if (!editingProduct) return;
    const val = parseFloat(editPrice);
    if (!editName.trim() || !val || val <= 0 || editImageUrls.length === 0) {
      showToast(editImageUrls.length === 0 ? mp.imageRequired : mp.invalidForm, "error");
      return;
    }
    updateMerchantProduct(editingProduct.id, {
      name: editName.trim(),
      price: val,
      cat: editCat,
      imageUrls: editImageUrls,
      description: editDescription.trim(),
      publish: editPublish,
    });
    showToast(
      editPublish ? mp.productPublishedLive : mp.productUpdated,
      "success",
    );
    closeProductEdit();
  };

  const handleUpload = () => {
    const val = parseFloat(price);
    if (!name.trim() || !val || val <= 0 || imageUrls.length === 0) {
      showToast(imageUrls.length === 0 ? mp.imageRequired : mp.invalidForm, "error");
      return;
    }
    addMerchantProduct({
      name: name.trim(),
      price: val,
      cat,
      imageUrls,
      description: description.trim(),
      publish,
    });
    showToast(publish ? mp.productPublishedLive : mp.productSavedDraft, "success");
    resetForm();
    setTab("products");
  };

  const imageUploadLabels = {
    productImage: mp.productImage,
    imageHint: mp.imageHint,
    pickImage: mp.pickImage,
    addImage: mp.addImage,
    imageFormat: mp.imageFormat,
    removeImage: mp.removeImage,
    imagesMaxReached: mp.imagesMaxReached,
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: mp.tabDashboard, icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: "orders", label: mp.tabOrders, icon: <Mail className="w-3.5 h-3.5" /> },
    { id: "products", label: mp.tabProducts, icon: <Package className="w-3.5 h-3.5" /> },
    { id: "upload", label: mp.tabUpload, icon: <Upload className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="gp-panel-head shrink-0">
      <div className="flex items-start gap-3 p-4 pt-6">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
          <Store className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="gp-text font-bold text-base leading-tight">{tp.merchantTitle}</h3>
          <p className="gp-muted text-xs mt-0.5 leading-snug">{tp.merchantSubtitle}</p>
        </div>
        <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2 flex gap-1.5 shrink-0">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[10px] font-semibold transition-all ${
              tab === tb.id
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/35"
                : "gp-muted border border-transparent gp-hover-row"
            }`}
          >
            {tb.icon}
            {tb.label}
          </button>
        ))}
      </div>
      </div>

      <div className="gp-panel-body p-4 space-y-3" style={{ scrollbarWidth: "none" }}>
        {tab === "dashboard" && (
          <>
            <ToolInfoBox info={tp.merchantInfo} features={tg.merchant?.features ?? []} tone="orange" />
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="gp-text text-sm font-bold">{mp.shopSettingsTitle}</p>
              </div>
              <p className="gp-muted text-[10px] leading-relaxed">{mp.shopSettingsHint}</p>
              <div className="space-y-2">
                <label className="block">
                  <span className="gp-muted text-[9px] font-semibold uppercase tracking-wide">{mp.shopNameLabel}</span>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder={mp.shopNamePlaceholder}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 gp-text text-sm outline-none focus:border-amber-500/40"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="gp-muted text-[9px] font-semibold uppercase tracking-wide">{mp.shopSymbolLabel}</span>
                    <input
                      type="text"
                      value={shopSymbol}
                      onChange={(e) => setShopSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                      placeholder={mp.shopSymbolPlaceholder}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 gp-text text-sm gp-num outline-none focus:border-amber-500/40"
                    />
                  </label>
                  <label className="block">
                    <span className="gp-muted text-[9px] font-semibold uppercase tracking-wide">{mp.shopLocationLabel}</span>
                    <input
                      type="text"
                      value={shopLocation}
                      onChange={(e) => setShopLocation(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
                      placeholder={mp.shopLocationPlaceholder}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 gp-text text-sm gp-num outline-none focus:border-amber-500/40"
                    />
                  </label>
                </div>
                <p className="gp-muted text-[9px]">
                  {mp.invoicePreviewLabel}:{" "}
                  <span className="gp-num gp-text font-medium">
                    {createMerchantInvoiceId({
                      merchantId: activeMerchantId || "GP-USR",
                      shopSymbol: shopSymbol || undefined,
                      shopLocation: shopLocation || undefined,
                    })}
                  </span>
                </p>
              </div>
              <button
                type="button"
                disabled={profileSaving || merchantLoading || !shopName.trim()}
                onClick={() => {
                  setProfileSaving(true);
                  void updateMerchantProfileApi({
                    name: shopName.trim(),
                    shopSymbol: shopSymbol.trim(),
                    shopLocation: shopLocation.trim(),
                  }).then((updated) => {
                    const nextName = updated?.name?.trim() || shopName.trim();
                    const nextSymbol = updated?.shopSymbol?.trim() ?? shopSymbol.trim();
                    const nextLocation = updated?.shopLocation?.trim() ?? shopLocation.trim();
                    setShopName(nextName);
                    setShopSymbol(nextSymbol);
                    setShopLocation(nextLocation);
                    if (updated?.name) setActiveMerchantName(updated.name);
                    syncMerchantShopBranding({
                      sellerName: nextName,
                      shopSymbol: nextSymbol,
                      shopLocation: nextLocation,
                    });
                    if (userId && activeMerchantId) {
                      writeMerchantQrSnapshot({
                        uid: userId,
                        merchantId: activeMerchantId,
                        merchantName: nextName,
                        shopSymbol: nextSymbol || undefined,
                        shopLocation: nextLocation || undefined,
                        savedAt: Date.now(),
                      });
                      emitMerchantProfileSaved({
                        merchantId: activeMerchantId,
                        name: nextName,
                        shopSymbol: nextSymbol || null,
                        shopLocation: nextLocation || null,
                        invoicePrefix: updated?.invoicePrefix ?? null,
                      });
                    }
                    showToast(mp.shopSettingsSaved, "success");
                  }).catch(() => {
                    showToast(mp.shopSettingsFailed, "error");
                  }).finally(() => setProfileSaving(false));
                }}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-black text-xs font-bold disabled:opacity-50"
              >
                {profileSaving ? mp.shopSettingsSaving : mp.shopSettingsSave}
              </button>
            </div>
            <div className={`rounded-xl border p-3 flex items-center justify-between gap-2 ${
              merchantStats.marketLinked
                ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                : "border-amber-500/30 bg-amber-500/[0.06]"
            }`}>
              <div>
                <p className="gp-text text-xs font-bold">
                  {merchantStats.marketLinked ? mp.marketLinked : mp.marketNotLinked}
                </p>
                <p className="gp-muted text-[10px] mt-0.5">
                  {publishedCount} {mp.productsInMarket}
                </p>
              </div>
              <button
                type="button"
                onClick={openMarket}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-[10px] font-bold flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> {mp.openMarket}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: <DollarSign className="w-4 h-4 text-emerald-400" />, label: mp.walletGatBalance, value: `${formatGat(walletGatBalance)} GAT`, hint: Math.abs(walletGatBalance - displayOnChainGat) > 0.0001 ? `${formatGat(displayOnChainGat)} on-chain` : undefined },
                { icon: <DollarSign className="w-4 h-4 text-amber-400" />, label: tp.merchantTodaySales, value: `${formatGat(today.gat)} GAT` },
                { icon: <Package className="w-4 h-4 text-cyan-400" />, label: tp.merchantOrders, value: String(today.orders) },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border gp-glass p-3">
                  <div className="flex items-center gap-1.5 mb-1">{s.icon}<p className="gp-muted text-[10px]">{s.label}</p></div>
                  <p className="gp-num gp-text font-bold text-sm">{s.value}</p>
                  {"hint" in s && s.hint ? (
                    <p className="gp-muted text-[9px] mt-0.5">+ {s.hint}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="rounded-xl border gp-glass p-3">
              <p className="gp-muted text-[10px] font-semibold uppercase tracking-wider mb-2">{mp.weeklySales}</p>
              <div className="flex items-end gap-1.5 h-16">
                {week.map((d) => (
                  <div key={d.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div
                      className="w-full rounded-t bg-amber-400/80 min-h-[4px] transition-all"
                      style={{ height: `${Math.max(8, (d.gat / maxGat) * 100)}%` }}
                      title={`${d.gat.toFixed(1)} GAT`}
                    />
                    <span className="gp-muted text-[8px] truncate w-full text-center">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.08] to-transparent overflow-hidden">
              <div className="p-4 text-center">
                <span className="inline-block mb-3 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[9px] font-bold uppercase tracking-wide">
                  {mp.qrOnchainBadge}
                </span>
                <div className="w-[7.5rem] h-[7.5rem] mx-auto rounded-2xl bg-white flex items-center justify-center mb-3 p-2 shadow-sm ring-1 ring-black/5">
                  <QrPayloadImage payload={merchantQr} size={104} alt={`${activeMerchantName} payment QR`} />
                </div>
                <p className="gp-text text-sm font-bold">{activeMerchantName}</p>
                <p className="gp-muted text-[10px] mt-1.5 leading-relaxed max-w-[260px] mx-auto">
                  {mp.qrOnchainHint}
                </p>
                <button
                  type="button"
                  onClick={() => copyText(merchantQr, tp.merchantCopyQr)}
                  className="mt-4 w-full max-w-[280px] mx-auto py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-bold shadow-md shadow-emerald-500/20"
                >
                  {mp.qrCopyOnchain}
                </button>
              </div>
            </div>
          </>
        )}

        {tab === "orders" && (
          <>
            <ToolInfoBox info={mp.orderFlowInfo} features={[]} tone="amber" />
            <p className="gp-text text-sm font-bold">{mp.ordersTitle}</p>
            {incomingOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed gp-glass p-8 text-center">
                <Mail className="w-8 h-8 gp-muted mx-auto mb-2 opacity-50" />
                <p className="gp-muted text-xs">{mp.ordersEmpty}</p>
              </div>
            ) : (
              incomingOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  mp={mp}
                  statusLabel={statusLabel(order.status)}
                  statusClass={statusClass(order.status)}
                  nextAction={nextStatusAction(order.status)}
                  onAdvance={(tracking) => {
                    const next = nextStatus(order.status);
                    if (!next) return;
                    updateOrderStatus(order.id, next, tracking);
                  }}
                />
              ))
            )}
          </>
        )}

        {tab === "products" && (
          <>
            <div className="flex items-center justify-between">
              <p className="gp-text text-sm font-bold">{mp.myProducts}</p>
              <button
                type="button"
                onClick={() => setTab("upload")}
                className="text-emerald-400 text-[11px] font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> {mp.addProduct}
              </button>
            </div>
            {merchantProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed gp-glass p-8 text-center">
                <ShoppingBag className="w-8 h-8 gp-muted mx-auto mb-2 opacity-50" />
                <p className="gp-muted text-xs">{mp.noProducts}</p>
                <button
                  type="button"
                  onClick={() => setTab("upload")}
                  className="mt-3 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-semibold"
                >
                  {mp.tabUpload}
                </button>
              </div>
            ) : (
              merchantProducts.map((p) => (
                <div key={p.id} className="rounded-xl border gp-glass p-3 flex gap-3">
                  <div className="w-[5.75rem] shrink-0">
                    <ProductThumbGallery product={p} size="mini" className="!mb-0" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="gp-text text-sm font-semibold truncate">{p.name}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                        p.published
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-400"
                      }`}>
                        {p.published ? mp.published : mp.draft}
                      </span>
                    </div>
                    <p className="gp-num text-emerald-400 text-xs font-bold mt-0.5">
                      ${p.price.toFixed(2)} · {p.orders} {mp.ordersLabel}
                    </p>
                    <p className="gp-muted text-[10px] truncate mt-0.5">{p.cat}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => openProductEdit(p)}
                        className="flex items-center gap-1 text-[10px] font-semibold text-amber-400"
                      >
                        <Pencil className="w-3 h-3" /> {mp.editProduct}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          toggleMerchantProductPublished(p.id);
                          showToast(p.published ? mp.unpublished : mp.productPublishedLive, "success");
                        }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-cyan-400"
                      >
                        {p.published ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {p.published ? mp.unpublish : mp.publish}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          removeMerchantProduct(p.id);
                          showToast(mp.productRemoved, "info");
                        }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-red-400 ml-auto"
                      >
                        <Trash2 className="w-3 h-3" /> {mp.delete}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {tab === "upload" && (
          <>
            <p className="gp-text text-sm font-bold">{mp.uploadTitle}</p>
            <p className="gp-muted text-[11px] leading-relaxed">{mp.uploadHint}</p>
            <label className="block">
              <span className="gp-muted text-[10px] font-semibold uppercase tracking-wide">{mp.productName}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
                placeholder={mp.productNamePh}
              />
            </label>
            <label className="block">
              <span className="gp-muted text-[10px] font-semibold uppercase tracking-wide">{mp.priceUsd}</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm gp-num"
                placeholder="29.99"
              />
            </label>
            <label className="block">
              <span className="gp-muted text-[10px] font-semibold uppercase tracking-wide">{mp.category}</span>
              <select
                value={cat}
                onChange={(e) => setCat(e.target.value as MarketCategory)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
              >
                {MARKET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t.market.categories[c]}</option>
                ))}
              </select>
            </label>
            <ProductImagesUpload
              images={imageUrls}
              onChange={setImageUrls}
              loading={imageLoading}
              onLoadingChange={setImageLoading}
              onError={() => showToast(mp.imageError, "error")}
              labels={imageUploadLabels}
              productName={name}
            />
            <label className="block">
              <span className="gp-muted text-[10px] font-semibold uppercase tracking-wide">{mp.description}</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm resize-none"
                placeholder={mp.descriptionPh}
              />
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
                className="rounded border-emerald-500/50 text-emerald-500"
              />
              <span className="gp-text text-xs font-medium">{mp.publishNow}</span>
            </label>
            <button
              type="button"
              onClick={handleUpload}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-400 text-black text-sm font-bold flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" /> {mp.submitUpload}
            </button>
            {publish && (
              <p className="gp-muted text-[10px] text-center">{mp.publishNote}</p>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {editingProduct && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 gp-overlay-panel z-[90]"
              onClick={closeProductEdit}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280 }}
              className="fixed bottom-0 left-0 right-0 z-[90] gp-modal-sheet border-t rounded-t-3xl mx-auto max-w-lg max-h-[88vh] flex flex-col"
            >
              <div className="gp-modal-handle w-10 h-1 rounded-full mx-auto mt-3 mb-2 shrink-0" />
              <div className="px-5 pb-6 pt-1 overflow-y-auto flex-1 space-y-3">
                <div className="flex items-start justify-between gap-3 sticky top-0 bg-[var(--gp-modal-bg,var(--gp-surface))] pb-2 z-10">
                  <div className="min-w-0">
                    <h4 className="gp-text font-bold text-base leading-tight">{mp.editProductTitle}</h4>
                    <p className="gp-muted text-[10px] mt-0.5 truncate">{editingProduct.name}</p>
                  </div>
                  <button type="button" onClick={closeProductEdit} className="gp-muted gp-icon-btn p-1 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <label className="block">
                  <span className="gp-muted text-[10px] font-semibold uppercase tracking-wide">{mp.productName}</span>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
                    placeholder={mp.productNamePh}
                  />
                </label>
                <label className="block">
                  <span className="gp-muted text-[10px] font-semibold uppercase tracking-wide">{mp.priceUsd}</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm gp-num"
                    placeholder="29.99"
                  />
                </label>
                <label className="block">
                  <span className="gp-muted text-[10px] font-semibold uppercase tracking-wide">{mp.category}</span>
                  <select
                    value={editCat}
                    onChange={(e) => setEditCat(e.target.value as MarketCategory)}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm"
                  >
                    {MARKET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{t.market.categories[c]}</option>
                    ))}
                  </select>
                </label>
                <ProductImagesUpload
                  images={editImageUrls}
                  onChange={setEditImageUrls}
                  loading={editImageLoading}
                  onLoadingChange={setEditImageLoading}
                  onError={() => showToast(mp.imageError, "error")}
                  labels={imageUploadLabels}
                  productName={editName}
                />
                <label className="block">
                  <span className="gp-muted text-[10px] font-semibold uppercase tracking-wide">{mp.description}</span>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm resize-none"
                    placeholder={mp.descriptionPh}
                  />
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPublish}
                    onChange={(e) => setEditPublish(e.target.checked)}
                    className="rounded border-emerald-500/50 text-emerald-500"
                  />
                  <span className="gp-text text-xs font-medium">{mp.publishNow}</span>
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeProductEdit}
                    className="flex-1 py-3 rounded-xl gp-pill gp-text text-sm font-semibold"
                  >
                    {common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProductEdit}
                    disabled={editImageLoading}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-400 text-black text-sm font-bold disabled:opacity-50"
                  >
                    {mp.saveChanges}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const OrderCard = ({
  order,
  mp,
  statusLabel,
  statusClass,
  nextAction,
  onAdvance,
}: {
  order: MarketOrder;
  mp: Record<string, string>;
  statusLabel: string;
  statusClass: string;
  nextAction: string | null;
  onAdvance: (tracking?: string) => void;
}) => {
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const created = new Date(order.createdAt).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="rounded-xl border gp-glass p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="gp-num gp-text text-xs font-bold">{order.id}</p>
          <p className="gp-muted text-[10px] mt-0.5">{created}</p>
        </div>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[0.04] p-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <p className="gp-text text-xs font-semibold truncate">{order.buyer.fullName}</p>
        </div>
        <p className="gp-muted text-[10px] pl-5">{mp.orderPhone}: {order.buyer.phone}</p>
        <p className="gp-muted text-[10px] pl-5 truncate">{mp.orderEmail}: {order.buyer.email}</p>
        <p className="gp-muted text-[10px] pl-5">{mp.orderKyc}: {mp.orderKycVerified}</p>
      </div>

      <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.04] p-2.5">
        <div className="flex items-start gap-1.5">
          <Mail className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="gp-text text-[10px] font-semibold">{mp.orderShipping}</p>
            <p className="gp-muted text-[10px] mt-1 leading-relaxed">
              {order.shipping.recipientName} · {order.shipping.phone}
            </p>
            <p className="gp-muted text-[10px] mt-0.5 leading-relaxed">{formatShippingAddress(order.shipping)}</p>
            {order.shipping.notes.trim() && (
              <p className="gp-muted text-[10px] mt-1 italic">{order.shipping.notes}</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="gp-muted text-[10px] font-semibold mb-1">{mp.orderItems}</p>
        {order.items.map((item) => (
          <p key={item.productId} className="gp-text text-xs">
            {item.name} ×{item.qty}
          </p>
        ))}
        <p className="gp-num text-emerald-400 text-xs font-bold mt-1.5">
          {mp.orderTotal}: ${order.totalUsd.toFixed(2)} · {order.totalGat.toFixed(2)} GAT
        </p>
      </div>

      {order.status === "processing" && (
        <input
          type="text"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder={mp.orderTrackingPh}
          className="w-full px-3 py-2 rounded-xl gp-input border text-xs"
        />
      )}

      {nextAction && (
        <button
          type="button"
          onClick={() => onAdvance(order.status === "processing" ? tracking : undefined)}
          className="w-full py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold"
        >
          {nextAction}
        </button>
      )}

      {order.trackingNumber && (
        <p className="gp-muted text-[10px]">{mp.orderTracking}: {order.trackingNumber}</p>
      )}
    </div>
  );
};
