import React from "react";

/** Placeholder rows that match Konfirmasi Akun, not a centered loading screen */
export const AccountConfirmSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="space-y-3" aria-hidden>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3">
        <div className="h-4 w-4 shrink-0 rounded bg-[rgba(var(--lx-line),0.35)] animate-pulse" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-2 w-14 rounded bg-[rgba(var(--lx-line),0.3)] animate-pulse" />
          <div
            className="h-3.5 rounded bg-[rgba(var(--lx-line),0.45)] animate-pulse"
            style={{ width: `${58 + (i % 3) * 12}%`, maxWidth: 220 }}
          />
        </div>
      </div>
    ))}
  </div>
);
