import { useLanguage } from "./LanguageContext";
import { type ShippingAddress } from "../lib/merchant/shippingAddress";

export const MarketShippingForm = ({
  value,
  onChange,
  buyerName,
  fieldErrors,
  compact,
}: {
  value: ShippingAddress;
  onChange: (v: ShippingAddress) => void;
  buyerName: string;
  /** @deprecated KYC domicile is not used for digital delivery. */
  kycAddressText?: string;
  hasKycAddress?: boolean;
  onUseKyc?: () => void;
  fieldErrors: Set<keyof ShippingAddress>;
  compact?: boolean;
}) => {
  const { t } = useLanguage();
  const m = t.market;
  const set = (key: keyof ShippingAddress, v: string) => onChange({ ...value, [key]: v });
  const err = (key: keyof ShippingAddress) =>
    fieldErrors.has(key) ? <p className="text-red-400 text-[10px] mt-0.5">{m.shippingFieldRequired}</p> : null;
  const inputCls = (key: keyof ShippingAddress) =>
    `mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm ${fieldErrors.has(key) ? "border-red-400/50" : ""}`;

  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 space-y-1.5">
        <p className="gp-text text-xs font-semibold">{m.shippingFromKyc}</p>
        <p className="gp-muted text-[10px] leading-relaxed">{m.shippingDigitalHint}</p>
        <p className="gp-text text-[11px]">{buyerName}</p>
      </div>
      <div>
        <label className="gp-muted text-[10px] font-semibold">{m.shippingRecipient}</label>
        <input type="text" value={value.recipientName} onChange={(e) => set("recipientName", e.target.value)} className={inputCls("recipientName")} autoComplete="name" />
        {err("recipientName")}
      </div>
      <div>
        <label className="gp-muted text-[10px] font-semibold">{m.shippingEmail}</label>
        <input type="email" value={value.email} onChange={(e) => set("email", e.target.value)} className={inputCls("email")} autoComplete="email" inputMode="email" />
        {err("email")}
      </div>
      <div>
        <label className="gp-muted text-[10px] font-semibold">{m.shippingPhone}</label>
        <input type="tel" value={value.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls("phone")} autoComplete="tel" />
        {err("phone")}
      </div>
      <div>
        <label className="gp-muted text-[10px] font-semibold">{m.shippingNotes}</label>
        <input type="text" value={value.notes} onChange={(e) => set("notes", e.target.value)} className="mt-1 w-full px-3 py-2.5 rounded-xl gp-input border text-sm" />
      </div>
    </div>
  );
};
