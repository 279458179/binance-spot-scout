import type { ReactNode } from "react";

export function ScanAgainButton({ onClick, loading, disabled = false }: { onClick: () => void; loading: boolean; disabled?: boolean }): ReactNode {
  return (
    <button type="button" onClick={onClick} disabled={loading || disabled}
      className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-5 py-3.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-elevated)] disabled:cursor-not-allowed disabled:text-[#676b74]">
      {loading ? "扫描中…" : "重新扫描"}
    </button>
  );
}
