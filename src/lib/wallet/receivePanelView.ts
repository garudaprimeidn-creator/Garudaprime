export type ReceivePanelView = "assets" | "merchant";

/** GAT opens merchant receive; all other tokens open wallet asset receive. */
export function receivePanelViewForToken(symbol?: string | null): ReceivePanelView {
  return symbol?.trim().toUpperCase() === "GAT" ? "merchant" : "assets";
}
