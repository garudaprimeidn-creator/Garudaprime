import { motion, useReducedMotion } from "motion/react";
import { GarudaLogo, type LogoVariant } from "../../../app/GarudaLogo";

type Props = {
  variant?: LogoVariant;
  size?: number;
  className?: string;
  linkToWeb?: boolean;
};

const prefersMobileLogo = () =>
  typeof window !== "undefined"
  && (window.matchMedia("(max-width: 768px)").matches
    || window.matchMedia("(pointer: coarse)").matches);

export const AnimatedGarudaLogo = ({
  variant = "brand",
  size = 48,
  className = "",
  linkToWeb = false,
}: Props) => {
  const reduceMotion = useReducedMotion();
  const mobileStatic = reduceMotion || prefersMobileLogo();

  if (mobileStatic) {
    return (
      <div className={`gp-auth-logo-3d-stage gp-auth-logo-3d-stage--static ${className}`}>
        <GarudaLogo variant={variant} size={size} bare linkToWeb={linkToWeb} />
      </div>
    );
  }

  return (
    <div className={`gp-auth-logo-3d-stage ${className}`}>
      <div className="gp-auth-logo-3d-glow pointer-events-none" aria-hidden />
      <motion.div
        className="gp-auth-logo-3d-float relative z-[1]"
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: [0, -4, 0] }}
        transition={{
          opacity: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
          scale: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
          y: { duration: 4.5, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <GarudaLogo variant={variant} size={size} bare linkToWeb={linkToWeb} />
      </motion.div>
    </div>
  );
};
