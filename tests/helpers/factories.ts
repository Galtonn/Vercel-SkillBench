import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelToolCall,
} from "@/lib/eval/provider";
import type {
  ConfigId,
  EvalRun,
  EvalTask,
  EvaluationRecord,
  ResolvedSkill,
} from "@/lib/eval/types";

/**
 * Test doubles. Model responses are scripted only here — production evaluation
 * code always talks to a real provider.
 */

export const SKILL_MARKDOWN = `---
name: analyze-bundle
description: Analyze JavaScript bundles and identify opportunities to reduce client-side bundle size.
---

# Analyze Bundle

1. Read the bundle analysis artifacts.
2. Attribute size to specific modules.
3. Propose a change and state the expected saving.`;

export function makeSkill(overrides: Partial<ResolvedSkill> = {}): ResolvedSkill {
  return {
    name: "analyze-bundle",
    description:
      "Analyze JavaScript bundles and identify opportunities to reduce client-side bundle size.",
    instructions:
      "# Analyze Bundle\n\n1. Read the bundle analysis artifacts.\n2. Attribute size to modules.",
    reference: "vercel-labs/dev3000/analyze-bundle",
    sourceKind: "github",
    sourceLabel: "https://example.test/SKILL.md",
    raw: SKILL_MARKDOWN,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<EvalTask> = {}): EvalTask {
  return {
    id: "task-1",
    name: "Largest client dependency",
    prompt: "Which dependency contributes the most client JavaScript?",
    skillRelevant: true,
    expected: { type: "llm_judge", criteria: ["Names the largest dependency."] },
    ...overrides,
  };
}

let runCounter = 0;

export function makeRun(overrides: Partial<EvalRun> = {}): EvalRun {
  runCounter += 1;
  return {
    id: `run-${runCounter}`,
    taskId: "task-1",
    taskName: "Largest client dependency",
    taskPrompt: "Which dependency contributes the most client JavaScript?",
    configId: "baseline",
    attempt: 1,
    status: "completed",
    response: "The largest dependency is chart-vendor.",
    success: true,
    score: 1,
    scorer: "llm_judge",
    judgeReason: "Identified the correct dependency.",
    judgeError: null,
    skillRelevant: true,
    skillInvoked: false,
    skillInvocationReason: null,
    classification: null,
    latencyMs: 4000,
    inputTokens: 1000,
    outputTokens: 200,
    modelCalls: 2,
    toolCalls: [],
    events: [{ atMs: 0, label: "Run started" }],
    error: null,
    ...overrides,
  };
}

/**
 * Builds the run set for one config with an explicit success/invocation pattern,
 * which keeps the metric tests readable.
 */
export function makeRuns(
  configId: ConfigId,
  pattern: Array<{
    success: boolean;
    skillRelevant?: boolean;
    skillInvoked?: boolean;
    status?: EvalRun["status"];
  }>,
): EvalRun[] {
  return pattern.map((entry, index) =>
    makeRun({
      id: `${configId}-${index}`,
      taskId: `task-${index + 1}`,
      configId,
      success: entry.success,
      score: entry.success ? 1 : 0,
      status: entry.status ?? "completed",
      skillRelevant: entry.skillRelevant ?? true,
      skillInvoked: entry.skillInvoked ?? false,
    }),
  );
}

export function makeRecord(
  overrides: Partial<EvaluationRecord> = {},
): EvaluationRecord {
  return {
    id: "analyze-bundle-260101120000-abcd",
    schemaVersion: 1,
    createdAt: "2026-01-01T12:00:00.000Z",
    startedAt: "2026-01-01T12:00:01.000Z",
    completedAt: "2026-01-01T12:04:13.000Z",
    status: "completed",
    error: null,
    progress: {
      phase: "done",
      label: "Complete",
      detail: "Evaluation finished",
      completed: 4,
      total: 4,
      updatedAt: "2026-01-01T12:04:13.000Z",
    },
    request: {
      skillReference: "vercel-labs/dev3000/analyze-bundle",
      repo: "bundle-bench",
      model: "gpt-4o-mini",
      selectedConfigs: ["baseline", "skill"],
      runsPerConfig: 1,
      benchmarkId: "analyze-bundle",
      workspaceId: "bundle-bench",
    },
    skill: makeSkill(),
    tasks: [makeTask()],
    runs: [],
    metrics: null,
    findings: [],
    findingsError: null,
    improvement: null,
    revisionOf: null,
    question: "Does analyze-bundle improve bundle investigations?",
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

export type ScriptedTurn = {
  text?: string;
  toolCalls?: ModelToolCall[];
  inputTokens?: number;
  outputTokens?: number;
};

/** Replays a fixed list of turns, then repeats the last one. */
export function scriptedProvider(turns: ScriptedTurn[]): ModelProvider & {
  requests: ModelRequest[];
} {
  const requests: ModelRequest[] = [];
  let index = 0;

  return {
    model: "scripted-model",
    requests,
    async generate(request: ModelRequest): Promise<ModelResponse> {
      requests.push(request);
      const turn = turns[Math.min(index, turns.length - 1)];
      index += 1;
      return {
        text: turn.text ?? "",
        toolCalls: turn.toolCalls ?? [],
        inputTokens: turn.inputTokens ?? 100,
        outputTokens: turn.outputTokens ?? 20,
        latencyMs: 5,
        model: "scripted-model",
        finishReason: turn.toolCalls?.length ? "tool_calls" : "stop",
      };
    },
  };
}

/**
 * Routes each call by inspecting the request, which is how the runner's mixed
 * traffic (agent turns, judge calls, findings call) can be scripted at once.
 */
export function routedProvider(
  handler: (request: ModelRequest, callIndex: number) => ScriptedTurn,
): ModelProvider & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = [];

  return {
    model: "routed-model",
    requests,
    async generate(request: ModelRequest): Promise<ModelResponse> {
      const turn = handler(request, requests.length);
      requests.push(request);
      return {
        text: turn.text ?? "",
        toolCalls: turn.toolCalls ?? [],
        inputTokens: turn.inputTokens ?? 100,
        outputTokens: turn.outputTokens ?? 20,
        latencyMs: 5,
        model: "routed-model",
        finishReason: turn.toolCalls?.length ? "tool_calls" : "stop",
      };
    },
  };
}

export function toolCall(
  name: string,
  args: Record<string, unknown>,
  id = `call-${name}`,
): ModelToolCall {
  return { id, name, argumentsJson: JSON.stringify(args) };
}

export function systemPromptOf(request: ModelRequest): string {
  const system = request.messages.find((message) => message.role === "system");
  return system && "content" in system ? system.content : "";
}
