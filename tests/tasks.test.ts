import { describe, expect, it } from "vitest";

import {
  ANALYZE_BUNDLE_FULL_BENCHMARK_ID,
  ANALYZE_BUNDLE_LIVE_BENCHMARK_ID,
  ANALYZE_BUNDLE_LIVE_TASKS,
  ANALYZE_BUNDLE_STANDARD_BENCHMARK_ID,
  ANALYZE_BUNDLE_STANDARD_TASKS,
  ANALYZE_BUNDLE_TASKS,
  countJudged,
  countRelevant,
} from "@/lib/eval/benchmarks/analyze-bundle";
import {
  BENCHMARKS,
  BENCHMARK_FAMILIES,
  BENCHMARK_OPTIONS,
  DEFAULT_BENCHMARK_ID,
  WORKSPACE_DIRECTORIES,
  getBenchmark,
} from "@/lib/eval/benchmarks";
import {
  WEB_DESIGN_BENCHMARK_ID,
  WEB_DESIGN_TASKS,
} from "@/lib/eval/benchmarks/web-design-guidelines";
import { MAX_TASKS, estimateCost } from "@/lib/eval/config";
import { countJudgedTasks, parseTasksFromText } from "@/lib/eval/tasks";

describe("parseTasksFromText", () => {
  it("makes one task per blank-line-separated paragraph", () => {
    const tasks = parseTasksFromText(
      "First task, on one line.\n\nSecond task,\nspanning two lines.\n\n\nThird task.",
    );

    expect(tasks).toHaveLength(3);
    expect(tasks[1].prompt).toBe("Second task,\nspanning two lines.");
    expect(tasks.map((task) => task.id)).toEqual(["task-1", "task-2", "task-3"]);
  });

  it("derives a short name from the first line", () => {
    const tasks = parseTasksFromText("Find the largest client dependency.");

    expect(tasks[0].name).toBe("Find the largest client dependency");
  });

  it("truncates a long name with an ellipsis", () => {
    const prompt = `Investigate ${"the dashboard route bundle regression ".repeat(4)}`;
    const [task] = parseTasksFromText(prompt);

    expect(task.name.length).toBeLessThanOrEqual(53);
    expect(task.name.endsWith("…")).toBe(true);
  });

  it("ignores empty input and stray whitespace", () => {
    expect(parseTasksFromText("")).toEqual([]);
    expect(parseTasksFromText("   \n\n  \n ")).toEqual([]);
  });

  it("enforces the task ceiling", () => {
    const tasks = parseTasksFromText(
      Array.from({ length: MAX_TASKS + 8 }, (_, i) => `Task ${i}`).join("\n\n"),
    );

    expect(tasks).toHaveLength(MAX_TASKS);
  });

  it("marks pasted tasks relevant so a missed invocation is counted, not ignored", () => {
    const [task] = parseTasksFromText("Reduce the client bundle.");

    expect(task.skillRelevant).toBe(true);
    expect(task.expected.type).toBe("llm_judge");
  });

  it("does not let a structured false be overwritten by the paste fallback", () => {
    // The paste path is conservative; the structured path is the one that can
    // label a task as not skill-relevant.
    const [task] = parseTasksFromText("Rename a component.");
    expect(task.skillRelevant).toBe(true);
  });
});

describe("countJudgedTasks", () => {
  it("counts only tasks that need a judge call", () => {
    const judged = parseTasksFromText("One.\n\nTwo.");
    expect(countJudgedTasks(judged)).toBe(2);
    expect(countJudgedTasks(ANALYZE_BUNDLE_TASKS)).toBeLessThanOrEqual(
      ANALYZE_BUNDLE_TASKS.length,
    );
  });
});

