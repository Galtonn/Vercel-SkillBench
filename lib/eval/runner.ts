import { runAgent } from "./agent";
import { WORKSPACE_DIRECTORIES } from "./benchmarks";
import { classifyRun } from "./classify";
import { MAX_RUNS_PER_TASK, MAX_TASKS, RUN_CONCURRENCY } from "./config";
import { generateFindings } from "./findings";
import { judgeResponse } from "./judge";
import { mapWithConcurrency } from "./limiter";
import { computeMetrics } from "./metrics";
import { createOpenAIProvider, resolveModel } from "./openai-provider";
import { ProviderError, type ModelProvider } from "./provider";
import { scoreContains } from "./scorer";
import {
  CONFIG_IDS,
  CONFIG_LABELS,
  type ConfigId,
  type EvalRun,
  type EvalTask,
  type EvaluationProgress,
  type EvaluationRecord,
  type EvaluationRequest,
  type ProgressPhase,
  type ResolvedSkill,
} from "./types";
import { ReadOnlyWorkspace } from "./workspace";
import {
  deleteEvaluation,
  loadEvaluation,
  saveEvaluation,
} from "../storage/evaluations";

/**
 * Orchestrates an evaluation: real model calls for every task under every
 * selected configuration, real scoring, real aggregation, and progress that
 * corresponds to completed work.
 *
 * Progress is written into the stored evaluation as it advances, so a client can
 * follow a run over SSE and still recover the correct state after a refresh.
 */

/** Ids currently executing in this process, to prevent a double start. */
const inFlight = new Set<string>();
/** Ids the user asked to cancel. */
const cancelRequested = new Set<string>();
/** Ids whose files were deleted; persist must not recreate them. */
const abandoned = new Set<string>();

export function requestCancellation(id: string) {
  if (!inFlight.has(id)) return false;
  cancelRequested.add(id);
  return true;
}

/**
 * Stops an in-flight evaluation from writing back to disk after its file has
 * been deleted. Without this, a progress save would recreate the evaluation.
 * The id stays in `abandoned` for the life of the process so a persist that
 * was already in flight cannot resurrect the file after execute returns.
 */
export function abandonEvaluation(id: string) {
  abandoned.add(id);
  if (inFlight.has(id)) cancelRequested.add(id);
}

export function isRunning(id: string) {
  return inFlight.has(id);
}

export type CreateEvaluationInput = {
  id: string;
  skill: ResolvedSkill;
  tasks: EvalTask[];
  request: EvaluationRequest;
  question: string;
  revisionOf?: string | null;
};

export class EvaluationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationValidationError";
  }
}

export function validateEvaluationInput(input: {
  tasks: EvalTask[];
  selectedConfigs: ConfigId[];
  runsPerConfig: number;
}) {
  if (input.tasks.length === 0) {
    throw new EvaluationValidationError(
      "Add at least one evaluation task before running.",
    );
  }
  if (input.tasks.length > MAX_TASKS) {
    throw new EvaluationValidationError(
      `An evaluation may contain at most ${MAX_TASKS} tasks (received ${input.tasks.length}).`,
    );
  }
  if (input.selectedConfigs.length === 0) {
    throw new EvaluationValidationError(
      "Select at least one configuration to run.",
    );
  }
  for (const configId of input.selectedConfigs) {
    if (!CONFIG_IDS.includes(configId)) {
      throw new EvaluationValidationError(`Unknown configuration "${configId}".`);
    }
  }
  if (
    !Number.isInteger(input.runsPerConfig) ||
    input.runsPerConfig < 1 ||
    input.runsPerConfig > MAX_RUNS_PER_TASK
  ) {
    throw new EvaluationValidationError(
      `Runs per configuration must be a whole number between 1 and ${MAX_RUNS_PER_TASK}.`,
    );
  }
}

function initialProgress(total: number): EvaluationProgress {
  return {
    phase: "preparing",
    label: "Preparing evaluation",
    detail: "Queued",
    completed: 0,
    total,
    updatedAt: new Date().toISOString(),
  };
}

export function createEvaluationRecord(
  input: CreateEvaluationInput,
): EvaluationRecord {
  const total =
    input.tasks.length *
    input.request.selectedConfigs.length *
    input.request.runsPerConfig;

  return {
    id: input.id,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    status: "queued",
    error: null,
    progress: initialProgress(total),
    request: input.request,
    skill: input.skill,
    tasks: input.tasks,
    runs: [],
    metrics: null,
    findings: [],
    findingsError: null,
    improvement: null,
    revisionOf: input.revisionOf ?? null,
    question: input.question,
  };
}

/* -------------------------------------------------------------------------- */
/* Execution                                                                  */
/* -------------------------------------------------------------------------- */

