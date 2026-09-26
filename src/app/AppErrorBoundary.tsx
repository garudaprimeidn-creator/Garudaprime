import React from "react";
import { clearBootBlockers } from "../lib/app/bootCleanup";

type Props = { children: React.ReactNode; resetKey?: string };

type State = { error: Error | null; resetting: boolean };

const SESSION_KEYS = [
  "garuda_prime_session",
  "garuda_prime_uid",
  "garuda_prime_remember",
  "garuda_prime_wallet",
  "gp_account_preview_ls",
  "gp_pending_auth_phase",
  "gp_registration_step",
  "gp_oauth_pending",
];

function clearClientSession(): void {
  try {
    for (const key of SESSION_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    /* private mode */
  }
  clearBootBlockers();
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, resetting: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[Garuda Prime]", error);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, resetting: false });
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    if (this.state.resetting) return;
    this.setState({ resetting: true });
    clearClientSession();
    window.location.replace("https://app.garudaprime.id/?entry=auth");
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center min-h-[100dvh] bg-[#f4f8f6]">
        <p className="text-lg font-bold text-zinc-900">Garuda Prime</p>
        <p className="text-sm text-zinc-600 max-w-sm">
          Aplikasi gagal dimuat. Coba muat ulang halaman atau reset sesi jika masalah berlanjut.
        </p>
        {this.state.error?.message && (
          <p className="text-[10px] text-zinc-500 max-w-sm break-words font-mono leading-relaxed px-2">
            {this.state.error.message}
          </p>
        )}
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <button
            type="button"
            onClick={this.handleReload}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm"
          >
            Muat Ulang
          </button>
          <button
            type="button"
            disabled={this.state.resetting}
            onClick={this.handleReset}
            className="px-5 py-2.5 rounded-xl border border-zinc-300 bg-white text-zinc-800 font-semibold text-sm disabled:opacity-60"
          >
            {this.state.resetting ? "Memuat ulang…" : "Reset Sesi & Masuk"}
          </button>
        </div>
      </div>
    );
  }
}
