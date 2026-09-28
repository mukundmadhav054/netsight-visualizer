import React, { type ReactNode, type ButtonHTMLAttributes } from "react";

/* Small reusable accessible design-system primitives (WCAG 2.1 AA:
   focus-visible rings, aria labels, ≥4.5:1 text contrast on dark theme). */

export function Card({
  title,
  id,
  children
}: {
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">{title}</h2>
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  ariaLabel?: string;
};

export function Button({
  variant = "primary",
  ariaLabel,
  children,
  ...rest
}: ButtonProps) {
  const cls =
    variant === "primary"
      ? "bg-sky-600 hover:bg-sky-500 text-white"
      : variant === "danger"
        ? "bg-red-600 hover:bg-red-500 text-white dark:bg-red-700 dark:hover:bg-red-600"
        : "bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100";
  return (
    <button
      aria-label={ariaLabel}
      {...rest}
      className={`rounded px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone = "info",
  children
}: {
  tone?: "info" | "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    info: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    bad: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
  };
  return (
    <span
      role="status"
      className={`inline-block rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
    />
  );
}

export function SelectEl(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
    />
  );
}

export function Tooltip({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-block" tabIndex={0} aria-label={label}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-slate-50 group-focus:block group-hover:block dark:bg-slate-700"
      >
        {label}
      </span>
    </span>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-block animate-spin">
      ◌
    </span>
  );
}

export function Alert({
  tone = "info",
  children
}: {
  tone?: "info" | "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={`rounded border px-3 py-2 text-sm ${
        tone === "bad"
          ? "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200"
          : tone === "warn"
            ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
            : "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200"
      }`}
    >
      {children}
    </div>
  );
}

export function Progress({
  value,
  label
}: {
  value: number;
  label: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800"
    >
      <div className="h-full bg-sky-500" style={{ width: `${value}%` }} />
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Panels" className="flex gap-1">
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={t === active}
          onClick={() => onChange(t)}
          className={`rounded px-3 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
            t === active
              ? "bg-sky-600 text-white dark:bg-sky-700"
              : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400" role="status">
      {message}
    </p>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-100 dark:bg-slate-950 p-2">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}
