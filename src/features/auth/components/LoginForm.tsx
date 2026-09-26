import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { GlassCard, PrimaryAuthButton } from "./AuthLayout";

type Props = {
  email: string;
  password: string;
  remember: boolean;
  loading?: boolean;
  labels: {
    email: string;
    password: string;
    forgotPassword: string;
    rememberSession: string;
    signIn: string;
    signingIn: string;
  };
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onRememberChange: (v: boolean) => void;
  onForgotPassword: () => void;
  onSubmit: () => void;
};

export const LoginForm = ({
  email, password, remember, loading, labels,
  onEmailChange, onPasswordChange, onRememberChange, onForgotPassword, onSubmit,
}: Props) => {
  const [showPass, setShowPass] = React.useState(false);

  return (
    <>
      <GlassCard className="p-4 space-y-3">
        <div>
          <label className="gp-auth-label mb-1.5 block">{labels.email}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="ali@garudaprime.id"
            autoComplete="email"
            className="w-full px-4 py-3 rounded-xl gp-input gp-auth-input border focus:outline-none text-sm"
          />
        </div>
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="gp-auth-label">{labels.password}</label>
            <button type="button" onClick={onForgotPassword} className="text-[11px] gp-auth-accent-gold">
              {labels.forgotPassword}
            </button>
          </div>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full px-4 py-3 pr-12 rounded-xl gp-input gp-auth-input border focus:outline-none text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 gp-muted p-1"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs gp-muted cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => onRememberChange(e.target.checked)}
            className="gp-auth-checkbox w-4 h-4 rounded"
          />
          {labels.rememberSession}
        </label>
      </GlassCard>
      <PrimaryAuthButton onClick={onSubmit} disabled={loading}>
        {labels.signIn}
      </PrimaryAuthButton>
    </>
  );
};
