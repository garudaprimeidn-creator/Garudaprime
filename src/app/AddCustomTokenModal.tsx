import React, { useState } from "react";
import { X, Loader2, Plus } from "lucide-react";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { showAppToast } from "./appToast";

export const AddCustomTokenModal = ({ onClose }: { onClose: () => void }) => {
  const { importCustomToken } = useApp();
  const { t } = useLanguage();
  const w = t.wallet;
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const addr = address.trim();
    if (!addr) {
      showAppToast(w.customTokenInvalid, "error");
      return;
    }
    setBusy(true);
    try {
      await importCustomToken(addr);
      showAppToast(w.customTokenAdded, "success");
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : w.customTokenFailed;
      if (msg.includes("Duplicate")) showAppToast(w.customTokenDuplicate, "warning");
      else if (msg.includes("Invalid")) showAppToast(w.customTokenInvalid, "error");
      else showAppToast(w.customTokenFailed, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-5 pb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plus className="w-5 h-5 text-emerald-400" />
          <h3 className="gp-text font-bold text-base">{w.addCustomToken}</h3>
        </div>
        <button type="button" onClick={onClose} className="gp-muted gp-icon-btn p-1">
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="gp-muted text-xs leading-relaxed">{w.importTokenHint}</p>

      <div className="space-y-2">
        <label className="gp-muted text-[10px] uppercase tracking-wider font-semibold">
          {w.customTokenAddressLabel}
        </label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x..."
          className="w-full gp-input rounded-xl px-3 py-2.5 text-xs font-mono"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <p className="gp-muted text-[10px] leading-relaxed">{w.customTokenNetworkHint}</p>

      <button
        type="button"
        disabled={busy || !address.trim()}
        onClick={() => void submit()}
        className="w-full py-3 rounded-xl bg-emerald-500 text-black text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {w.customTokenImport}
      </button>
    </div>
  );
};
