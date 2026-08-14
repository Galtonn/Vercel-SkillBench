import { AnimatedNumber } from "@/components/animated-number";
import { MetricTip } from "@/components/metric-tip";
import type { EvaluationDetail } from "@/lib/types";

export function TriggerReliability({
  evaluation,
}: {
  evaluation: EvaluationDetail;
}) {
  const trigger = evaluation.trigger;
  if (!trigger) return null;

  const rate = Math.round((trigger.invoked / trigger.expected) * 100);

  return (
    <section className="animate-fade-up delay-3 border-y border-border py-10">
      <h2 className="text-sm font-medium">
        <MetricTip name="Trigger rate">Skill Triggering</MetricTip>
      </h2>
      <p className="mt-3 text-5xl font-semibold tracking-tight">
        <AnimatedNumber value={rate} suffix="%" />
      </p>
      <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">
        The agent loaded this skill in {trigger.invoked} of {trigger.expected}{" "}
        tasks where it was expected.
      </p>

      <dl className="mt-8 grid max-w-lg grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
        <Stat label="Expected skill invocation" value={trigger.expected} />
        <Stat label="Actually invoked" value={trigger.invoked} />
        <Stat label="Missed" value={trigger.missed} />
        <Stat label="False-positive invocations" value={trigger.falsePositives} />
      </dl>

      {evaluation.triggerNote ? (
        <div className="mt-8 max-w-xl rounded-md border border-border bg-[#fafafa] px-4 py-3 text-sm">
          <p className="font-medium">{evaluation.triggerNote}</p>
          <p className="mt-1 text-muted-foreground">
            Explicitly triggering the skill recovered most of those failures.
            The knowledge is useful — the routing is not.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-lg tabular-nums">{value}</dd>
    </div>
  );
}
