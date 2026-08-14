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
              <SheetTitle className="font-mono text-base">
                Run #{run.runNumber}
              </SheetTitle>
              <SheetDescription className="text-pretty">
                {run.taskFull}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-8 p-4">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Configuration</dt>
                  <dd className="mt-1 font-medium">{run.configuration}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Outcome</dt>
                  <dd className="mt-1 font-medium">Failed</dd>
                </div>
              </dl>

              <div>
                <h3 className="mb-3 text-sm font-medium">Timeline</h3>
                <ol className="space-y-0">
                  {run.timeline.map((item, i) => (
                    <li key={`${item.time}-${item.event}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "mt-1 size-1.5 rounded-full",
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
                            "text-sm",
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

              {run.reason === "Skill not invoked" ? (
                <div className="rounded-md border border-border bg-[#fafafa] px-3 py-3 text-sm">
                  <p className="font-medium">
                    Expected skill invocation did not occur.
                  </p>
                </div>
              ) : null}

              <div>
                <h3 className="text-sm font-medium">Why it failed</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {run.why}
                </p>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
