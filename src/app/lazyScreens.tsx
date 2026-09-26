import React, { lazy, Suspense, type ComponentType } from "react";
import { PanelErrorBoundary } from "./PanelErrorBoundary";

const retryLazy = <P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
) => lazy(() => loader().catch(() => {
  window.location.reload();
  return new Promise<{ default: ComponentType<P> }>(() => undefined);
}));

const MarketScreenLazy = retryLazy(() =>
  import("./MarketScreen").then((m) => ({ default: m.MarketScreen })),
);
const CommunityScreenLazy = retryLazy(() =>
  import("./CommunityScreen").then((m) => ({ default: m.CommunityScreen })),
);
const InvestScreenLazy = retryLazy(() =>
  import("./InvestScreen").then((m) => ({ default: m.InvestScreen })),
);
const ToolsPanelLazy = retryLazy(() =>
  import("./ToolsPanel").then((m) => ({ default: m.ToolsPanel })),
);
const GarudaChainPanelLazy = retryLazy(() =>
  import("./GarudaChainPanel").then((m) => ({ default: m.GarudaChainPanel })),
);
const GovernancePanelLazy = retryLazy(() =>
  import("./GovernancePanel").then((m) => ({ default: m.GovernancePanel })),
);
const MainnetMigrationPanelLazy = retryLazy(() =>
  import("./MainnetMigrationPanel").then((m) => ({ default: m.MainnetMigrationPanel })),
);

const ScreenFallback = () => (
  <div className="flex justify-center py-16">
    <div className="w-6 h-6 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
  </div>
);

const withSuspense = (node: React.ReactNode) => (
  <Suspense fallback={<ScreenFallback />}>{node}</Suspense>
);

export const LazyMarketScreen = () => withSuspense(<MarketScreenLazy />);
export const LazyCommunityScreen = () => withSuspense(<CommunityScreenLazy />);
export const LazyInvestScreen = () => withSuspense(<InvestScreenLazy />);
export const LazyToolsPanel = ({
  tool,
  onClose,
}: {
  tool: React.ComponentProps<typeof ToolsPanelLazy>["tool"];
  onClose: () => void;
}) => (
  <PanelErrorBoundary title="Riwayat transaksi gagal dimuat">
    {withSuspense(<ToolsPanelLazy tool={tool} onClose={onClose} />)}
  </PanelErrorBoundary>
);
export const LazyGarudaChainPanel = (props: React.ComponentProps<typeof GarudaChainPanelLazy>) =>
  withSuspense(<GarudaChainPanelLazy {...props} />);
export const LazyGovernancePanel = (props: React.ComponentProps<typeof GovernancePanelLazy>) =>
  withSuspense(<GovernancePanelLazy {...props} />);
export const LazyMainnetMigrationPanel = (props: React.ComponentProps<typeof MainnetMigrationPanelLazy>) =>
  withSuspense(<MainnetMigrationPanelLazy {...props} />);

const NftIdentityPanelLazy = retryLazy(() =>
  import("../features/wallet/NftIdentityPanel").then((m) => ({ default: m.NftIdentityPanel })),
);

export const LazyNftIdentityPanel = (props: React.ComponentProps<typeof NftIdentityPanelLazy>) =>
  withSuspense(<NftIdentityPanelLazy {...props} />);
