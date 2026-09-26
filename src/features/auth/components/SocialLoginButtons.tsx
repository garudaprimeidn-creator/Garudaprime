import React from "react";
import { motion } from "motion/react";
import { Wallet } from "lucide-react";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current gp-text" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const SocialBtn = ({
  label, onClick, disabled, children,
}: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
  <motion.button
    type="button"
    onClick={onClick}
    disabled={disabled}
    whileHover={{ scale: disabled ? 1 : 1.03, boxShadow: disabled ? undefined : "0 0 20px rgba(13, 202, 130, 0.15)" }}
    whileTap={{ scale: disabled ? 1 : 0.97 }}
    className="gp-auth-luxe-social flex flex-1 flex-col items-center gap-1.5 py-3 rounded-2xl outline-none disabled:opacity-45 disabled:pointer-events-none"
  >
    <div className="w-10 h-10 gp-auth-luxe-social__icon flex items-center justify-center">
      {children}
    </div>
    <span className="text-[10px] font-medium gp-auth-luxe-social__label">{label}</span>
  </motion.button>
);

type Props = {
  labels: { google: string; apple: string; wallet: string };
  disabled?: boolean;
  onGoogle: () => void;
  onApple: () => void;
  onWallet: () => void;
};

export const SocialLoginButtons = ({ labels, disabled, onGoogle, onApple, onWallet }: Props) => (
  <div className="flex gap-2">
    <SocialBtn label={labels.google} disabled={disabled} onClick={onGoogle}><GoogleIcon /></SocialBtn>
    <SocialBtn label={labels.apple} disabled={disabled} onClick={onApple}><AppleIcon /></SocialBtn>
    <SocialBtn label={labels.wallet} disabled={disabled} onClick={onWallet}>
      <Wallet className="w-[18px] h-[18px] gp-auth-accent-gold" strokeWidth={2.2} />
    </SocialBtn>
  </div>
);

export { GoogleIcon, AppleIcon };
