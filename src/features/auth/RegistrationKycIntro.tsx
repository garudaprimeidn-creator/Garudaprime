import { motion } from "motion/react";
import { ChevronLeft, ShieldCheck, FileText, Camera, MapPin, Wallet, CheckCircle } from "lucide-react";
import { useLanguage } from "../../app/LanguageContext";
import { formatAddress } from "../../lib/web3/walletService";
import { PremiumAuthBackground } from "./SplashScreen";
import { AuthLogoHeader } from "./AuthLogoHeader";
type Props = {
  walletAddress?: string;
  onStart: () => void;
  onSkip: () => void;
  onBack: () => void;
};

export const RegistrationKycIntro = ({ walletAddress, onStart, onSkip, onBack }: Props) => {
  const { t } = useLanguage();
  const reg = t.registration;

  const highlights = [
    { icon: FileText, label: reg.kycId },
    { icon: Camera, label: reg.kycFace },
    { icon: MapPin, label: reg.kycAddress },
  ];

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden gp-auth-scene gp-auth-luxe min-h-0">
      <PremiumAuthBackground />

      <div className="relative px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <motion.button
          type="button"
          onClick={onBack}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={reg.back}
          className="absolute left-6 top-[max(1rem,env(safe-area-inset-top))] z-10 w-10 h-10 flex items-center justify-center rounded-full gp-auth-skip gp-auth-skip--luxe"
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>
        <AuthLogoHeader size={56} />
      </div>

      <div className="relative flex-1 overflow-y-auto px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center pt-4 pb-6"
        >
          <div className="w-20 h-20 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-5">
            <ShieldCheck className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="gp-auth-luxe-title text-xl">{reg.kycIntroTitle}</h2>
          <p className="gp-auth-luxe-desc mt-2 max-w-[320px] text-sm leading-relaxed">{reg.kycIntroSubtitle}</p>
        </motion.div>

        <div className="gp-auth-luxe-panel rounded-2xl p-4 space-y-3 mb-4">
          {walletAddress && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0 text-left">
                <p className="gp-muted text-[10px]">{reg.walletConnected}</p>
                <p className="gp-num gp-text text-xs font-semibold truncate">{formatAddress(walletAddress)}</p>
              </div>
              <Wallet className="w-4 h-4 text-emerald-400/70 shrink-0 ml-auto" />
            </div>
          )}
          {highlights.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 text-left">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="gp-text text-sm">{label}</p>
            </div>
          ))}
          <p className="gp-muted text-xs leading-relaxed pt-1 border-t border-[rgba(var(--lx-line),0.2)]">
            {reg.kycIntroNote}
          </p>
        </div>

        <div className="space-y-3 mt-auto">
          <button
            type="button"
            onClick={onStart}
            className="gp-auth-btn gp-auth-btn--luxe w-full py-4 rounded-2xl font-bold text-sm"
          >
            {reg.startKycBtn}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="gp-auth-btn-secondary gp-auth-btn-secondary--luxe w-full py-4 rounded-2xl font-semibold text-sm"
          >
            {reg.skipKycBtn}
          </button>
          <p className="text-center gp-muted text-[10px] px-4">{reg.skipKyc}</p>
        </div>
      </div>
    </div>
  );
};
