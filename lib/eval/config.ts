/**
 * Limits and defaults shared by the client form and the server runner.
 *
 * This module must stay free of Node-only imports so the New Evaluation form can
 * use the same numbers the server enforces.
 */

export const MAX_TASKS = 20;
export const MAX_RUNS_PER_TASK = 5;

/** How many agent runs may be in flight at once. */
export const RUN_CONCURRENCY = 3;

/**
 * Upper bound on agent loop iterations. One iteration is one model call plus any
 * tool results it asked for. This caps the blast radius of a looping model.
 */
export const MAX_AGENT_ITERATIONS = 6;

/** A run may load the skill at most once. */
export const MAX_SKILL_LOADS_PER_RUN = 1;

export const DEFAULT_MODEL = "gpt-4o-mini";

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
