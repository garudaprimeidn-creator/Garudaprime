import { motion, useReducedMotion } from "motion/react";
import garudaPrimeSplash from "../../assets/garuda-prime-splash.png";
import garudaPrimeSplash2x from "../../assets/garuda-prime-splash@2x.png";
import { OFFICIAL_WEB_URL } from "../../lib/app/branding";

type Props = {
  size?: number;
  className?: string;
  linkToWeb?: boolean;
};

export const LaunchBrandLogo = ({
  size = 160,
  className = "",
  linkToWeb = false,
}: Props) => {
  const img = (
    <img
      src={garudaPrimeSplash}
      srcSet={`${garudaPrimeSplash} 512w, ${garudaPrimeSplash2x} 1024w`}
      sizes={`${size}px`}
      alt="Garuda Prime Fintech"
      className={`gp-launch-logo object-contain select-none ${className}`}
      style={{ width: size, height: size }}
      decoding="async"
      fetchPriority="high"
      draggable={false}
    />
  );

  if (!linkToWeb) return img;

  return (
    <a
      href={OFFICIAL_WEB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded-xl"
      aria-label="Garuda Prime, buka situs resmi"
    >
      {img}
    </a>
  );
};

export const AnimatedLaunchBrandLogo = ({
  size = 160,
  className = "",
  linkToWeb = false,
}: Props) => {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div className={`gp-auth-logo-3d-stage gp-auth-logo-3d-stage--static ${className}`}>
        <LaunchBrandLogo size={size} linkToWeb={linkToWeb} />
      </div>
    );
  }

  return (
    <div className={`gp-auth-logo-3d-stage ${className}`}>
      <div className="gp-auth-launch-glow pointer-events-none" aria-hidden />
      <motion.div
        className="gp-auth-logo-3d-float relative z-[1]"
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: [0, -3, 0] }}
        transition={{
          opacity: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
          scale: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
          y: { duration: 4.2, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <LaunchBrandLogo size={size} linkToWeb={linkToWeb} />
      </motion.div>
    </div>
  );
};
