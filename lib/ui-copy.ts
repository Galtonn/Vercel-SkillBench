/** Tooltip copy for metric labels. Definitions only — no values. */
export const METRIC_TIPS = {
  "Trigger rate":
    "Share of skill-relevant runs where the agent actually called use_skill to load the instructions. Measured for the Skill configuration; 100% by construction for Explicit Trigger and AGENTS.md, which always deliver the instructions.",
  "Skill effectiveness":
    "Task success in the Skill configuration minus task success in Baseline, in percentage points.",
  "Task success":
    "Share of scored runs the evaluator marked as satisfying the task's criteria.",
  "Avg score":
    "Mean scorer output across runs, where a deterministic check is the fraction of expected terms found and the judge reports the fraction of criteria satisfied.",
  "Avg tokens":
    "Mean input plus output tokens per run, summed across every model call the agent loop made.",
  "Avg runtime":
    "Mean wall-clock time per run, from the first model call to the final response.",
  "Missed invocations":
    "Runs where the task was skill-relevant and the agent never loaded the skill.",
  "False-positive invocations":
    "Runs where the task did not need the skill and the agent loaded it anyway.",
  Runs: "Number of agent runs this configuration contributed: tasks multiplied by runs per configuration.",
} as const;

export type MetricTipName = keyof typeof METRIC_TIPS;

export const CONFIG_EXPLAINERS = [
  {
    id: "baseline",
    name: "Baseline",
    summary:
      "No skill. The agent gets the task and read-only repository tools, nothing else.",
  },
  {
    id: "skill",
    name: "Skill",
    summary:
      "The agent sees the skill's name and description and is given a use_skill tool. It decides whether to load the instructions.",
  },
  {
    id: "explicit",
    name: "Explicit Trigger",
    summary:
      "The full instructions are supplied up front and the prompt states the skill applies. Discovery is removed, so this isolates instruction quality.",
  },
  {
    id: "agents-md",
    name: "AGENTS.md",
    summary:
      "The same instructions are supplied as persistent repository guidance, present on every task whether or not it is relevant.",
  },
] as const;