describe("analyze-bundle benchmark", () => {
  it("has 8-10 tasks, as the demo preset promises", () => {
    expect(ANALYZE_BUNDLE_TASKS.length).toBeGreaterThanOrEqual(8);
    expect(ANALYZE_BUNDLE_TASKS.length).toBeLessThanOrEqual(10);
  });

  it("uses unique ids", () => {
    const ids = new Set(ANALYZE_BUNDLE_TASKS.map((task) => task.id));
    expect(ids.size).toBe(ANALYZE_BUNDLE_TASKS.length);
  });

  it("labels both relevant and non-relevant tasks, so false positives are measurable", () => {
    const relevant = ANALYZE_BUNDLE_TASKS.filter((task) => task.skillRelevant);
    const irrelevant = ANALYZE_BUNDLE_TASKS.filter((task) => !task.skillRelevant);

    expect(relevant.length).toBeGreaterThanOrEqual(5);
    expect(irrelevant.length).toBeGreaterThanOrEqual(2);
  });

  it("gives every task a non-empty prompt and scoring criteria", () => {
    for (const task of ANALYZE_BUNDLE_TASKS) {
      expect(task.prompt.trim().length).toBeGreaterThan(20);
      expect(task.name.trim()).not.toBe("");
      if (task.expected.type === "llm_judge") {
        expect(task.expected.criteria.length).toBeGreaterThan(0);
        expect(task.expected.criteria.every((c) => c.trim().length > 0)).toBe(true);
      } else {
        expect(task.expected.values.length).toBeGreaterThan(0);
      }
    }
  });

  it("requires each deterministic task to surface something the prompt did not give away", () => {
    // Some expected terms are restatements of the instruction (rename X to Y),
    // so the invariant is that at least one term has to be discovered.
    for (const task of ANALYZE_BUNDLE_TASKS) {
      if (task.expected.type !== "contains") continue;
      const prompt = task.prompt.toLowerCase();
      const discovered = task.expected.values.filter(
        (value) => !prompt.includes(value.toLowerCase()),
      );
      expect(discovered.length, `task "${task.id}" gives away every expected term`).toBeGreaterThan(0);
    }
  });

  it("is registered with a workspace directory that exists in the fixtures map", () => {
    for (const benchmark of BENCHMARK_OPTIONS) {
      expect(WORKSPACE_DIRECTORIES[benchmark.workspaceId]).toBeDefined();
    }
  });
});

describe("benchmark presets", () => {
  const presets = [
    { name: "live", tasks: ANALYZE_BUNDLE_LIVE_TASKS, size: 3 },
    { name: "standard", tasks: ANALYZE_BUNDLE_STANDARD_TASKS, size: 5 },
  ];

  for (const preset of presets) {
    describe(`${preset.name} preset`, () => {
      it(`has exactly ${preset.size} tasks`, () => {
        expect(preset.tasks).toHaveLength(preset.size);
      });

      it("draws every task from the full benchmark rather than redefining them", () => {
        for (const task of preset.tasks) {
          // Identity, not just equality: a preset must not drift from the full set.
          expect(ANALYZE_BUNDLE_TASKS).toContain(task);
        }
      });

      it("keeps exactly one deliberately non-relevant task so false positives stay measurable", () => {
        expect(preset.tasks.filter((t) => !t.skillRelevant)).toHaveLength(1);
        expect(countRelevant(preset.tasks)).toBe(preset.size - 1);
      });

      it("includes the discovery test, whose prompt uses no bundle vocabulary", () => {
        const subtle = preset.tasks.find(
          (task) => task.id === "settings-slower-after-package",
        );

        expect(subtle).toBeDefined();
        expect(subtle!.skillRelevant).toBe(true);
        for (const term of ["bundle", "javascript", "kb", "chunk"]) {
          expect(subtle!.prompt.toLowerCase()).not.toContain(term);
        }
      });

      it("includes the sharpest discriminator, which reputation-ranking gets wrong", () => {
        expect(
          preset.tasks.some((task) => task.id === "largest-client-dependency"),
        ).toBe(true);
      });

      it("scores exactly one task deterministically, so it costs one fewer judge call", () => {
        expect(countJudged(preset.tasks)).toBe(preset.size - 1);
      });
    });
  }

  it("nests live inside standard inside full, so results stay comparable", () => {
    for (const task of ANALYZE_BUNDLE_LIVE_TASKS) {
      expect(ANALYZE_BUNDLE_STANDARD_TASKS).toContain(task);
    }
  });

  it("does not mutate or shrink the full benchmark", () => {
    expect(ANALYZE_BUNDLE_TASKS).toHaveLength(10);
    expect(countRelevant(ANALYZE_BUNDLE_TASKS)).toBe(7);
  });
});

describe("benchmark registry", () => {
  it("defaults to the three-task live demo", () => {
    expect(DEFAULT_BENCHMARK_ID).toBe(ANALYZE_BUNDLE_LIVE_BENCHMARK_ID);
    expect(getBenchmark(DEFAULT_BENCHMARK_ID)!.tasks).toHaveLength(3);
  });

  it("offers three analyze-bundle sizes, from live demo to full benchmark", () => {
    const analyze = BENCHMARK_FAMILIES.find((family) => family.id === "analyze-bundle")!;
    expect(
      analyze.presets.map((option) => [option.shortLabel, option.tasks.length]),
    ).toEqual([
      ["Live demo", 3],
      ["Standard", 5],
      ["Full benchmark", 10],
    ]);
  });

  it("keeps the ten-task set available under its own id", () => {
    const full = getBenchmark(ANALYZE_BUNDLE_FULL_BENCHMARK_ID)!;

    expect(full.tasks).toHaveLength(10);
    expect(full.tasks).toBe(ANALYZE_BUNDLE_TASKS);
  });

  it("keeps the five-task set available under its own id", () => {
    const standard = getBenchmark(ANALYZE_BUNDLE_STANDARD_BENCHMARK_ID)!;

    expect(standard.tasks).toBe(ANALYZE_BUNDLE_STANDARD_TASKS);
  });

  it("points every preset in a family at the same skill, fixture, and question", () => {
    for (const family of BENCHMARK_FAMILIES) {
      const [first] = family.presets;
      for (const option of family.presets) {
        expect(option.skillReference).toBe(first.skillReference);
        expect(option.workspaceId).toBe(first.workspaceId);
        expect(option.question).toBe(first.question);
      }
    }
  });

  it("offers exactly the registered benchmarks in the picker", () => {
    expect(BENCHMARK_OPTIONS.map((option) => option.id)).toEqual(
      Object.keys(BENCHMARKS),
    );
  });

  it("returns null for an unknown or missing id", () => {
    expect(getBenchmark("nope")).toBeNull();
    expect(getBenchmark(null)).toBeNull();
  });
});

