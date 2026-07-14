import Link from "next/link";

export function EmptyState() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-4 px-6 py-10 sm:px-8">
      <h1 className="font-display text-3xl italic text-ink">Portfolio Ledger</h1>
      <p className="text-sm text-ink-muted">No transactions yet — import your DEGIRO history to get started.</p>
      <Link
        href="/import"
        className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
      >
        Import transactions
      </Link>
    </div>
  );
}
