import { getBenchmark } from "./benchmarks";
import {
  DEFAULT_RUNS_PER_CONFIG,
  getAgentOption,
  MAX_REPOSITORY_LABEL_CHARS,
  MAX_SKILL_REFERENCE_CHARS,
} from "./config";
import { generateImprovedSkill } from "./improve";
import { resolveModel } from "./openai-provider";
import { createProviderForRequest } from "./model-provider";
import { resolveRevisedSkill, resolveSkill } from "./skill-parser";
import {
  assessSkillCompatibility,
  skillCompatibilityMessage,
} from "./tool-compatibility";
import { normalizeDrafts, parseTaskDrafts } from "./custom-tasks";
import { parseTasksFromText } from "./tasks";
import { workspaceIdFromRepo } from "./fixtures";
import { meaningfulEvaluationIssues } from "./benchmark-validation";
import {
  createEvaluationRecord,
  EvaluationValidationError,
  validateEvaluationInput,
} from "./runner";
import type {
  BenchmarkSource,
  ConfigId,
  EvalTask,
  EvaluationRecord,
} from "./types";
import {
  generateEvaluationId,
  loadEvaluation,
  saveEvaluation,
} from "../storage/evaluations";

/**
 * Server-side entry points used by the route handlers. Everything that touches
 * the model provider or persistence lives behind this module, so no browser
 * bundle can reach an API key.
 */

export type CreateEvaluationPayload = {
  skill?: unknown;
  repo?: unknown;
  tasksText?: unknown;
  tasks?: unknown;
  benchmarkId?: unknown;
  benchmarkSource?: unknown;
  agent?: unknown;
  configs?: unknown;
  runsPerConfig?: unknown;
  workspaceId?: unknown;
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

function parseBenchmarkSource(value: unknown): BenchmarkSource | null {
  if (value === "built-in" || value === "ai-generated" || value === "user-authored") {
    return value;
  }
  return null;
}

export async function createEvaluation(
  payload: CreateEvaluationPayload,
  ownerId: string,
): Promise<EvaluationRecord> {
  if (!ownerId) {
    throw new EvaluationValidationError("A valid demo session is required.");
  }

  const benchmark = getBenchmark(asString(payload.benchmarkId) || null);

  const skillReference =
    asString(payload.skill).trim() || benchmark?.skillReference || "";
  if (!skillReference) {
    throw new EvaluationValidationError("Provide a skill to evaluate.");
  }
  if (skillReference.length > MAX_SKILL_REFERENCE_CHARS) {
    throw new EvaluationValidationError(
      `Skill input may not exceed ${MAX_SKILL_REFERENCE_CHARS.toLocaleString()} characters.`,
    );
  }

  const configs = parseConfigs(payload.configs);
  const requestedAgentId = asString(payload.agent).trim();
  const selectedAgent = requestedAgentId
    ? getAgentOption(requestedAgentId)
    : undefined;
  if (requestedAgentId && !selectedAgent) {
    throw new EvaluationValidationError(
      `Unknown agent profile: "${requestedAgentId}".`,
    );
  }
  const runsPerConfig =
    typeof payload.runsPerConfig === "number"
      ? payload.runsPerConfig
      : DEFAULT_RUNS_PER_CONFIG;

  let tasks: EvalTask[];
  let benchmarkSource: BenchmarkSource;

  if (benchmark) {
    tasks = benchmark.tasks;
    benchmarkSource = "built-in";
  } else {
    const drafts = parseTaskDrafts(payload.tasks);
    tasks =
      drafts.length > 0
        ? normalizeDrafts(drafts)
        : parseTasksFromText(asString(payload.tasksText));
    const claimed = parseBenchmarkSource(payload.benchmarkSource);
    // A client cannot declare a custom task list as built-in.
    benchmarkSource =
      claimed === "ai-generated" ? "ai-generated" : "user-authored";
  }

  const repo =
    asString(payload.repo).trim() || benchmark?.repo || "no repository supplied";
  if (repo.length > MAX_REPOSITORY_LABEL_CHARS) {
    throw new EvaluationValidationError(
      `Repository labels may not exceed ${MAX_REPOSITORY_LABEL_CHARS} characters.`,
    );
  }

  const workspaceId =
    benchmark?.workspaceId ??
    (typeof payload.workspaceId === "string" && payload.workspaceId
      ? payload.workspaceId
      : null) ??
    workspaceIdFromRepo(repo);

  validateEvaluationInput({ tasks, selectedConfigs: configs, runsPerConfig });
  const methodologyIssues = meaningfulEvaluationIssues({
    tasks,
    selectedConfigs: configs,
    hasWorkspace: Boolean(workspaceId),
  });
  if (methodologyIssues.length > 0) {
    throw new EvaluationValidationError(
      `This evaluation would not produce a meaningful comparison: ${methodologyIssues.join(" ")}`,
    );
  }

  const skill = await resolveSkill(skillReference);
  const compatibility = assessSkillCompatibility(skill);
  if (!compatibility.compatible) {
    throw new EvaluationValidationError(skillCompatibilityMessage(compatibility));
  }

  const record = createEvaluationRecord({
    id: generateEvaluationId(skill.name),
    ownerId,
    skill,
    tasks,
    question:
      benchmark?.question ??
      `Does the ${skill.name} skill improve an agent's performance on these tasks?`,
    request: {
      skillReference,
      repo,
      ...(selectedAgent ? { agentId: selectedAgent.id } : {}),
      ...(selectedAgent ? { provider: selectedAgent.provider } : {}),
      model: selectedAgent?.model ?? resolveModel(),
      selectedConfigs: configs,
      runsPerConfig,
      benchmarkId: benchmark?.id ?? null,
      benchmarkSource,
      workspaceId,
    },
  });

  await saveEvaluation(record);

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

export async function improveSkill(id: string, ownerId: string): Promise<EvaluationRecord> {
  const record = await loadEvaluation(id, ownerId);
  if (!record) throw new ServiceError(`Evaluation "${id}" was not found.`, 404);
  if (!record.metrics) {
    throw new ServiceError(
      "This evaluation has no metrics yet, so there is nothing to learn from.",
    );
  }
  if (record.runs.length === 0) {
    throw new ServiceError("This evaluation has no runs to analyse.");
  }
  if (record.improvement) return record;

  const provider = createProviderForRequest(record.request);

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
export async function createReevaluation(id: string, ownerId: string): Promise<EvaluationRecord> {
  const original = await loadEvaluation(id, ownerId);
  if (!original) throw new ServiceError(`Evaluation "${id}" was not found.`, 404);
  if (!original.improvement) {
    throw new ServiceError(
      "Generate an improved skill before re-evaluating.",
    );
  }

  if (original.improvement.reevaluationId) {
    const existing = await loadEvaluation(original.improvement.reevaluationId, ownerId);
    if (existing) return existing;
  }

  const revisedSkill = resolveRevisedSkill(
    original.improvement.revisedSkillMarkdown,
    original.request.skillReference,
  );
  const compatibility = assessSkillCompatibility(revisedSkill);
  if (!compatibility.compatible) {
    throw new ServiceError(skillCompatibilityMessage(compatibility));
  }

  const record = createEvaluationRecord({
    id: generateEvaluationId(`${revisedSkill.name}-revised`),
    ownerId,
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

  return record;
}
