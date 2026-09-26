export type PortfolioAllocation = {
  name: string;
  value: number;
  color: string;
};

export const PortfolioMix = ({
  items,
  title,
}: {
  items: PortfolioAllocation[];
  title: string;
}) => (
  <div className="gp-portfolio-mix">
    <div className="gp-portfolio-mix-head">
      <p className="gp-portfolio-mix-title">{title}</p>
      <span className="gp-portfolio-mix-total gp-num">100%</span>
    </div>

    <div className="gp-portfolio-mix-bar" role="img" aria-label={title}>
      {items.map((a) => (
        <div
          key={a.name}
          className="gp-portfolio-mix-segment"
          style={{ flexGrow: a.value, flexBasis: 0, backgroundColor: a.color }}
          title={`${a.name} ${a.value}%`}
        />
      ))}
    </div>

    <div
      className="gp-portfolio-mix-strip"
      style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
    >
      {items.map((a) => (
        <span key={a.name} className="gp-portfolio-mix-chip">
          <span className="gp-portfolio-mix-dot" style={{ backgroundColor: a.color }} />
          <span className="gp-portfolio-mix-name">{a.name}</span>
          <span className="gp-portfolio-mix-pct gp-num">{a.value}%</span>
        </span>
      ))}
    </div>
  </div>
);
