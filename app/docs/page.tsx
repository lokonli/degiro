import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";

export const metadata = { title: "Docs — Portfolio Ledger" };

const docsDir = path.join(process.cwd(), "docs");

async function listDocs() {
  const files = (await fs.readdir(docsDir)).filter((f) => f.endsWith(".md")).sort();
  return Promise.all(
    files.map(async (file) => {
      const slug = file.slice(0, -".md".length);
      const content = await fs.readFile(path.join(docsDir, file), "utf8");
      const heading = content.match(/^#\s+(.+)$/m);
      return { slug, title: heading ? heading[1].trim() : slug };
    })
  );
}

export default async function DocsPage() {
  const docs = await listDocs();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 sm:px-8">
      <header className="flex flex-col gap-1.5">
        <Link href="/" className="text-xs uppercase tracking-[0.08em] text-ink-faint hover:text-ink-muted">
          ← Dashboard
        </Link>
        <h1 className="font-display text-3xl italic text-ink" style={{ textWrap: "balance" }}>
          Docs
        </h1>
        <p className="text-sm text-ink-muted">Notes on how this app works, kept alongside the code.</p>
      </header>

      <section className="flex flex-col gap-3">
        {docs.map((doc) => (
          <Link
            key={doc.slug}
            href={`/docs/${doc.slug}`}
            className="rounded-lg border border-border bg-bg-elevated px-5 py-4 text-ink transition-colors hover:border-border-strong"
          >
            {doc.title}
          </Link>
        ))}
      </section>
    </div>
  );
}
