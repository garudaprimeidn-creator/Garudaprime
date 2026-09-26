import { Plus, Trash2 } from "lucide-react";
import { useApp } from "./AppContext";
import { useLanguage } from "./LanguageContext";
import { TokenIcon } from "./TokenIcon";

export const CustomTokenSettings = () => {
  const { tokens, removeCustomToken, showToast, toggleOverlay } = useApp();
  const { t } = useLanguage();
  const w = t.wallet;
  const pd = t.profileDetails;

  const customTokens = tokens.filter((t) => t.custom && t.contractAddress);

  return (
    <div className="space-y-3">
      <p className="gp-muted text-xs leading-relaxed">{pd.customTokenHint}</p>

      {customTokens.length === 0 ? (
        <div className="rounded-xl border border-dashed gp-glass p-5 text-center">
          <p className="gp-muted text-sm">{pd.customTokenEmpty}</p>
          <button
            type="button"
            onClick={() => toggleOverlay("importToken")}
            className="mt-3 inline-flex items-center gap-1.5 text-emerald-400 text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            {w.addCustomToken}
          </button>
        </div>
      ) : (
        <>
          {customTokens.map((tok) => (
            <div key={tok.contractAddress} className="gp-glass border rounded-xl p-3 flex items-center gap-3">
              <TokenIcon
                symbol={tok.symbol}
                size="md"
                color={tok.color}
                logoUrl={tok.logoUrl}
                contractAddress={tok.contractAddress}
              />
              <div className="flex-1 min-w-0">
                <p className="gp-text text-sm font-semibold">{tok.symbol}</p>
                <p className="gp-muted text-[10px] truncate">{tok.name}</p>
                <p className="gp-muted text-[10px] font-mono truncate mt-0.5">{tok.contractAddress}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  removeCustomToken(tok.contractAddress!);
                  showToast(w.customTokenRemoved, "success");
                }}
                className="shrink-0 px-2.5 py-2 rounded-xl text-red-400 text-[11px] font-semibold border border-red-500/30 hover:bg-red-500/10 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {w.customTokenRemove}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => toggleOverlay("importToken")}
            className="w-full py-2.5 rounded-xl border border-dashed gp-glass flex items-center justify-center gap-2 gp-muted text-sm gp-hover-row transition-all"
          >
            <Plus className="w-4 h-4" />
            {w.addCustomToken}
          </button>
        </>
      )}
    </div>
  );
};
