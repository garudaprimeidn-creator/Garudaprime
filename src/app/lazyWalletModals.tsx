import React, { lazy, Suspense, type ComponentType } from "react";
import { PanelErrorBoundary } from "./PanelErrorBoundary";
import type { WalletToken } from "./WalletActionModals";

const retryLazy = <P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
) => lazy(() => loader().catch(() => {
  window.location.reload();
  return new Promise<{ default: ComponentType<P> }>(() => undefined);
}));

const SendModalConnectedLazy = retryLazy(() =>
  import("./WalletActionModals").then((m) => ({ default: m.SendModalConnected })),
);
const ReceiveModalConnectedLazy = retryLazy(() =>
  import("./WalletActionModals").then((m) => ({ default: m.ReceiveModalConnected })),
);
const SwapModalLazy = retryLazy(() =>
  import("./WalletActionModals").then((m) => ({ default: m.SwapModal })),
);
const PayModalLazy = retryLazy(() =>
  import("./WalletActionModals").then((m) => ({ default: m.PayModal })),
);
const ScanModalLazy = retryLazy(() =>
  import("./WalletActionModals").then((m) => ({ default: m.ScanModal })),
);

const ModalFallback = () => (
  <div className="flex items-center justify-center py-12">
    <div className="w-5 h-5 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
  </div>
);

const wrap = (node: React.ReactNode, title: string) => (
  <PanelErrorBoundary title={title}>
    <Suspense fallback={<ModalFallback />}>{node}</Suspense>
  </PanelErrorBoundary>
);

export const LazySendModal = ({
  tokens,
  onClose,
}: {
  tokens: WalletToken[];
  onClose: () => void;
}) => wrap(<SendModalConnectedLazy tokens={tokens} onClose={onClose} />, "Gagal membuka kirim token");

export const LazyReceiveModal = ({ onClose }: { onClose: () => void }) =>
  wrap(<ReceiveModalConnectedLazy onClose={onClose} />, "Gagal membuka terima");

export const LazySwapModal = ({
  tokens,
  onClose,
}: {
  tokens: WalletToken[];
  onClose: () => void;
}) => wrap(<SwapModalLazy tokens={tokens} onClose={onClose} />, "Gagal membuka swap");

export const LazyPayModal = ({ onClose }: { onClose: () => void }) =>
  wrap(<PayModalLazy onClose={onClose} />, "Gagal membuka bayar");

export const LazyScanModal = ({ onClose }: { onClose: () => void }) =>
  wrap(<ScanModalLazy onClose={onClose} />, "Gagal membuka pindai QR");

export type { WalletToken };
