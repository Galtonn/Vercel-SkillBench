import { EvaluationsList } from "@/components/evaluations-list";
import { buttonVariants } from "@/components/ui/button";
import { toSummary } from "@/lib/adapters/ui";
import { AGENT_OPTIONS, DEFAULT_AGENT_ID } from "@/lib/eval/config";
import { listEvaluations } from "@/lib/storage/evaluations";
import { cn } from "@/lib/utils";
import { requireDemoSession } from "@/lib/auth/server";

// Evaluations are read from storage on every request so a run that finishes in the
// background shows up on refresh.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireDemoSession();
  const records = await listEvaluations(session.id);
  const evaluations = records.map(toSummary);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-12">
      <div className="animate-fade-up mb-8 rounded-xl border border-border bg-[#fafafa] px-5 py-4">
        <p className="text-xs font-medium tracking-wide uppercase">
          Interactive recruiter demo
        </p>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          Run real, isolated evaluations with the project owner&apos;s provider
          credits. Please avoid confidential content; submitted skills and tasks
          are processed by the selected AI provider.
        </p>
      </div>
      <div className="animate-fade-up mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <h1 className="text-3xl font-semibold tracking-tight">
            Skill Evaluations
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Measure whether your Agent Skills actually improve agent
            performance.
          </p>
        </div>
        <form
          action="/new"
          className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-end"
        >
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Test with
            <select
              name="agent"
              defaultValue={DEFAULT_AGENT_ID}
              className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-w-44"
            >
              <optgroup label="Current agents">
                {AGENT_OPTIONS.filter(
                  (agent) => agent.group === "current",
                ).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Earlier models">
                {AGENT_OPTIONS.filter(
                  (agent) => agent.group === "legacy",
                ).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="v0 models">
                {AGENT_OPTIONS.filter(
                  (agent) => agent.group === "specialized",
                ).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button
            type="submit"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            New Evaluation
          </button>
        </form>
      </div>
      <div className="animate-fade-up delay-2">
        <EvaluationsList evaluations={evaluations} />
      </div>
    </div>
  );
}
