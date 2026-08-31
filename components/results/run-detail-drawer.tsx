"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { FailedRun } from "@/lib/types";

/**
 * The timeline here is the run's recorded event list: model calls, file reads,
 * skill invocation, and scoring. Nothing is reconstructed or embellished — if the
 * agent never read a file, no read event appears.
 */
export function RunDetailDrawer({
  run,
  onClose,
}: {
  run: FailedRun | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!run} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {run ? (
          <>
            <SheetHeader className="border-b border-border">
              <SheetTitle className="font-mono text-base">{run.task}</SheetTitle>
              <SheetDescription className="text-pretty">
                {run.taskFull}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-8 p-4">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Configuration" value={run.configuration} />
                <Field label="Outcome" value={run.result} />
                <Field
                  label="Score"
                  value={run.score === null ? "not scored" : `${run.score}/100`}
                />
                <Field
                  label="Scored by"
                  value={run.scorer === "contains" ? "Deterministic check" : "LLM judge"}
                />
                <Field label="Runtime" value={run.latencyLabel} />
                <Field label="Tokens" value={run.tokenLabel} />
              </dl>

              {run.skillApplicable ? (
                <div className="rounded-md border border-border bg-[#fafafa] px-3 py-3 text-sm">
                  <p className="font-medium">
                    {run.skillInvoked
                      ? "The agent loaded the skill."
                      : run.skillRelevant
                        ? "The agent never loaded the skill, and this task needed it."
                        : "The agent did not load the skill, which was correct for this task."}
                  </p>
                  {run.invocationReason ? (
                    <p className="mt-1 text-muted-foreground">
                      Stated reason: “{run.invocationReason}”
                    </p>
                  ) : null}
                  {run.classificationLabel ? (
                    <p className="mt-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                      {run.classificationLabel}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div>
                <h3 className="mb-3 text-sm font-medium">Execution timeline</h3>
                <ol className="space-y-0">
                  {run.timeline.map((item, i) => (
                    <li key={`${item.time}-${i}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "mt-1 size-1.5 shrink-0 rounded-full",
                            item.warning ? "bg-foreground" : "bg-neutral-300"
                          )}
                        />
                        {i < run.timeline.length - 1 ? (
                          <span className="w-px flex-1 bg-border" />
                        ) : null}
                      </div>
                      <div className="pb-4">
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {item.time}
                        </p>
                        <p
                          className={cn(
                            "text-sm break-words",
                            item.warning && "font-medium"
                          )}
                        >
                          {item.event}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <h3 className="text-sm font-medium">
                  {run.scorer === "contains"
                    ? "Why the check failed"
                    : "Why the judge failed it"}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {run.judgeReason}
                </p>
                {run.error ? (
                  <p className="mt-2 font-mono text-[12px] leading-relaxed text-muted-foreground">
                    {run.error}
                  </p>
                ) : null}
              </div>

              {run.response ? (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Model output</h3>
                  <pre className="max-h-80 overflow-auto rounded-md border border-border bg-[#fafafa] p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
                    {run.response}
                  </pre>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium break-words">{value}</dd>
    </div>
  );
}
