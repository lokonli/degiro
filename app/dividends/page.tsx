import Link from "next/link";
import { readDividends } from "@/lib/dataStore";
import DividendChart from "@/components/DividendChart";

export const metadata = { title: "Dividends — Portfolio Ledger" };
export const revalidate = 10800;

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

function formatDate(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function DividendsPage() {
  const dividends = await readDividends();
  const sorted = [...dividends].sort((a, b) => b.date.localeCompare(a.date));
  const ascending = [...dividends].sort((a, b) => a.date.localeCompare(b.date));

  const totalGross = dividends.reduce((s, d) => s + d.grossEUR, 0);
  const totalTax = dividends.reduce((s, d) => s + d.taxEUR, 0);
  const totalNet = dividends.reduce((s, d) => s + d.netEUR, 0);

  const cumulativePoints = ascending.reduce<{ date: string; cumulative: number }[]>((acc, d) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
    acc.push({ date: d.date, cumulative: prev + d.netEUR });
    return acc;
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 sm:px-8">
      <header className="flex flex-col gap-1.5">
        <Link href="/" className="text-xs uppercase tracking-[0.08em] text-ink-faint hover:text-ink-muted">
          ← Dashboard
        </Link>
        <h1 className="font-display text-3xl italic text-ink" style={{ textWrap: "balance" }}>
          Dividends
        </h1>
        <p className="text-sm text-ink-muted">
          Payouts pulled from your DEGIRO account, synced alongside transactions.
        </p>
      </header>

      {sorted.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No dividends recorded yet. Run a sync from{" "}
          <Link href="/import" className="text-ink underline underline-offset-2">
            /import
          </Link>{" "}
          to pull your history from DEGIRO.
        </p>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-bg-elevated px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Gross received</div>
              <div className="mt-1.5 font-mono text-xl tabular text-ink">{eur.format(totalGross)}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-elevated px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Withholding tax</div>
              <div className="mt-1.5 font-mono text-xl tabular text-ink">{eur.format(totalTax)}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-elevated px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Net received</div>
              <div className="mt-1.5 font-mono text-xl tabular text-ink">{eur.format(totalNet)}</div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg italic text-ink">Cumulative dividends received</h2>
            <DividendChart points={cumulativePoints} />
          </section>

          <section className="overflow-x-auto rounded-lg border border-border bg-bg-elevated">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                  <th className="px-4 py-3 font-normal">Date</th>
                  <th className="px-4 py-3 font-normal">Holding</th>
                  <th className="px-4 py-3 text-right font-normal">Gross</th>
                  <th className="px-4 py-3 text-right font-normal">Tax</th>
                  <th className="px-4 py-3 text-right font-normal">Net</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-ink-muted">{formatDate(d.date)}</td>
                    <td className="px-4 py-3 text-ink">{d.product}</td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink-muted">
                      {eur.format(d.grossEUR)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink-muted">
                      {d.taxEUR > 0 ? `−${eur.format(d.taxEUR)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular text-ink">{eur.format(d.netEUR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
