import { useMemo, useState } from "react";
import {
  X, Package, Mail, MessageCircle, Copy, ExternalLink, Ban, Store, CheckCircle, KeyRound,
} from "lucide-react";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import {
  buildTrackingUrl,
  buildWhatsAppLink,
  getBuyerOrders,
  getOrderSellerContact,
  orderStatusProgress,
  type MarketOrder,
  type OrderStatus,
} from "../lib/merchant/orderService";
import { formatShippingAddress } from "../lib/merchant/shippingAddress";

const STATUS_STEPS: OrderStatus[] = ["pending", "processing", "shipped", "delivered"];

export const BuyerOrdersPanel = ({ onClose }: { onClose: () => void }) => {
  const { marketOrders, profileEmail, profileName, shippingAddress, cancelOrder, copyText, showToast } = useApp();
  const { t } = useLanguage();
  const bo = t.buyerOrders;

  const myOrders = useMemo(
    () => getBuyerOrders(marketOrders, { email: profileEmail, phone: shippingAddress.phone }),
    [marketOrders, profileEmail, shippingAddress.phone],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="gp-panel-header flex items-start gap-3 p-4 pt-6 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center text-cyan-400 shrink-0">
          <Package className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="gp-text font-bold text-base leading-tight">{bo.title}</h3>
          <p className="gp-muted text-xs mt-0.5 leading-snug">{bo.subtitle}</p>
        </div>
        <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="gp-panel-body p-4 space-y-3" style={{ scrollbarWidth: "none" }}>
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3">
          <p className="gp-muted text-[11px] leading-relaxed">{bo.info}</p>
        </div>

        {myOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed gp-glass p-10 text-center">
            <Package className="w-10 h-10 gp-muted mx-auto mb-2 opacity-40" />
            <p className="gp-muted text-sm">{bo.empty}</p>
          </div>
        ) : (
          myOrders.map((order) => (
            <BuyerOrderCard
              key={order.id}
              order={order}
              bo={bo}
              buyerName={profileName}
              onCancel={() => {
                if (cancelOrder(order.id)) showToast(bo.cancelSuccess, "success");
                else showToast(bo.cancelFailed, "error");
              }}
              onCopy={(text, label) => copyText(text, label)}
            />
          ))
        )}
      </div>
    </div>
  );
};

const BuyerOrderCard = ({
  order,
  bo,
  buyerName,
  onCancel,
  onCopy,
}: {
  order: MarketOrder;
  bo: Record<string, string | ((...args: never[]) => string)>;
  buyerName: string;
  onCancel: () => void;
  onCopy: (text: string, label: string) => void;
}) => {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const contact = getOrderSellerContact(order);
  const progress = orderStatusProgress(order.status);
  const created = new Date(order.createdAt).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const accessUrl = order.trackingNumber ? buildTrackingUrl(order.trackingNumber) : null;
  const deliveryEmail = formatShippingAddress(order.shipping);

  const statusLabel = (s: OrderStatus) => {
    const map: Record<OrderStatus, string> = {
      pending: bo.statusPending as string,
      processing: bo.statusProcessing as string,
      shipped: bo.statusShipped as string,
      delivered: bo.statusDelivered as string,
      cancelled: bo.statusCancelled as string,
    };
    return map[s];
  };

  const waMessage = (bo.waMessage as (id: string, name: string) => string)(order.id, buyerName);

  return (
    <div className="rounded-xl border gp-glass p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="gp-num gp-text text-xs font-bold">{order.id}</p>
          <p className="gp-muted text-[10px] mt-0.5">{created}</p>
          <p className="gp-text text-xs mt-1 flex items-center gap-1">
            <Store className="w-3 h-3 text-emerald-400 shrink-0" />
            {order.sellerName}
          </p>
        </div>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
          order.status === "cancelled" ? "bg-red-500/15 text-red-400"
            : order.status === "delivered" ? "bg-emerald-500/15 text-emerald-400"
              : "bg-amber-500/15 text-amber-400"
        }`}>
          {statusLabel(order.status)}
        </span>
      </div>

      {order.status !== "cancelled" && (
        <div className="flex items-center gap-1">
          {STATUS_STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1 min-w-0 gap-1">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                progress >= i ? "bg-emerald-500 text-black" : "gp-subtle gp-muted"
              }`}>
                {progress > i ? <CheckCircle className="w-3 h-3" /> : <span className="text-[9px] font-bold gp-num">{i + 1}</span>}
              </div>
              {i < STATUS_STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 rounded ${progress > i ? "bg-emerald-500" : "gp-subtle"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        {order.items.map((item) => (
          <p key={item.productId} className="gp-text text-xs">{item.name} ×{item.qty}</p>
        ))}
        <p className="gp-num text-emerald-400 text-xs font-bold mt-1">
          {order.totalGat.toFixed(2)} GAT · ${order.totalUsd.toFixed(2)}
        </p>
      </div>

      {deliveryEmail !== "-" && (
        <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-2.5 flex items-start gap-1.5">
          <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="gp-text text-[10px] font-semibold">{bo.deliveryEmail as string}</p>
            <p className="gp-muted text-[10px] mt-0.5 truncate">{deliveryEmail}</p>
          </div>
        </div>
      )}

      {order.trackingNumber && order.status !== "cancelled" && (
        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.05] p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
            <p className="gp-text text-[10px] font-semibold">{bo.trackingTitle}</p>
          </div>
          <p className="gp-num gp-text text-xs font-bold break-all">{order.trackingNumber}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onCopy(order.trackingNumber!, bo.trackingNo as string)}
              className="flex-1 py-2 rounded-lg gp-pill text-[10px] font-semibold flex items-center justify-center gap-1"
            >
              <Copy className="w-3 h-3" /> {bo.copyTracking}
            </button>
            {accessUrl ? (
              <a
                href={accessUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[10px] font-semibold flex items-center justify-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> {bo.trackPackage}
              </a>
            ) : null}
          </div>
        </div>
      )}

      {order.status !== "cancelled" && (
        <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-2.5 space-y-2">
          <p className="gp-text text-[10px] font-semibold">{bo.contactSeller}</p>
          <p className="gp-muted text-[10px] leading-relaxed">{bo.contactHint}</p>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={buildWhatsAppLink(contact.phone, waMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 rounded-xl bg-[#25D366]/15 border border-[#25D366]/30 text-[#25D366] text-[10px] font-bold flex items-center justify-center gap-1"
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
            <a
              href={`mailto:${contact.email}?subject=${encodeURIComponent(`Pesanan ${order.id}`)}&body=${encodeURIComponent(waMessage)}`}
              className="py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-[10px] font-bold flex items-center justify-center gap-1"
            >
              <Mail className="w-3.5 h-3.5" /> Email
            </a>
          </div>
        </div>
      )}

      {order.status === "pending" && (
        confirmCancel ? (
          <div className="space-y-2">
            <p className="gp-muted text-[10px] text-center">{bo.cancelConfirm}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmCancel(false)} className="py-2 rounded-xl gp-pill text-xs font-semibold">
                {bo.cancelNo}
              </button>
              <button
                type="button"
                onClick={() => { onCancel(); setConfirmCancel(false); }}
                className="py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold"
              >
                {bo.cancelYes}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="w-full py-2 rounded-xl border border-red-500/25 text-red-400 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Ban className="w-3.5 h-3.5" /> {bo.cancelOrder}
          </button>
        )
      )}
    </div>
  );
};
