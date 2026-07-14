import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const docsDir = path.join(process.cwd(), "docs");

const components: Components = {
  h1: ({ children }) => (
    <h1 className="font-display text-2xl italic text-ink" style={{ textWrap: "balance" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => <h2 className="mt-2 text-lg font-medium text-ink">{children}</h2>,
  h3: ({ children }) => <h3 className="text-base font-medium text-ink">{children}</h3>,
  p: ({ children }) => <p className="text-sm leading-relaxed text-ink-muted">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} className="text-ink underline underline-offset-2">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">{children}</ol>,
  li: ({ children }) => <li className="marker:text-ink-faint">{children}</li>,
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg border border-border bg-bg-elevated p-3 text-xs">{children}</pre>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.startsWith("language-");
    return isBlock ? (
      <code className={`font-mono ${className ?? ""}`}>{children}</code>
    ) : (
      <code className="rounded bg-bg-elevated px-1 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>
    );
  },
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-border bg-bg-elevated">
      <table className="w-full min-w-[480px] border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint">
      {children}
    </thead>
  ),
  th: ({ children }) => <th className="px-4 py-3 font-normal">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-4 py-3 text-ink-muted last:border-0">{children}</td>,
  hr: () => <hr className="border-border" />,
  strong: ({ children }) => <strong className="font-medium text-ink">{children}</strong>,
};

export async function generateStaticParams() {
  const files = (await fs.readdir(docsDir)).filter((f) => f.endsWith(".md"));
  return files.map((file) => ({ slug: file.slice(0, -".md".length) }));
}

export default async function DocPage(props: PageProps<"/docs/[slug]">) {
  const { slug } = await props.params;

  let content: string;
  try {
    content = await fs.readFile(path.join(docsDir, `${slug}.md`), "utf8");
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10 sm:px-8">
      <Link href="/docs" className="text-xs uppercase tracking-[0.08em] text-ink-faint hover:text-ink-muted">
        ← Docs
      </Link>
      <article className="flex flex-col gap-4">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
