"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Something went wrong
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        SkillBench could not load this view
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        The evaluation data is safe. Try the request again, or return after the
        current model call finishes.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
