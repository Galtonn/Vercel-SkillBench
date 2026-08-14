import { cn } from "@/lib/utils";

export function CodeBlock({
  children,
  label,
  className,
}: {
  children: string;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border bg-[#fafafa]",
        className
      )}
    >
      {label ? (
        <div className="border-b border-border px-3 py-1.5 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          {label}
        </div>
      ) : null}
      <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed text-neutral-800 whitespace-pre-wrap">
        {children}
      </pre>
    </div>
  );
}

export function DiffBlock({ lines }: { lines: string[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-[#fafafa]">
      <div className="border-b border-border px-3 py-1.5 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        SKILL.md
      </div>
      <pre className="overflow-x-auto py-2 font-mono text-[13px] leading-6">
        {lines.map((line, i) => {
          const added = line.startsWith("+");
          const removed = line.startsWith("-");
          return (
            <div
              key={`${i}-${line}`}
              className={cn(
                "px-3",
                added && "bg-emerald-50 text-emerald-800",
                removed && "bg-red-50 text-red-800"
              )}
            >
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
