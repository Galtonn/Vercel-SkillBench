import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { toDetail } from "@/lib/adapters/ui";
import { USE_SKILL_TOOL_NAME } from "@/lib/eval/conditions";
import {
  EvaluationValidationError,
  abandonEvaluation,
  createEvaluationRecord,
  executeEvaluation,
  validateEvaluationInput,
} from "@/lib/eval/runner";
import {
  MAX_AGENT_RUNS_PER_EVALUATION,
  MAX_RUNS_PER_TASK,
  MAX_TASKS,
} from "@/lib/eval/config";
import type { ModelProvider, ModelRequest } from "@/lib/eval/provider";
import type { EvalTask, EvaluationRequest } from "@/lib/eval/types";
import {
  deleteEvaluation,
  loadEvaluation,
  saveEvaluation,
} from "@/lib/storage/evaluations";

import { makeSkill, routedProvider, toolCall } from "./helpers/factories";

/**
 * End-to-end coverage of the evaluation vertical slice with a scripted provider:
 * real prompt construction, real tool-call handling, real scoring, real
 * aggregation, real persistence. Only the network boundary is substituted.
 */

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "skillbench-runner-"));
  process.env.SKILLBENCH_DATA_DIR = dir;
});

afterEach(async () => {
  delete process.env.SKILLBENCH_DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

const TASKS: EvalTask[] = [
  {
    id: "bundle-regression",
    name: "Bundle regression",
    prompt: "The dashboard route bundle grew. Find out why.",
    skillRelevant: true,
    expected: { type: "llm_judge", criteria: ["Identifies the responsible import."] },
  },
  {
    id: "rename-component",
    name: "Rename a component",
    prompt: "Rename RevenuePanel to RevenueSummary.",
    skillRelevant: false,
    expected: { type: "contains", mode: "all", values: ["RevenueSummary"] },
  },
];

function request(overrides: Partial<EvaluationRequest> = {}): EvaluationRequest {
  return {
    skillReference: "vercel-labs/dev3000/analyze-bundle",
    repo: "bundle-bench",
    model: "scripted-model",
    selectedConfigs: ["baseline", "skill"],
    runsPerConfig: 1,
    benchmarkId: "analyze-bundle",
    workspaceId: null,
    ...overrides,
  };
}

function isJudgeCall(req: ModelRequest) {
  const system = req.messages[0];
  return "content" in system && system.content.includes("strict evaluator");
}

function isFindingsCall(req: ModelRequest) {
  const system = req.messages[0];
  return "content" in system && system.content.includes("You analyse the results");
}

function taskOf(req: ModelRequest) {
  const user = req.messages.find((message) => message.role === "user");
  return user && "content" in user ? user.content : "";
}

/**
 * Scripts the whole evaluation: the agent loads the skill on the relevant task
 * only, the judge passes the loaded run, and the findings call succeeds.
 */
function demoProvider(options: { invokeOnRelevant?: boolean } = {}) {
  const invoke = options.invokeOnRelevant ?? true;
  const loaded = new Set<string>();

  return routedProvider((req) => {
    if (isFindingsCall(req)) {
      return {
        text: '{"findings":[{"severity":"high","title":"Trigger wording","explanation":"Because…"}]}',
      };
    }
    if (isJudgeCall(req)) {
      const passed = JSON.stringify(req.messages).includes("Analyze Bundle");
      return {
        text: JSON.stringify({
          success: passed,
          score: passed ? 1 : 0,
          reason: passed ? "Grounded in the artifacts." : "Missed the cause.",
        }),
      };
    }

    const hasSkillTool = (req.tools ?? []).some((tool) => tool.name === USE_SKILL_TOOL_NAME);
    const prompt = taskOf(req);
    const relevant = prompt.includes("bundle grew");
    const key = `${prompt}`;

    if (invoke && hasSkillTool && relevant && !loaded.has(key)) {
      loaded.add(key);
      return {
        toolCalls: [
          toolCall(USE_SKILL_TOOL_NAME, { reason: "This is a bundle regression." }),
        ],
      };
    }

    // The skill's instructions are echoed only when they were actually loaded,
    // which is what the scripted judge keys off.
    const sawInstructions = JSON.stringify(req.messages).includes("Analyze Bundle");
    return {
      text: sawInstructions
        ? "Following Analyze Bundle: chart-vendor is pulled in by RevenueSummary."
        : "RevenueSummary rename is straightforward.",
    };
  });
}

async function runEvaluation(
  provider: ReturnType<typeof routedProvider>,
  overrides: Partial<EvaluationRequest> = {},
  tasks = TASKS,
) {
  const record = createEvaluationRecord({
    id: "test-eval",
    ownerId: "test-owner",
    skill: makeSkill(),
    tasks,
    request: request(overrides),
    question: "Does analyze-bundle help?",
  });

  await saveEvaluation(record);
  await executeEvaluation(record.id, { provider });

  return (await loadEvaluation(record.id))!;
}

describe("validateEvaluationInput", () => {
  it("accepts a valid configuration", () => {
    expect(() =>
      validateEvaluationInput({
        tasks: TASKS,
        selectedConfigs: ["baseline", "skill"],
        runsPerConfig: 1,
      }),
    ).not.toThrow();
  });

  it("requires at least one task and one configuration", () => {
    expect(() =>
      validateEvaluationInput({ tasks: [], selectedConfigs: ["skill"], runsPerConfig: 1 }),
    ).toThrow(EvaluationValidationError);
    expect(() =>
      validateEvaluationInput({ tasks: TASKS, selectedConfigs: [], runsPerConfig: 1 }),
    ).toThrow(/at least one configuration/);
  });

  it("enforces the task and repetition ceilings", () => {
    const many = Array.from({ length: MAX_TASKS + 1 }, (_, i) => ({ ...TASKS[0], id: `t${i}` }));

    expect(() =>
      validateEvaluationInput({ tasks: many, selectedConfigs: ["skill"], runsPerConfig: 1 }),
    ).toThrow(new RegExp(`at most ${MAX_TASKS} tasks`));

    for (const runs of [0, MAX_RUNS_PER_TASK + 1, 1.5]) {
      expect(() =>
        validateEvaluationInput({
          tasks: TASKS,
          selectedConfigs: ["skill"],
          runsPerConfig: runs,
        }),
      ).toThrow(/between 1 and/);
    }
  });

  it("rejects an unknown configuration id", () => {
    expect(() =>
      validateEvaluationInput({
        tasks: TASKS,
        // @ts-expect-error deliberately invalid, as an API caller could send this
        selectedConfigs: ["turbo-mode"],
        runsPerConfig: 1,
      }),
    ).toThrow(/Unknown configuration/);
  });

  it("caps the total hosted-demo workload", () => {
    const tasks = Array.from(
      { length: MAX_AGENT_RUNS_PER_EVALUATION + 1 },
      (_, index) => ({ ...TASKS[0], id: `work-${index}` }),
    );

    expect(() =>
      validateEvaluationInput({
        tasks,
        selectedConfigs: ["skill"],
        runsPerConfig: 1,
      }),
    ).toThrow(/agent runs per evaluation/);
  });
});

describe("createEvaluationRecord", () => {
  it("sizes total work as tasks × configurations × repetitions", () => {
    const record = createEvaluationRecord({
      id: "x",
      ownerId: "test-owner",
      skill: makeSkill(),
      tasks: TASKS,
      request: request({ selectedConfigs: ["baseline", "skill", "explicit"], runsPerConfig: 2 }),
      question: "q",
    });

    expect(record.progress.total).toBe(12);
    expect(record.status).toBe("queued");
    expect(record.metrics).toBeNull();
    expect(record.runs).toEqual([]);
  });
});

describe("executeEvaluation", () => {
  it("runs every task under every configuration exactly once per repetition", async () => {
    const record = await runEvaluation(demoProvider());

    expect(record.status).toBe("completed");
    expect(record.runs).toHaveLength(4);
    expect(record.runs.map((run) => run.id).sort()).toEqual([
      "bundle-regression--baseline--1",
      "bundle-regression--skill--1",
      "rename-component--baseline--1",
      "rename-component--skill--1",
    ]);
  });

  it("makes independent model calls for repeated runs rather than reusing a response", async () => {
    const provider = demoProvider();
    const record = await runEvaluation(
      provider,
      { selectedConfigs: ["baseline"], runsPerConfig: 3 },
      [TASKS[0]],
    );

    expect(record.runs).toHaveLength(3);
    expect(record.runs.map((run) => run.attempt).sort()).toEqual([1, 2, 3]);
    // One agent call per repetition, not one response reused three times.
    const agentCalls = provider.requests.filter(
      (req) => !isJudgeCall(req) && !isFindingsCall(req),
    );
    expect(agentCalls).toHaveLength(3);
    expect(provider.requests.filter(isJudgeCall)).toHaveLength(3);
  });

  it("records a real invocation on the relevant task and no invocation on the irrelevant one", async () => {
    const record = await runEvaluation(demoProvider());

    const invoked = record.runs.find((run) => run.id === "bundle-regression--skill--1")!;
    const notInvoked = record.runs.find((run) => run.id === "rename-component--skill--1")!;

    expect(invoked.skillInvoked).toBe(true);
    expect(invoked.skillInvocationReason).toBe("This is a bundle regression.");
    expect(invoked.classification).toBe("invoked_pass");

    expect(notInvoked.skillInvoked).toBe(false);
    expect(notInvoked.classification).toBe("skill_not_needed");
  });

  it("classifies a missed trigger that failed", async () => {
    const record = await runEvaluation(demoProvider({ invokeOnRelevant: false }));

    const missed = record.runs.find((run) => run.id === "bundle-regression--skill--1")!;

    expect(missed.skillInvoked).toBe(false);
    expect(missed.success).toBe(false);
    expect(missed.classification).toBe("missed_trigger_failure");
    expect(record.metrics!.missedTriggerFailureCount).toBe(1);
    expect(record.metrics!.trigger!.triggerRate).toBe(0);
  });

  it("scores deterministic tasks without a judge call", async () => {
    const provider = demoProvider();
    await runEvaluation(provider, { selectedConfigs: ["baseline"] });

    const judgeCalls = provider.requests.filter(isJudgeCall);
    // Only the llm_judge task is judged; the contains task is scored locally.
    expect(judgeCalls).toHaveLength(1);

    const record = (await loadEvaluation("test-eval"))!;
    const deterministic = record.runs.find((run) => run.taskId === "rename-component")!;
    expect(deterministic.scorer).toBe("contains");
    expect(deterministic.success).toBe(true);
    expect(deterministic.judgeReason).toMatch(/RevenueSummary/);
  });

  it("computes metrics and trigger analysis from the runs it actually produced", async () => {
    const record = await runEvaluation(demoProvider());
    const metrics = record.metrics!;

    expect(metrics.totalRuns).toBe(4);
    expect(metrics.erroredRuns).toBe(0);
    expect(metrics.configs.map((config) => config.id)).toEqual(["baseline", "skill"]);
    expect(metrics.trigger).toEqual({
      expected: 1,
      invoked: 1,
      missed: 0,
      irrelevant: 1,
      falsePositives: 0,
      triggerRate: 100,
      falsePositiveRate: 0,
    });
    expect(metrics.effectiveness).toBe(50);
  });

  it("generates findings from the completed run data", async () => {
    const record = await runEvaluation(demoProvider());

    expect(record.findingsError).toBeNull();
    expect(record.findings).toHaveLength(1);
    expect(record.findings[0].title).toBe("Trigger wording");
  });

  it("advances progress to done, matching the work actually completed", async () => {
    const record = await runEvaluation(demoProvider());

    expect(record.progress.phase).toBe("done");
    expect(record.progress.completed).toBe(4);
    expect(record.progress.total).toBe(4);
    expect(record.completedAt).not.toBeNull();
  });

  it("persists a result that survives a reload and populates the results UI", async () => {
    await runEvaluation(demoProvider());

    const reloaded = (await loadEvaluation("test-eval"))!;
    const detail = toDetail(reloaded);

    expect(detail.status).toBe("completed");
    expect(detail.configs).toHaveLength(2);
    expect(detail.verdict).toMatch(/improves task success/);
    expect(detail.taskCount).toBe(2);
    expect(detail.completionSummary).toMatch(/4 runs across 2 configurations/);
  });

  it("runs all four configurations when selected", async () => {
    const record = await runEvaluation(demoProvider(), {
      selectedConfigs: ["baseline", "skill", "explicit", "agents-md"],
    });

    expect(record.runs).toHaveLength(8);
    const explicit = record.metrics!.configs.find((config) => config.id === "explicit")!;
    expect(explicit.triggerRate).toBe(100);
    expect(explicit.triggerRateBasis).toBe("by-construction");
  });

  it("keeps the evaluation alive when one run fails, and marks that run errored", async () => {
    let agentCalls = 0;
    const provider = routedProvider((req) => {
      if (isFindingsCall(req)) {
        return { text: '{"findings":[{"severity":"low","title":"T","explanation":"E"}]}' };
      }
      if (isJudgeCall(req)) {
        return { text: '{"success":true,"score":1,"reason":"Fine."}' };
      }
      agentCalls += 1;
      if (agentCalls === 1) throw new Error("503 upstream unavailable");
      return { text: "An answer mentioning RevenueSummary." };
    });

    const record = await runEvaluation(provider);

    expect(record.status).toBe("completed");
    const errored = record.runs.filter((run) => run.status === "error");
    expect(errored).toHaveLength(1);
    expect(errored[0].error).toMatch(/503 upstream unavailable/);
    expect(errored[0].success).toBe(false);
    // The remaining runs were still scored.
    expect(record.runs.filter((run) => run.status === "completed")).toHaveLength(3);
    expect(record.metrics!.erroredRuns).toBe(1);
  });

  it("marks a run errored, not failed, when the judge cannot score it", async () => {
    const provider = routedProvider((req) => {
      if (isFindingsCall(req)) {
        return { text: '{"findings":[{"severity":"low","title":"T","explanation":"E"}]}' };
      }
      if (isJudgeCall(req)) return { text: "I think it is fine." };
      return { text: "Rename to RevenueSummary." };
    });

    const record = await runEvaluation(provider, { selectedConfigs: ["baseline"] });

    const judged = record.runs.find((run) => run.taskId === "bundle-regression")!;
    expect(judged.status).toBe("error");
    expect(judged.judgeError).toBe("Malformed judge output.");

    // The unscorable run is excluded from the rate rather than counted as a
    // failure, so the one run that could be scored sets the success rate.
    expect(record.metrics!.configs[0].successRate).toBe(100);
    expect(record.metrics!.erroredRuns).toBe(1);
  });

  it("fails the evaluation with an honest error when the provider is unusable", async () => {
    const provider = routedProvider(() => {
      throw new Error("OPENAI_API_KEY is not set.");
    });

    const record = await runEvaluation(provider);

    // Every run errors, so nothing can be scored and no findings are generated.
    expect(record.runs.every((run) => run.status === "error")).toBe(true);
    expect(record.findings).toEqual([]);
    expect(record.findingsError).toMatch(/No run produced a scored response/);
    expect(record.metrics!.configs.every((config) => config.successRate === null)).toBe(true);
  });

  it("records the model the provider actually used", async () => {
    const record = await runEvaluation(demoProvider(), { model: "" });

    expect(record.request.model).toBe("routed-model");
  });

  it("ignores a second execution of the same evaluation", async () => {
    const provider = demoProvider();
    await runEvaluation(provider);
    const callsAfterFirst = provider.requests.length;

    await executeEvaluation("test-eval", { provider });

    expect(provider.requests.length).toBe(callsAfterFirst);
  });

  it("throws for an evaluation id that was never stored", async () => {
    await expect(executeEvaluation("missing-id")).rejects.toThrow(/not found/);
  });

  it("does not recreate a deleted evaluation after it is abandoned", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider: ModelProvider = {
      model: "held-model",
      async generate() {
        await held;
        return {
          text: "RevenueSummary rename is straightforward.",
          toolCalls: [],
          inputTokens: 100,
          outputTokens: 20,
          latencyMs: 5,
          model: "held-model",
          finishReason: "stop",
        };
      },
    };

    const record = createEvaluationRecord({
      id: "abandoned-eval",
      ownerId: "test-owner",
      skill: makeSkill(),
      tasks: [TASKS[1]],
      request: request({ selectedConfigs: ["baseline"], runsPerConfig: 1 }),
      question: "Does analyze-bundle help?",
    });
    await saveEvaluation(record);

    const running = executeEvaluation(record.id, { provider });
    try {
      let started = false;
      for (let i = 0; i < 50; i += 1) {
        const loaded = await loadEvaluation(record.id);
        if (loaded?.status === "running") {
          started = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(started).toBe(true);

      abandonEvaluation(record.id);
      expect(await deleteEvaluation(record.id)).toBe(true);
    } finally {
      release();
    }

    await running;
    expect(await loadEvaluation(record.id)).toBeNull();
  });
});
