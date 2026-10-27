import type { ReactNode } from "react";

export function Panel({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`border border-border bg-card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <h2 className="label-caps text-[11px] text-muted-foreground">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClassName || "p-3"}>{children}</div>
    </section>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
      <span className="h-2 w-2 animate-pulse bg-primary" aria-hidden />
      {label}…
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse border border-border bg-secondary/45 ${className}`} aria-hidden />;
}

/**
 * Whole-page loading state, shared by every route so the hand-off between
 * pages reads the same. It fills the content column so the footer stays at the
 * bottom of the viewport and the layout does not jump when the data lands.
 */
export function PageLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-[60vh] flex-1 flex-col gap-3" role="status" aria-label={label}>
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-60" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="min-h-[20rem] w-full" />
        <div className="hidden flex-col gap-3 lg:flex">
          <Skeleton className="h-[13rem]" />
          <Skeleton className="h-[13rem]" />
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-2 w-2 animate-pulse bg-primary" aria-hidden />
        {label}…
      </p>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
      <p className="font-semibold text-destructive">Could not load F1 data</p>
      <p className="mt-1 text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="label-caps mt-2 border border-border px-2 py-1 text-[11px] hover:bg-secondary"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-sm text-muted-foreground">{children}</div>;
}

export function PositionBadge({ position, className = "" }: { position: number | string; className?: string }) {
  const n = Number(position);
  const tone =
    n === 1 ? "bg-[#FFD12A] text-black" : n >= 2 && n <= 3 ? "bg-secondary text-foreground" : "bg-muted text-muted-foreground";
  return (
    <span
      className={`tnum inline-flex h-5 min-w-5 items-center justify-center px-1 text-xs font-semibold ${tone} ${className}`}
    >
      {position}
    </span>
  );
}

/**
 * A small pressed/unpressed button row for switching between views of the same
 * data. Used by the replay map controls and the standings page.
 */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="label-caps text-[10px] text-muted-foreground">{label}</span>
      <div className="flex border border-border" role="group" aria-label={label}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              title={option.hint}
              className={`label-caps px-2 py-1 text-[10px] transition-colors ${
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="label-caps text-[10px] text-muted-foreground">{label}</span>
      <span className="tnum text-sm">{value}</span>
    </div>
  );
}
