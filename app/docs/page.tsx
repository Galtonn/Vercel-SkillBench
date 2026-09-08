import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  MAX_AGENT_RUNS_PER_EVALUATION,
  MAX_RUNS_PER_TASK,
  MAX_TASKS,
} from "@/lib/eval/config";
import { CONFIG_EXPLAINERS } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-[720px] px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Docs</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        SkillBench measures whether an Agent Skill improves a coding agent — and
        separately, whether the agent recognises when to load it.
      </p>

      <section className="mt-12 space-y-4">
        <h2 className="text-lg font-medium">Three separate questions</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A skill can contain exactly the right knowledge and still fail in
          practice, because the agent never loads it. Conflating those two
          failures makes a skill impossible to debug, so SkillBench measures them
          apart.
        </p>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-medium">Discovery</dt>
            <dd className="mt-1 text-muted-foreground">
              Given only the skill&apos;s name and description, does the agent
              recognise that this task calls for it?
            </dd>
          </div>
          <div>
            <dt className="font-medium">Invocation</dt>
            <dd className="mt-1 text-muted-foreground">
              Does it actually load the instructions? SkillBench gives the model a
              real <span className="font-mono">use_skill</span> tool and records
              only genuine tool calls. Invocation is never inferred from the
              wording of an answer.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Effectiveness</dt>
            <dd className="mt-1 text-muted-foreground">
              When the instructions are in context, do they actually raise task
              success?
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-lg font-medium">The four conditions</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Same tasks, same model, same tools. Only the delivery of the skill
          changes, so a difference in success is attributable to delivery.
        </p>
        <ul className="space-y-3 text-sm leading-relaxed">
          {CONFIG_EXPLAINERS.map((config) => (
            <li key={config.id}>
              <span className="font-medium">{config.name}</span>
              <span className="mt-0.5 block text-muted-foreground">
                {config.summary}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Explicit Trigger and AGENTS.md always deliver the instructions, so their
          trigger rate is 100% by construction and is labelled as such rather than
          presented as a measurement. AGENTS.md here is a controlled
          delivery-strategy comparison, not a reproduction of any specific coding
          agent&apos;s handling of that file.
        </p>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-lg font-medium">Run classification</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          In the Skill condition, each run is classified by crossing the
          benchmark&apos;s ground truth about relevance with what the agent did and
          how it scored. The category that matters most is{" "}
          <span className="font-mono">missed_trigger_failure</span>: the task
          needed the skill, the agent never loaded it, and the answer was wrong.
          That is a discovery bug, not a knowledge bug, and it is invisible if you
          only measure average success.
        </p>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-lg font-medium">Scoring</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Tasks with a checkable answer use a deterministic substring check.
          Analysis tasks use a separate judge call that receives the task, the
          task-specific criteria, an optional reference answer, and the answer —
          and is never told which condition produced it, so it cannot favour one. A judge response that does not parse is retried
          once, then the run is marked unscored and excluded from rates rather than
          counted as a failure.
        </p>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-lg font-medium">What this build does and does not do</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            Agents get read-only repository access:{" "}
            <span className="font-mono">list_files</span> and{" "}
            <span className="font-mono">read_file</span>, jailed to the benchmark
            fixture. There is no shell and no write path, so model output cannot
            execute or modify anything.
          </li>
          <li>
            Because nothing is executed, there is no build-validation metric. Task
            success is judged from the agent&apos;s answer, not from a compile.
          </li>
          <li>
            Limits: at most {MAX_TASKS} tasks and {MAX_RUNS_PER_TASK} runs per
            configuration, with bounded concurrency. The hosted recruiter demo
            additionally caps each evaluation at {MAX_AGENT_RUNS_PER_EVALUATION}{" "}
            total agent executions.
          </li>
          <li>
            Hosted results are stored in Neon Postgres and isolated to the
            visitor&apos;s signed guest session. Local development uses JSON files.
          </li>
          <li>
            v0 runs use the Platform API v2 and create private v0 chats. Because
            v0 exposes an agent API rather than native function calling,
            SkillBench bridges tool requests through a strict JSON protocol and
            records only explicit requests that it actually executes.
          </li>
        </ul>
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-lg font-medium">Get started</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Enter the portfolio access code, then run a built-in benchmark from the
          New Evaluation page or load any{" "}
          <span className="font-mono">SKILL.md</span>, point it at a fixture, and
          author or generate tasks with explicit relevance and scoring criteria.
        </p>
        <Link href="/new" className={cn(buttonVariants(), "mt-2 inline-flex")}>
          New Evaluation
        </Link>
      </section>
    </div>
  );
}
