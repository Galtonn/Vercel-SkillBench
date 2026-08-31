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

  return (
    <section className="animate-fade-up delay-3 border-y border-border py-10">
      <h2 className="text-sm font-medium">
        <MetricTip name="Trigger rate">Skill Triggering</MetricTip>
      </h2>
      {trigger.rate === null ? (
        <p className="mt-3 text-5xl font-semibold tracking-tight text-muted-foreground">
          —
        </p>
      ) : (
        <p className="mt-3 text-5xl font-semibold tracking-tight">
          <AnimatedNumber
            value={trigger.rate}
            suffix="%"
            decimals={Number.isInteger(trigger.rate) ? 0 : 1}
          />
        </p>
      )}
      <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">
        The agent called <span className="font-mono">use_skill</span> in{" "}
        {trigger.invoked} of {trigger.expected} run
        {trigger.expected === 1 ? "" : "s"} where the task was skill-relevant.
      </p>

      <dl className="mt-8 grid max-w-lg grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
        <Stat label="Skill-relevant runs" value={trigger.expected} />
        <Stat label="Skill loaded" value={trigger.invoked} />
        <Stat label="Missed" value={trigger.missed} tip="Missed invocations" />
        <Stat
          label={`False positives (of ${trigger.irrelevant})`}
          value={trigger.falsePositives}
          tip="False-positive invocations"
        />
      </dl>

      {evaluation.triggerNote ? (
        <div className="mt-8 max-w-xl rounded-md border border-border bg-[#fafafa] px-4 py-3 text-sm">
          <p className="font-medium">{evaluation.triggerNote}</p>
          {evaluation.triggerDetail ? (
            <p className="mt-1 text-muted-foreground">
              {evaluation.triggerDetail}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  tip,
}: {
  label: string;
  value: number;
  tip?: "Missed invocations" | "False-positive invocations";
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">
        {tip ? <MetricTip name={tip}>{label}</MetricTip> : label}
      </dt>
      <dd className="mt-1 font-mono text-lg tabular-nums">{value}</dd>
    </div>
  );
}
