import React from "react";

/** Garuda Prime inline separator (readable at small sizes; avoid ·, ◈) */
export const GP_SEP = "/";
export const GP_SEP_INLINE = ` ${GP_SEP} `;
export const GP_ARROW = ",";
/** Clause break in UI sentences (replaces em-dash / ») */
export const GP_EMDASH_INLINE = ` ${GP_ARROW} `;

export const GpTextSep = ({ className = "" }: { className?: string }) => (
  <span className={`gp-text-sep ${className}`} aria-hidden>
    {GP_SEP}
  </span>
);

/** Ornamental rule, replaces flat horizontal lines in panels & sidebar */
export const GpOrnamentLine = ({ className = "" }: { className?: string }) => (
  <div className={`gp-ornament-line ${className}`} aria-hidden>
    <span className="gp-ornament-line__gem">{GP_SEP}</span>
    <span className="gp-ornament-line__track" />
    <span className="gp-ornament-line__gem">{GP_SEP}</span>
  </div>
);

/** Section divider with optional label */
export const GpSectionRule = ({
  label,
  className = "",
}: {
  label?: string;
  className?: string;
}) => (
  <div className={`gp-section-rule ${className}`}>
    <span className="gp-section-rule__track" />
    {label ? <span className="gp-section-rule__label">{label}</span> : <span className="gp-ornament-line__gem">{GP_SEP}</span>}
    <span className="gp-section-rule__track" />
  </div>
);
