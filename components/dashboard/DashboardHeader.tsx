import dynamic from "next/dynamic";
import Link from "next/link";
import { formatFull } from "./format";

const ThemeToggleSlot = dynamic(() => import("@/components/ThemeToggle"), { ssr: false });

export function DashboardHeader({ firstDate, lastDate }: { firstDate: string; lastDate: string }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl italic text-ink" style={{ textWrap: "balance" }}>
          Portfolio Ledger
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          DEGIRO transactions · {formatFull(firstDate)} — {formatFull(lastDate)}
        </p>
      </div>
      <div className="flex items-center gap-3 pt-1">
        <Link
          href="/docs"
          className="flex h-8 items-center rounded-full border border-border px-3.5 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
        >
          Docs
        </Link>
        <Link
          href="/dividends"
          className="flex h-8 items-center rounded-full border border-border px-3.5 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
        >
          Dividends
        </Link>
        <Link
          href="/import"
          className="flex h-8 items-center rounded-full bg-accent px-3.5 text-xs font-medium text-bg transition-opacity hover:opacity-90"
        >
          Import transactions
        </Link>
        <ThemeToggleSlot />
      </div>
    </header>
  );
}
