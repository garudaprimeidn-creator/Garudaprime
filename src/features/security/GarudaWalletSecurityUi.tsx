import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

export const SecuritySection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="gp-security-section">
    <div className="gp-security-section__head">
      <h3 className="gp-security-section__title">{title}</h3>
      <span className="gp-security-section__line" aria-hidden />
    </div>
    <div className="gp-security-section__card">{children}</div>
  </section>
);

export const SecurityRow = ({
  icon: Icon,
  iconTone = "emerald",
  title,
  desc,
  onClick,
  disabled,
  trailing,
  showChevron,
}: {
  icon: LucideIcon;
  iconTone?: "emerald" | "cyan" | "amber" | "neutral";
  title: string;
  desc?: string;
  onClick?: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
  showChevron?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || !onClick}
    className={`gp-security-row${!onClick ? " gp-security-row--static" : ""}`}
  >
    <span className={`gp-security-row__icon gp-security-row__icon--${iconTone}`}>
      <Icon className="w-4 h-4" strokeWidth={2} />
    </span>
    <span className="gp-security-row__body">
      <span className="gp-security-row__title">{title}</span>
      {desc && <span className="gp-security-row__desc">{desc}</span>}
    </span>
    <span className="gp-security-row__trail">
      {trailing}
      {showChevron && onClick && <ChevronRight className="w-4 h-4 gp-muted shrink-0" strokeWidth={2} />}
    </span>
  </button>
);
