import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-[720px] px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Docs</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        SkillBench evaluates whether an Agent Skill actually improves a coding
        agent — and whether the agent can find the skill when it needs it.
      </p>

      <section className="mt-12 space-y-4">
        <h2 className="text-lg font-medium">What SkillBench measures</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A skill can contain the right knowledge and still fail. Agents may
          never load it, load it too late, or spend tokens on it for tasks that
          don&apos;t need it. SkillBench runs the same tasks across four
          configurations so you can see which of those is happening.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            <span className="text-foreground">Baseline</span> — no skill, no extra context.
          </li>
          <li>
            <span className="text-foreground">Skill</span> — SKILL.md is available; the agent must choose to load it.
          </li>
          <li>
            <span className="text-foreground">Explicit trigger</span> — the prompt requires the skill. Isolates instruction quality from discovery.
          </li>
          <li>
            <span className="text-foreground">AGENTS.md</span> — the same knowledge is persistent repository context.
          </li>
        </ul>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-lg font-medium">Metrics</h2>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-medium">Task success</dt>
            <dd className="mt-1 text-muted-foreground">
              Percentage of runs that satisfied the evaluator&apos;s expected outcome.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Trigger rate</dt>
            <dd className="mt-1 text-muted-foreground">
              Percentage of tasks where the skill was loaded when the evaluator
              expected it to be useful.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Skill effectiveness</dt>
            <dd className="mt-1 text-muted-foreground">
              Difference in task success between baseline and skill-enabled runs.
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-lg font-medium">This prototype</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          SkillBench is a product demo. Evaluations, trajectories, and skill
          rewrites are mocked so you can walk through the workflow without
          running agents. Start with{" "}
          <Link
            href="/evaluations/analyze-bundle"
            className="underline underline-offset-4 hover:text-foreground"
          >
            analyze-bundle
          </Link>
          .
        </p>
        <Link href="/new" className={cn(buttonVariants(), "mt-2 inline-flex")}>
          New Evaluation
        </Link>
      </section>
    </div>
  );
}
