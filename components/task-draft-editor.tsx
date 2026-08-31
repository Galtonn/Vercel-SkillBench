"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createTaskDraft,
  linesToList,
  type TaskDraft,
} from "@/lib/eval/custom-tasks";
import { cn } from "@/lib/utils";

export function TaskDraftEditor({
  drafts,
  onChange,
  readOnly = false,
}: {
  drafts: TaskDraft[];
  onChange?: (drafts: TaskDraft[]) => void;
  readOnly?: boolean;
}) {
  function update(key: string, patch: Partial<TaskDraft>) {
    if (readOnly || !onChange) return;
    onChange(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  }

  function remove(key: string) {
    if (readOnly || !onChange) return;
    onChange(drafts.filter((draft) => draft.key !== key));
  }

  return (
    <div className="space-y-3">
      {drafts.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {readOnly
            ? "This benchmark has no tasks."
            : "No tasks yet. Add one, paste prompts, or generate a benchmark from the skill."}
        </p>
      ) : null}

      {drafts.map((draft, index) => (
        <article key={draft.key} className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Task {index + 1}
            </span>
            {readOnly ? null : (
              <button
                type="button"
                onClick={() => remove(draft.key)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove task ${index + 1}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">Name</span>
            <Input
              value={draft.name}
              readOnly={readOnly}
              onChange={(event) => update(draft.key, { name: event.target.value })}
              placeholder="Short name"
            />
          </label>

          <label className="mt-3 block space-y-1.5">
            <span className="text-xs text-muted-foreground">Prompt</span>
            <Textarea
              value={draft.prompt}
              readOnly={readOnly}
              onChange={(event) => update(draft.key, { prompt: event.target.value })}
              placeholder="What the agent is asked to do"
              className="min-h-[88px] font-mono text-[13px] leading-relaxed"
            />
          </label>

          <p className="mt-3 text-xs text-muted-foreground">
            Should this skill help with this task?
          </p>
          <div className="mt-1.5 inline-flex items-center rounded-md border border-border p-0.5">
            <Toggle
              pressed={draft.skillRelevant}
              disabled={readOnly}
              onClick={() => update(draft.key, { skillRelevant: true })}
            >
              Skill should help
            </Toggle>
            <Toggle
              pressed={!draft.skillRelevant}
              disabled={readOnly}
              onClick={() => update(draft.key, { skillRelevant: false })}
            >
              Skill should not be used
            </Toggle>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">Scoring</p>
          <div className="mt-1.5 inline-flex items-center rounded-md border border-border p-0.5">
            <Toggle
              pressed={draft.scoring === "llm_judge"}
              disabled={readOnly}
              onClick={() => update(draft.key, { scoring: "llm_judge" })}
            >
              Judge criteria
            </Toggle>
            <Toggle
              pressed={draft.scoring === "contains"}
              disabled={readOnly}
              onClick={() => update(draft.key, { scoring: "contains" })}
            >
              Keywords
            </Toggle>
          </div>

          {draft.scoring === "llm_judge" ? (
            <>
              <label className="mt-3 block space-y-1.5">
                <span className="text-xs text-muted-foreground">
                  Judge criteria (one per line). These are the ground truth.
                </span>
                <Textarea
                  value={draft.criteria.join("\n")}
                  readOnly={readOnly}
                  onChange={(event) =>
                    update(draft.key, { criteria: linesToList(event.target.value) })
                  }
                  placeholder="Identifies the missing label on the email input"
                  className="min-h-[88px] font-mono text-[13px] leading-relaxed"
                />
              </label>
              <label className="mt-3 block space-y-1.5">
                <span className="text-xs text-muted-foreground">
                  Reference answer (optional). Orientation for the judge, not a
                  verbatim match.
                </span>
                <Textarea
                  value={draft.referenceAnswer}
                  readOnly={readOnly}
                  onChange={(event) =>
                    update(draft.key, { referenceAnswer: event.target.value })
                  }
                  placeholder="A correct response would say…"
                  className="min-h-[72px] text-[13px] leading-relaxed"
                />
              </label>
            </>
          ) : (
            <label className="mt-3 block space-y-1.5">
              <span className="text-xs text-muted-foreground">
                Expected keywords (one per line). All must appear, case-insensitive.
              </span>
              <Textarea
                value={draft.values.join("\n")}
                readOnly={readOnly}
                onChange={(event) =>
                  update(draft.key, { values: linesToList(event.target.value) })
                }
                placeholder="formatPersonName"
                className="min-h-[72px] font-mono text-[13px] leading-relaxed"
              />
            </label>
          )}
        </article>
      ))}

      {readOnly ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange?.([...drafts, createTaskDraft()])}
        >
          <Plus className="size-3.5" />
          Add task
        </Button>
      )}
    </div>
  );
}

function Toggle({
  pressed,
  onClick,
  children,
  disabled = false,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-[5px] px-2.5 py-1 text-xs font-medium",
        pressed
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
        disabled && "pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}
