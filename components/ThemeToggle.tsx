"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Theme {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getServerSnapshot(): Theme | null {
  return null;
}

function setTheme(theme: Theme) {
  localStorage.setItem("theme", theme);
  listeners.forEach((listener) => listener());
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!theme) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  if (!theme) return <div className="h-8 w-16" />;

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="flex h-8 items-center gap-2 rounded-full border border-border px-3 text-xs uppercase tracking-wide text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
      aria-label="Toggle color theme"
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: theme === "dark" ? "var(--accent)" : "var(--accent)" }}
      />
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
