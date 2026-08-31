import { getBenchmark } from "./benchmarks";
import { DEFAULT_RUNS_PER_CONFIG } from "./config";
import { generateImprovedSkill } from "./improve";
import { createOpenAIProvider, resolveModel } from "./openai-provider";
import { resolveRevisedSkill, resolveSkill } from "./skill-parser";
import { parseTasksFromText } from "./tasks";
import {
  createEvaluationRecord,
  EvaluationValidationError,
  startEvaluationInBackground,
  validateEvaluationInput,
} from "./runner";
import type { ConfigId, EvalTask, EvaluationRecord } from "./types";
import {
  generateEvaluationId,
  loadEvaluation,
  saveEvaluation,
} from "../storage/evaluations";

/**
 * Server-side entry points used by the route handlers. Everything that touches
 * the model provider or the filesystem lives behind this module, so no browser
 * bundle can reach an API key.
 */

export type CreateEvaluationPayload = {
  skill?: unknown;
  repo?: unknown;
  tasksText?: unknown;
  benchmarkId?: unknown;
  configs?: unknown;
  runsPerConfig?: unknown;
};

const VALID_CONFIGS: ConfigId[] = ["baseline", "skill", "explicit", "agents-md"];

function parseConfigs(value: unknown): ConfigId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ConfigId>();
  for (const entry of value) {
    if (typeof entry === "string" && (VALID_CONFIGS as string[]).includes(entry)) {
      seen.add(entry as ConfigId);
    }
  }
  // Preserve the canonical ordering so the comparison table reads consistently.
  return VALID_CONFIGS.filter((config) => seen.has(config));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export async function createAndStartEvaluation(
  payload: CreateEvaluationPayload,
): Promise<EvaluationRecord> {
  const benchmark = getBenchmark(asString(payload.benchmarkId) || null);

  const skillReference =
    asString(payload.skill).trim() || benchmark?.skillReference || "";
  if (!skillReference) {
    throw new EvaluationValidationError("Provide a skill to evaluate.");
  }

  const configs = parseConfigs(payload.configs);
  const runsPerConfig =
    typeof payload.runsPerConfig === "number"
      ? payload.runsPerConfig
      : DEFAULT_RUNS_PER_CONFIG;

  let tasks: EvalTask[];
  if (benchmark) {
    tasks = benchmark.tasks;
  } else {
    tasks = parseTasksFromText(asString(payload.tasksText));
  }

  validateEvaluationInput({ tasks, selectedConfigs: configs, runsPerConfig });

  // Resolving the skill can fail (bad frontmatter, missing file, network error).
  // Let it throw so the caller reports the real reason instead of running an
  // evaluation against placeholder content.
  const skill = await resolveSkill(skillReference);

  const repo =
    asString(payload.repo).trim() || benchmark?.repo || "no repository supplied";

  const record = createEvaluationRecord({
    id: generateEvaluationId(skill.name),
    skill,
    tasks,
    question:
      benchmark?.question ??
      `Does the ${skill.name} skill improve an agent's performance on these tasks?`,
    request: {
      skillReference,
      repo,
      model: resolveModel(),
      selectedConfigs: configs,
      runsPerConfig,
      benchmarkId: benchmark?.id ?? null,
      workspaceId: benchmark?.workspaceId ?? null,
    },
  });

  await saveEvaluation(record);
  startEvaluationInBackground(record.id);

  return record;
}

export class ServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
  }
}

export async function improveSkill(id: string): Promise<EvaluationRecord> {
  const record = await loadEvaluation(id);
  if (!record) throw new ServiceError(`Evaluation "${id}" was not found.`, 404);
  if (!record.metrics) {
    throw new ServiceError(
      "This evaluation has no metrics yet, so there is nothing to learn from.",
    );
  }
  if (record.runs.length === 0) {
    throw new ServiceError("This evaluation has no runs to analyse.");
  }

  const provider = createOpenAIProvider({ model: record.request.model });

  record.improvement = await generateImprovedSkill({
    provider,
    skill: record.skill,
    metrics: record.metrics,
    runs: record.runs,
  });

  await saveEvaluation(record);
  return record;
}

/**
 * Re-runs the same tasks, model, configurations, and repetitions against the
 * revised skill, as a separate evaluation linked back to the original.
 */
export async function startReevaluation(id: string): Promise<EvaluationRecord> {
  const original = await loadEvaluation(id);
  if (!original) throw new ServiceError(`Evaluation "${id}" was not found.`, 404);
  if (!original.improvement) {
    throw new ServiceError(
      "Generate an improved skill before re-evaluating.",
    );
  }

  if (original.improvement.reevaluationId) {
    const existing = await loadEvaluation(original.improvement.reevaluationId);
    if (existing) return existing;
  }

  const revisedSkill = resolveRevisedSkill(
    original.improvement.revisedSkillMarkdown,
    original.request.skillReference,
  );

  const record = createEvaluationRecord({
    id: generateEvaluationId(`${revisedSkill.name}-revised`),
    skill: revisedSkill,
    tasks: original.tasks,
    question: original.question,
    revisionOf: original.id,
    request: {
      ...original.request,
      skillReference: `${original.request.skillReference} (revised)`,
    },
  });

  await saveEvaluation(record);

  original.improvement.reevaluationId = record.id;
  await saveEvaluation(original);

  startEvaluationInBackground(record.id);
  return record;
}