type WorkUnit = {
  task: EvalTask;
  taskIndex: number;
  configId: ConfigId;
  attempt: number;
};

async function executeRun(input: {
  provider: ModelProvider;
  unit: WorkUnit;
  skill: ResolvedSkill;
  repoLabel: string;
  workspace: ReadOnlyWorkspace | null;
  onJudging: () => void;
}): Promise<EvalRun> {
  const { unit } = input;
  const id = `${unit.task.id}--${unit.configId}--${unit.attempt}`;

  const base = {
    id,
    taskId: unit.task.id,
    taskName: unit.task.name,
    taskPrompt: unit.task.prompt,
    configId: unit.configId,
    attempt: unit.attempt,
    skillRelevant: unit.task.skillRelevant,
  };

  let agent;
  try {
    agent = await runAgent({
      provider: input.provider,
      configId: unit.configId,
      task: unit.task,
      skill: input.skill,
      repoLabel: input.repoLabel,
      workspace: input.workspace,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      status: "error",
      response: "",
      success: false,
      score: 0,
      scorer: unit.task.expected.type === "contains" ? "contains" : "llm_judge",
      judgeReason: "The run did not complete, so it was not scored.",
      judgeError: null,
      skillInvoked: false,
      skillInvocationReason: null,
      classification: null,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      modelCalls: 0,
      toolCalls: [],
      events: [{ atMs: 0, label: `Run failed: ${detail}`, warning: true }],
      error: detail,
    };
  }

  input.onJudging();

  let success: boolean;
  let score: number;
  let judgeReason: string;
  let judgeError: string | null = null;

  if (unit.task.expected.type === "contains") {
    const result = scoreContains(
      agent.response,
      unit.task.expected.values,
      unit.task.expected.mode ?? "all",
    );
    success = result.success;
    score = result.score;
    judgeReason = result.reason;
    agent.events.push({
      atMs: agent.latencyMs,
      label: `Deterministic scorer: ${success ? "pass" : "fail"}`,
      ...(success ? {} : { warning: true }),
    });
  } else {
    const result = await judgeResponse({
      provider: input.provider,
      taskPrompt: unit.task.prompt,
      criteria: unit.task.expected.criteria,
      referenceAnswer: unit.task.expected.referenceAnswer,
      response: agent.response,
    });
    success = result.success;
    score = result.score;
    judgeReason = result.reason;
    judgeError = result.judgeError;
    agent.events.push({
      atMs: agent.latencyMs,
      label: judgeError
        ? `Judge could not score this run: ${judgeError}`
        : `Judge scored response: ${success ? "pass" : "fail"} (${Math.round(score * 100)})`,
      ...(success && !judgeError ? {} : { warning: true }),
    });
  }

  // A run the judge could not score is not evidence either way, so it is marked
  // errored rather than counted as a failure.
  const status = judgeError ? "error" : "completed";

  return {
    ...base,
    status,
    response: agent.response,
    success,
    score,
    scorer: unit.task.expected.type === "contains" ? "contains" : "llm_judge",
    judgeReason,
    judgeError,
    skillInvoked: agent.skillInvoked,
    skillInvocationReason: agent.skillInvocationReason,
    classification: classifyRun({
      configId: unit.configId,
      skillRelevant: unit.task.skillRelevant,
      skillInvoked: agent.skillInvoked,
      success,
    }),
    latencyMs: agent.latencyMs,
    inputTokens: agent.inputTokens,
    outputTokens: agent.outputTokens,
    modelCalls: agent.modelCalls,
    toolCalls: agent.toolCalls,
    events: agent.events,
    error: judgeError ? `Judge failure: ${judgeError}` : null,
  };
}

function resolveWorkspace(workspaceId: string | null): ReadOnlyWorkspace | null {
  if (!workspaceId) return null;
  const fixtureName = WORKSPACE_DIRECTORIES[workspaceId];
  if (!fixtureName) return null;
  return new ReadOnlyWorkspace(fixtureName);
}

/**
 * Runs a queued evaluation to completion. Safe to call once per evaluation id;
 * subsequent calls while it is running are ignored.
 */
export async function executeEvaluation(
  id: string,
  options: { provider?: ModelProvider } = {},
): Promise<void> {
  if (inFlight.has(id)) return;

  const loaded = await loadEvaluation(id);
  if (!loaded) throw new Error(`Evaluation "${id}" not found.`);
  if (loaded.status !== "queued") return;

  inFlight.add(id);
  const record = loaded;
  const startedAtMs = Date.now();

  const persist = async (progress: Partial<EvaluationProgress> = {}) => {
    if (abandoned.has(id)) return;
    record.progress = {
      ...record.progress,
      ...progress,
      updatedAt: new Date().toISOString(),
    };
    if (abandoned.has(id)) return;
    await saveEvaluation(record);
    if (abandoned.has(id)) {
      await deleteEvaluation(id).catch(() => {});
    }
  };

  const setPhase = async (
    phase: ProgressPhase,
    label: string,
    detail: string,
  ) => {
    await persist({ phase, label, detail });
  };

  try {
    record.status = "running";
    record.startedAt = new Date().toISOString();
    await setPhase("preparing", "Preparing evaluation", "Connecting to the model provider");

    const provider =
      options.provider ??
      createOpenAIProvider({ model: record.request.model || resolveModel() });

    record.request.model = provider.model;

    const workspace = resolveWorkspace(record.request.workspaceId);
    const repoLabel = record.request.repo;

    const units: WorkUnit[][] = record.tasks.map((task, taskIndex) => {
      const taskUnits: WorkUnit[] = [];
      for (const configId of record.request.selectedConfigs) {
        for (let attempt = 1; attempt <= record.request.runsPerConfig; attempt += 1) {
          taskUnits.push({ task, taskIndex, configId, attempt });
        }
      }
      return taskUnits;
    });

    let completed = 0;

    for (const taskUnits of units) {
      if (cancelRequested.has(id)) break;

      const taskIndex = taskUnits[0].taskIndex;
      const label = `Task ${taskIndex + 1}/${record.tasks.length}`;
      await persist({
        phase: "running",
        label,
        detail: `Running ${taskUnits.map((unit) => CONFIG_LABELS[unit.configId]).filter(unique).join(", ")}`,
      });

      const results = await mapWithConcurrency(
        taskUnits,
        RUN_CONCURRENCY,
        async (unit) => {
          if (cancelRequested.has(id)) return null;

          await persist({
            phase: "running",
            label,
            detail: `Running ${CONFIG_LABELS[unit.configId]}`,
          });

          const run = await executeRun({
            provider,
            unit,
            skill: record.skill,
            repoLabel,
            workspace,
            // Fire-and-forget: a progress write is not worth delaying scoring
            // for, and a failed one must not abort the run.
            onJudging: () => {
              void persist({
                phase: "running",
                label,
                detail: `Scoring ${CONFIG_LABELS[unit.configId]}`,
              }).catch(() => {});
            },
          });

          completed += 1;
          record.runs.push(run);
          await persist({ phase: "running", label, completed });
          return run;
        },
      );

      void results;
    }

    if (cancelRequested.has(id)) {
      record.status = "cancelled";
      record.completedAt = new Date().toISOString();
      record.metrics = computeMetrics({
        runs: record.runs,
        selectedConfigs: record.request.selectedConfigs,
        wallClockMs: Date.now() - startedAtMs,
      });
      await setPhase("error", "Evaluation cancelled", "Partial results were saved");
      return;
    }

    await setPhase("analyzing", "Calculating metrics", "Aggregating run data");
    record.metrics = computeMetrics({
      runs: record.runs,
      selectedConfigs: record.request.selectedConfigs,
      wallClockMs: Date.now() - startedAtMs,
    });

    if (record.runs.some((run) => run.status === "completed")) {
      await setPhase("analyzing", "Analysing results", "Generating findings");
      const analysis = await generateFindings({
        provider,
        skill: record.skill,
        metrics: record.metrics,
        runs: record.runs,
      });
      record.findings = analysis.findings;
      record.findingsError = analysis.error;
    } else {
      record.findingsError =
        "No run produced a scored response, so no analysis was generated.";
    }

    await setPhase("saving", "Saving evaluation", "Writing results to disk");

    record.status = "completed";
    record.completedAt = new Date().toISOString();
    // Recompute so wall-clock includes the analysis call.
    record.metrics = computeMetrics({
      runs: record.runs,
      selectedConfigs: record.request.selectedConfigs,
      wallClockMs: Date.now() - startedAtMs,
    });
    await setPhase("done", "Complete", "Evaluation finished");
  } catch (error) {
    const detail =
      error instanceof ProviderError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);

    record.status = "failed";
    record.error = detail;
    record.completedAt = new Date().toISOString();
    // Keep whatever runs did complete; partial data is still real data.
    if (record.runs.length > 0) {
      record.metrics = computeMetrics({
        runs: record.runs,
        selectedConfigs: record.request.selectedConfigs,
        wallClockMs: Date.now() - startedAtMs,
      });
    }
    await setPhase("error", "Evaluation failed", detail);
  } finally {
    inFlight.delete(id);
    cancelRequested.delete(id);
  }
}

function unique<T>(value: T, index: number, all: T[]) {
  return all.indexOf(value) === index;
}

/** Starts an evaluation without blocking the request that triggered it. */
export function startEvaluationInBackground(id: string) {
  void executeEvaluation(id).catch((error) => {
    console.error(`[skillbench] evaluation ${id} crashed`, error);
  });
}
