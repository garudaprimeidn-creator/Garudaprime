import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { MarketShippingForm } from "./MarketShippingForm";
import { missingShippingFields } from "../lib/merchant/shippingAddress";

export const ShippingSettings = () => {
  const {
    shippingAddress, setShippingAddress, saveShippingAddressProfile,
    buildDefaultShipping, profileName, showToast,
  } = useApp();
  const { t } = useLanguage();
  const pd = t.profileDetails;
  const m = t.market;
  const [fieldErrors, setFieldErrors] = useState<Set<keyof typeof shippingAddress>>(new Set());

  useEffect(() => {
    setShippingAddress(buildDefaultShipping());
    setFieldErrors(new Set());
  }, [buildDefaultShipping, setShippingAddress]);

  const applyProfile = () => {
    const synced = buildDefaultShipping();
    setShippingAddress(synced);
    setFieldErrors(new Set());
    showToast(m.shippingKycSynced, "success");
  };

  const handleSave = () => {
    const missing = missingShippingFields(shippingAddress);
    if (missing.length > 0) {
      setFieldErrors(new Set(missing));
      showToast(m.shippingInvalid, "error");
      return;
    }
    saveShippingAddressProfile(shippingAddress);
    setFieldErrors(new Set());
    showToast(pd.shippingSaved, "success");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 flex gap-2">
        <Mail className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="gp-muted text-[11px] leading-relaxed">{pd.shippingInfo}</p>
      </div>
      <MarketShippingForm
        value={shippingAddress}
        onChange={(v) => {
          setShippingAddress(v);
          if (fieldErrors.size > 0) setFieldErrors(new Set(missingShippingFields(v)));
        }}
        buyerName={profileName}
        fieldErrors={fieldErrors}
      />
      <button
        type="button"
        onClick={applyProfile}
        className="w-full py-2 rounded-xl border border-emerald-500/30 text-emerald-400 text-xs font-semibold"
      >
        {m.shippingUseKyc}
      </button>
      {fieldErrors.size > 0 && (
        <p className="text-red-400 text-xs font-semibold">{m.shippingInvalid}</p>
      )}
      <button
        type="button"
        onClick={handleSave}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-sm"
      >
        {pd.shippingSave}
      </button>
    </div>
  );
};
