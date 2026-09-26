import React from "react";
import { motion } from "motion/react";
import {
  ChevronLeft, ChevronRight, Loader2, Shield, Wallet, Zap,
} from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";
import type { ConnectOption, WalletProvider } from "../../lib/web3/walletService";

const PROVIDER_STYLES: Record<
  Exclude<ConnectOption, "kycport">,
  { emoji: string; accent: string; ring: string }
> = {
  metamask: { emoji: "🦊", accent: "from-orange-500/15 to-amber-400/10", ring: "border-orange-500/25" },
  walletconnect: { emoji: "🔗", accent: "from-blue-500/15 to-cyan-400/10", ring: "border-blue-500/25" },
  trustwallet: { emoji: "🛡️", accent: "from-sky-500/15 to-blue-400/10", ring: "border-sky-500/25" },
};

type ProviderRow = { provider: ConnectOption; name: string; sub: string };

type Props = {
  busy: boolean;
  providers: ProviderRow[];
  onConnect: (provider: WalletProvider) => void;
  onBack?: () => void;
};

export function RegistrationExternalWalletSheet({
  busy,
  providers,
  onConnect,
  onBack,
}: Props) {
  const { t } = useLanguage();
  const reg = t.registration;
  const wc = t.auth.walletconnect as Record<string, string>;
  const auth = t.auth;

  const externalRows = providers.filter(
    (p): p is ProviderRow & { provider: WalletProvider } =>
      p.provider === "metamask" || p.provider === "walletconnect" || p.provider === "trustwallet",
  );

  return (
    <div className="gp-reg-wallet-sheet flex flex-col min-h-0 flex-1">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="mx-5 mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 disabled:opacity-50 w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
          {wc.connectExternalBack ?? reg.continueBtn}
        </button>
      )}

      <div className="px-5 pb-3 shrink-0">
        <p className="gp-reg-wallet-sheet__kicker text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5">
          {wc.connectExternalKicker ?? reg.walletTitle}
        </p>
        <h3 className="gp-text text-lg font-bold tracking-tight leading-snug">
          {wc.connectExternalModalTitle ?? "Dompet Eksternal"}
        </h3>
        <p className="gp-muted text-xs mt-1.5 leading-relaxed max-w-[320px]">
          {wc.connectExternalModalSubtitle ?? reg.walletPickHint}
        </p>
      </div>

      <div className="overflow-y-auto min-h-0 flex-1 px-4 pb-4 space-y-4">
        <div className="gp-reg-wallet-sheet__network">
          <span className="gp-reg-wallet-sheet__network-icon">
            <Zap className="w-3.5 h-3.5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="gp-text text-[11px] font-bold">Sidra Network</p>
            <p className="gp-muted text-[10px] leading-relaxed mt-0.5">
              {wc.sidraNetworkHint}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="gp-reg-wallet-sheet__section-label px-1">
            {wc.connectExternalSection ?? reg.importWallet}
          </p>

          {externalRows.map((row) => {
            const style = PROVIDER_STYLES[row.provider];
            return (
              <motion.button
                key={row.provider}
                type="button"
                disabled={busy}
                whileTap={{ scale: 0.99 }}
                onClick={() => onConnect(row.provider)}
                className="gp-reg-wallet-provider w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-left disabled:opacity-55"
              >
                <span
                  className={`gp-reg-wallet-provider__icon bg-gradient-to-br ${style.accent} ${style.ring}`}
                >
                  <span className="text-xl leading-none" aria-hidden>{style.emoji}</span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="gp-text text-sm font-bold">{row.name}</p>
                  <p className="gp-muted text-[10px] mt-0.5">{row.sub}</p>
                </div>
                <span className="gp-reg-wallet-provider__chevron shrink-0">
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                  )}
                </span>
              </motion.button>
            );
          })}
        </div>

        <div className="gp-reg-wallet-sheet__security">
          <Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" strokeWidth={2} />
          <div className="min-w-0">
            <p className="gp-text text-[11px] font-bold flex items-center gap-1.5">
              <Wallet className="w-3 h-3 opacity-70" />
              {auth.walletSecurityTitle}
            </p>
            <p className="gp-muted text-[10px] leading-relaxed mt-1">
              {auth.walletSecurity}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
