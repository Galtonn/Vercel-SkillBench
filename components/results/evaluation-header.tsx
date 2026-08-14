"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { EvaluationDetail, EvaluationSummary } from "@/lib/types";

export function EvaluationHeader({
  evaluation,
}: {
  evaluation: EvaluationDetail | EvaluationSummary;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Evaluations
          </Link>
          <span className="mx-2 text-neutral-300">/</span>
          <span className="text-foreground">{evaluation.skillName}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {evaluation.skillName}
          </h1>
          <StatusBadge status={evaluation.status} />
        </div>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          {evaluation.repo}
        </p>
        <p className="mt-4 max-w-2xl text-[15px] text-muted-foreground">
          {evaluation.question}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {evaluation.status !== "running" ? (
          <Link
            href="/new"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Re-run Evaluation
          </Link>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="icon-sm" aria-label="More" />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onClick={() => router.push("/compare")}>
              Compare configurations
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/new")}>
              Duplicate evaluation
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const payload = {
                  skill: evaluation.skillPath,
                  status: evaluation.status,
                  effectiveness: evaluation.effectiveness,
                  triggerRate: evaluation.triggerRate,
                  runs: evaluation.runs,
                };
                const blob = new Blob([JSON.stringify(payload, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${evaluation.skillName}-eval.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href);
              }}
            >
              Copy share link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
