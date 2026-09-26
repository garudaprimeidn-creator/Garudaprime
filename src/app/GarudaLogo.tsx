import type React from "react";
import garudaPrimeBrandDark from "../assets/garuda-prime-brand-dark.png";
import garudaPrimeBrandDark2x from "../assets/garuda-prime-brand-dark@2x.png";
import garudaPrimeSplash from "../assets/garuda-prime-splash.png";
import garudaPrimeSplash2x from "../assets/garuda-prime-splash@2x.png";
import garudaPrimeIcon from "../assets/garuda-prime-icon.png";
import garudaPrimeIcon2x from "../assets/garuda-prime-icon@2x.png";
import garudaPrimeIconLight from "../assets/garuda-prime-icon-light.png";
import garudaPrimeIconLight2x from "../assets/garuda-prime-icon-light@2x.png";
import { useTheme } from "./ThemeContext";
import { OFFICIAL_WEB_URL } from "../lib/app/branding";

export type LogoVariant = "full" | "brand" | "icon";

export const GarudaLogo = ({
  size = 36,
  variant = "icon",
  className = "",
  glow = false,
  bare = false,
  linkToWeb = false,
  webHref,
}: {
  size?: number;
  variant?: LogoVariant;
  className?: string;
  /** Gold + emerald radial glow, auth / splash screens */
  glow?: boolean;
  /** No drop-shadow, onboarding / login */
  bare?: boolean;
  /** Link logo to official Garuda Prime website */
  linkToWeb?: boolean;
  /** Custom href when linkToWeb is true */
  webHref?: string;
}) => {
  const { isDark } = useTheme();
  /** Pre-auth screens use charcoal canvas; in-app chrome follows theme. */
  const brandOnDark = bare ? true : isDark;
  const emblemSrc = garudaPrimeSplash;
  const emblemSrc2x = garudaPrimeSplash2x;
  const brandSrc = brandOnDark ? garudaPrimeBrandDark : garudaPrimeSplash;
  const brandSrc2x = brandOnDark ? garudaPrimeBrandDark2x : garudaPrimeSplash2x;
  const iconSrc = brandOnDark ? garudaPrimeIcon : garudaPrimeIconLight;
  const iconSrc2x = brandOnDark ? garudaPrimeIcon2x : garudaPrimeIconLight2x;
  const iconUsesCssSize = className.includes("gp-top-bar-brand__logo");

  const wrap = (node: React.ReactNode) =>
    glow ? (
      <div className={`relative inline-flex items-center justify-center ${className}`}>
        {isDark && (
          <>
            <div className="gp-auth-logo-pedestal absolute pointer-events-none" aria-hidden />
            <div className="gp-auth-logo-spotlight absolute pointer-events-none" aria-hidden />
          </>
        )}
        <div className="gp-auth-logo-glow gp-auth-logo-glow--gold absolute -inset-14 rounded-full blur-3xl pointer-events-none" aria-hidden />
        <div className="gp-auth-logo-glow gp-auth-logo-glow--emerald absolute -inset-10 rounded-full blur-2xl pointer-events-none" aria-hidden />
        <div className="gp-auth-logo-ring absolute inset-0 rounded-full pointer-events-none" aria-hidden />
        {node}
      </div>
    ) : (
      <>{node}</>
    );

  const logoImgClass = bare
    ? "gp-auth-logo-bare gp-brand-logo-img object-contain select-none relative z-[1]"
    : glow && isDark
    ? "gp-auth-logo-img gp-brand-logo-img object-contain select-none relative z-[1]"
    : isDark
    ? "gp-brand-logo-img object-contain select-none relative z-[1] drop-shadow-[0_8px_32px_rgba(212,175,55,0.18)]"
    : "gp-auth-logo-bare gp-brand-logo-img object-contain select-none relative z-[1]";

  const withWebLink = (node: React.ReactNode, compact = false) => {
    if (!linkToWeb) return node;
    return (
      <a
        href={webHref || OFFICIAL_WEB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={
          compact
            ? "gp-app-logo-link"
            : "inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded-lg"
        }
        aria-label="Garuda Prime, buka situs resmi"
      >
        {node}
      </a>
    );
  };

  if (variant === "full") {
    const fullSrc = bare ? emblemSrc : brandSrc;
    const fullSrc2x = bare ? emblemSrc2x : brandSrc2x;
    const fullImgProps = fullSrc2x
      ? {
          srcSet: `${fullSrc} 512w, ${fullSrc2x} 1024w`,
          sizes: `${size}px`,
        }
      : {};
    return withWebLink(wrap(
      <img
        src={fullSrc}
        {...fullImgProps}
        alt="Garuda Prime · AI · Web3 · Syariah Ecosystem"
        className={`${logoImgClass} gp-auth-logo-full`}
        style={{
          width: size,
          height: size,
          maxWidth: size,
          maxHeight: size,
        }}
        decoding="async"
        fetchPriority="high"
        draggable={false}
      />
    ));
  }

  if (variant === "brand") {
    const brandClass = bare
      ? "gp-auth-logo-bare gp-brand-logo-img object-contain select-none mx-auto relative z-[1]"
      : glow && isDark
      ? "gp-auth-logo-img gp-brand-logo-img object-contain select-none mx-auto relative z-[1]"
      : "gp-brand-logo-img object-contain select-none mx-auto relative z-[1] drop-shadow-[0_6px_24px_rgba(212,175,55,0.15)]";
    const brandImgProps = brandSrc2x
      ? {
          srcSet: `${brandSrc} 512w, ${brandSrc2x} 1024w`,
          sizes: `${size}px`,
        }
      : {};
    return withWebLink(wrap(
      <img
        src={bare ? emblemSrc : brandSrc}
        {...(bare ? { srcSet: `${emblemSrc} 512w, ${emblemSrc2x} 1024w`, sizes: `${size}px` } : brandImgProps)}
        alt="Garuda Prime"
        className={brandClass}
        style={{ width: size, height: size, maxWidth: size, maxHeight: size }}
        decoding="async"
        draggable={false}
      />
    ));
  }

  return withWebLink(
    <div
      className={`gp-app-logo-mark ${className}`}
      style={iconUsesCssSize ? undefined : { width: size, height: size }}
      aria-hidden={linkToWeb}
    >
      <img
        src={iconSrc}
        srcSet={`${iconSrc} 512w, ${iconSrc2x} 1024w`}
        sizes={iconUsesCssSize ? "2rem" : `${size}px`}
        alt={linkToWeb ? "" : "Garuda Prime"}
        className="gp-app-logo-mark__img gp-brand-logo-img"
        width={size}
        height={size}
        decoding="async"
        fetchPriority={iconUsesCssSize ? "high" : "auto"}
        loading={iconUsesCssSize ? "eager" : "lazy"}
        draggable={false}
      />
    </div>,
    true,
  );
};
