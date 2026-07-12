import Link from "next/link";
import ImportForm from "@/components/ImportForm";

export const metadata = { title: "Import transactions — Portfolio Ledger" };

const STEPS = [
  {
    title: "Open DEGIRO and go to your transaction history",
    detail: 'Log in at degiro.nl (or the app), then go to "Activity" → "Transactions" (Dutch: "Activiteit" → "Transacties").',
  },
  {
    title: "Set the date range",
    detail:
      "Pick a range that covers everything since your last import — or just export your full history. Rows already imported are detected and skipped automatically, so overlap is safe.",
  },
  {
    title: "Export the file",
    detail: 'Click "Export" and download as CSV or Excel — both work here.',
  },
  {
    title: "Upload it below",
    detail: "New holdings are matched to a live price feed automatically. The dashboard updates as soon as the import finishes.",
  },
];

export default function ImportPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-10 sm:px-8">
      <header className="flex flex-col gap-1.5">
        <Link href="/" className="text-xs uppercase tracking-[0.08em] text-ink-faint hover:text-ink-muted">
          ← Dashboard
        </Link>
        <h1 className="font-display text-3xl italic text-ink" style={{ textWrap: "balance" }}>
          Import transactions
        </h1>
        <p className="text-sm text-ink-muted">Bring in new activity from your DEGIRO account.</p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-[0.08em] text-ink-faint">How to export from DEGIRO</h2>
        <ol className="flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong font-mono text-xs tabular text-ink-muted">
                {i + 1}
              </span>
              <div>
                <div className="text-sm text-ink">{step.title}</div>
                <div className="mt-0.5 text-sm text-ink-muted">{step.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs uppercase tracking-[0.08em] text-ink-faint">Upload</h2>
        <ImportForm />
      </section>
    </div>
  );
}
