import React from "react";

type Props = {
  children: React.ReactNode;
  title?: string;
  onRetry?: () => void;
};

type State = { error: Error | null };

export class PanelErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[Garuda Prime panel]", error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-5 text-center space-y-3">
        <p className="gp-text text-sm font-semibold">{this.props.title ?? "Panel gagal dimuat"}</p>
        <p className="gp-muted text-xs leading-relaxed">
          Muat ulang panel ini. Jika masih bermasalah, tarik ke bawah untuk refresh data atau hapus cache browser.
        </p>
        {this.state.error?.message && (
          <p className="text-[10px] text-zinc-500 max-w-sm break-words font-mono leading-relaxed mx-auto">
            {this.state.error.message}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            this.setState({ error: null });
            this.props.onRetry?.();
          }}
          className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold"
        >
          Coba lagi
        </button>
      </div>
    );
  }
}
