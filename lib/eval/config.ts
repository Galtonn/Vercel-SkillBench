/**
 * Limits and defaults shared by the client form and the server runner.
 *
 * This module must stay free of Node-only imports so the New Evaluation form can
 * use the same numbers the server enforces.
 */

export const MAX_TASKS = 20;
export const MAX_RUNS_PER_TASK = 5;
/** Recruiter demos stay short enough to finish inside one hosted invocation. */
export const MAX_AGENT_RUNS_PER_EVALUATION = 12;
export const MAX_EVALUATIONS_PER_SESSION_PER_DAY = 10;
export const MAX_EVALUATIONS_GLOBAL_PER_DAY = 50;
export const MAX_SKILL_REFERENCE_CHARS = 100_000;
export const MAX_TASK_PROMPT_CHARS = 6_000;
export const MAX_CRITERION_CHARS = 2_000;
export const MAX_CRITERIA_PER_TASK = 12;
export const MAX_REFERENCE_ANSWER_CHARS = 12_000;
export const MAX_EXPECTED_VALUES_PER_TASK = 20;
export const MAX_REPOSITORY_LABEL_CHARS = 200;

/** How many agent runs may be in flight at once. */
export const RUN_CONCURRENCY = 3;

/**
 * Upper bound on agent loop iterations. One iteration is one model call plus any
 * tool results it asked for. This caps the blast radius of a looping model.
 */
export const MAX_AGENT_ITERATIONS = 4;

/** A run may load the skill at most once. */
export const MAX_SKILL_LOADS_PER_RUN = 1;

export const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Agent profiles exposed by the evaluation UI.
 *
 * Keep the profile id separate from the model id so a future profile can also
 * carry agent-specific instructions or tools without changing saved URLs.
 */
export const AGENT_OPTIONS = [
  {
    id: "astra",
    label: "GPT-6 Astra",
    model: "gpt-6-astra",
    hint: "Most capable for complex reasoning and coding",
    group: "current",
    provider: "openai",
    credential: "OPENAI_API_KEY",
  },
  {
    id: "sol",
    label: "GPT-5.6 Sol",
    model: "gpt-5.6-sol",
    hint: "High-quality professional work",
    group: "current",
    provider: "openai",
    credential: "OPENAI_API_KEY",
  },
  {
    id: "terra",
    label: "GPT-5.6 Terra",
    model: "gpt-5.6-terra",
    hint: "Balanced intelligence and cost",
    group: "current",
    provider: "openai",
    credential: "OPENAI_API_KEY",
  },
  {
    id: "luna",
    label: "GPT-5.6 Luna",
    model: "gpt-5.6-luna",
    hint: "Fast, cost-sensitive evaluation runs",
    group: "current",
    provider: "openai",
    credential: "OPENAI_API_KEY",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    model: "gpt-5-mini",
    hint: "Efficient reasoning for well-defined tasks",
    group: "legacy",
    provider: "openai",
    credential: "OPENAI_API_KEY",
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    model: "gpt-4.1-mini",
    hint: "Fast instruction following and tool calling",
    group: "legacy",
    provider: "openai",
    credential: "OPENAI_API_KEY",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini",
    model: "gpt-4o-mini",
    hint: "Affordable model for focused tasks",
    group: "legacy",
    provider: "openai",
    credential: "OPENAI_API_KEY",
  },
  {
    id: "v0-mini",
    label: "v0 Mini",
    model: "v0-mini",
    hint: "Fastest, lowest-cost v0 model for focused tasks",
    group: "specialized",
    provider: "v0",
    credential: "V0_API_KEY",
  },
  {
    id: "v0",
    label: "v0 Pro",
    model: "v0-pro",
    hint: "Balanced v0 model for most frontend and full-stack work",
    group: "specialized",
    provider: "v0",
    credential: "V0_API_KEY",
  },
  {
    id: "v0-max",
    label: "v0 Max",
    model: "v0-max",
    hint: "Highest-intelligence v0 model for complex work",
    group: "specialized",
    provider: "v0",
    credential: "V0_API_KEY",
  },
  {
    id: "v0-max-fast",
    label: "v0 Max Fast",
    model: "v0-max-fast",
    hint: "v0 Max capability with faster output",
    group: "specialized",
    provider: "v0",
    credential: "V0_API_KEY",
  },
] as const;

export type AgentId = (typeof AGENT_OPTIONS)[number]["id"];
export type AgentOption = (typeof AGENT_OPTIONS)[number];

export const DEFAULT_AGENT_ID: AgentId = "terra";

export function getAgentOption(value: unknown): AgentOption | undefined {
  if (typeof value !== "string") return undefined;
  return AGENT_OPTIONS.find((agent) => agent.id === value);
}

export const DEFAULT_RUNS_PER_CONFIG = 1;

/** Retries for transient provider failures (rate limits, 5xx, connection). */
export const PROVIDER_MAX_RETRIES = 3;

/**
 * A conservative estimate of model calls per agent run, used only for the cost
 * preview. Real runs use however many iterations the model asks for, up to
 * MAX_AGENT_ITERATIONS.
 */
export const ESTIMATED_MODEL_CALLS_PER_RUN = 3;

export type CostPreview = {
  tasks: number;
  configurations: number;
  runsPerConfig: number;
  agentRuns: number;
  judgeCalls: number;
  estimatedModelCalls: number;
  analysisCalls: number;
};

/**
 * Work preview for the New Evaluation form, so nobody launches hundreds of
 * requests by accident.
 */
export function estimateCost(input: {
  tasks: number;
  configurations: number;
  runsPerConfig: number;
  judgedTasks?: number;
}): CostPreview {
  const tasks = Math.max(0, input.tasks);
  const configurations = Math.max(0, input.configurations);
  const runsPerConfig = Math.max(0, input.runsPerConfig);
  const agentRuns = tasks * configurations * runsPerConfig;
  const judgedShare = input.judgedTasks === undefined ? tasks : input.judgedTasks;
  const judgeCalls =
    tasks === 0 ? 0 : Math.round(agentRuns * (judgedShare / tasks));

  return {
    tasks,
    configurations,
    runsPerConfig,
    agentRuns,
    judgeCalls,
    estimatedModelCalls:
      agentRuns * ESTIMATED_MODEL_CALLS_PER_RUN + judgeCalls + (agentRuns > 0 ? 1 : 0),
    analysisCalls: agentRuns > 0 ? 1 : 0,
  };
}