describe("web-design-guidelines benchmark", () => {
  it("is registered against ui-bench and a real skill reference", () => {
    const benchmark = getBenchmark(WEB_DESIGN_BENCHMARK_ID)!;

    expect(benchmark.workspaceId).toBe("ui-bench");
    expect(WORKSPACE_DIRECTORIES[benchmark.workspaceId]).toBe("ui-bench");
    expect(benchmark.skillReference).toBe(
      "vercel-labs/agent-skills/web-design-guidelines",
    );
    expect(benchmark.tasks).toBe(WEB_DESIGN_TASKS);
  });

  it("has 4-6 skill-relevant tasks and 1-2 non-relevant tasks, each with ground truth", () => {
    const relevant = WEB_DESIGN_TASKS.filter((task) => task.skillRelevant);
    const irrelevant = WEB_DESIGN_TASKS.filter((task) => !task.skillRelevant);

    expect(relevant.length).toBeGreaterThanOrEqual(4);
    expect(relevant.length).toBeLessThanOrEqual(6);
    expect(irrelevant.length).toBeGreaterThanOrEqual(1);
    expect(irrelevant.length).toBeLessThanOrEqual(2);

    for (const task of relevant) {
      expect(task.expected.type).toBe("llm_judge");
      if (task.expected.type === "llm_judge") {
        expect(task.expected.criteria.length).toBeGreaterThan(0);
        expect((task.expected.referenceAnswer ?? "").length).toBeGreaterThan(20);
      }
    }
  });
});

describe("estimateCost", () => {
  /** Every preset at the default shape: all four configurations, one run each. */
  function previewPreset(benchmarkId: string) {
    const tasks = getBenchmark(benchmarkId)!.tasks;
    return estimateCost({
      tasks: tasks.length,
      configurations: 4,
      runsPerConfig: 1,
      judgedTasks: countJudged(tasks),
    });
  }

  it("keeps the default live demo cheap enough to run in front of someone", () => {
    const preview = previewPreset(DEFAULT_BENCHMARK_ID);

    expect(preview.agentRuns).toBe(12);
    expect(preview.judgeCalls).toBe(8);
    expect(preview.analysisCalls).toBe(1);
    expect(preview.estimatedModelCalls).toBe(45);
  });

  it("matches the documented standard shape", () => {
    const preview = previewPreset(ANALYZE_BUNDLE_STANDARD_BENCHMARK_ID);

    expect(preview.agentRuns).toBe(20);
    expect(preview.judgeCalls).toBe(16);
    expect(preview.estimatedModelCalls).toBe(77);
  });

  it("matches the documented full benchmark shape", () => {
    const preview = previewPreset(ANALYZE_BUNDLE_FULL_BENCHMARK_ID);

    expect(preview.agentRuns).toBe(40);
    expect(preview.judgeCalls).toBe(32);
    expect(preview.estimatedModelCalls).toBe(153);
  });

  it("grows monotonically with analyze-bundle preset size", () => {
    const analyze = BENCHMARK_FAMILIES.find((family) => family.id === "analyze-bundle")!;
    const sizes = analyze.presets.map(
      (option) => previewPreset(option.id).estimatedModelCalls,
    );

    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it("scales agent runs with repetitions", () => {
    expect(estimateCost({ tasks: 8, configurations: 4, runsPerConfig: 3 }).agentRuns).toBe(96);
  });

  it("counts judge calls only for judged tasks", () => {
    const preview = estimateCost({
      tasks: 10,
      configurations: 2,
      runsPerConfig: 1,
      judgedTasks: 5,
    });

    expect(preview.agentRuns).toBe(20);
    expect(preview.judgeCalls).toBe(10);
  });

  it("predicts no work, and no analysis call, for an empty configuration", () => {
    const preview = estimateCost({ tasks: 0, configurations: 4, runsPerConfig: 1 });

    expect(preview.agentRuns).toBe(0);
    expect(preview.judgeCalls).toBe(0);
    expect(preview.analysisCalls).toBe(0);
    expect(preview.estimatedModelCalls).toBe(0);
  });
});
