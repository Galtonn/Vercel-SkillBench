"use client";

import { useRouter } from "next/navigation";

export type CompareOption = {
  id: string;
  label: string;
};

export function CompareEvalPicker({
  currentId,
  options,
}: {
  currentId: string;
  options: CompareOption[];
}) {
  const router = useRouter();
  if (options.length <= 1) return null;

  return (
    <label className="mt-6 block max-w-lg">
      <span className="mb-1.5 block text-xs text-muted-foreground">
        Evaluation
      </span>
      <select
        value={currentId}
        onChange={(event) => {
          router.push(`/compare?id=${encodeURIComponent(event.target.value)}`);
        }}
        className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
