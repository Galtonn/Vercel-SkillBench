import { describe, expect, it } from "vitest";

import {
  createTaskDraft,
  draftsFromTasks,
  draftsFromText,
  normalizeDrafts,
  parseTaskDrafts,
} from "@/lib/eval/custom-tasks";
import { makeTask } from "./helpers/factories";

describe("normalizeDrafts", () => {
  it("preserves skillRelevant: false instead of assuming every task needs the skill", () => {
    const tasks = normalizeDrafts([
      createTaskDraft({
        prompt: "Rename formatUserName to formatPersonName.",
        skillRelevant: false,
        scoring: "contains",
        values: ["formatPersonName"],
      }),
    ]);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].skillRelevant).toBe(false);
    expect(tasks[0].expected).toEqual({
      type: "contains",
      values: ["formatPersonName"],
      mode: "all",
    });
  });

  it("keeps authored judge criteria and a reference answer", () => {
    const tasks = normalizeDrafts([
      createTaskDraft({
        name: "Settings form",
        prompt: "Review the settings form for accessibility issues.",
        skillRelevant: true,
        scoring: "llm_judge",
        criteria: [
          "identifies missing label on email input",
          "identifies icon-only submit button without accessible name",
        ],
        referenceAnswer:
          "The email input lacks a label and the submit button has no accessible name.",
      }),
    ]);

    expect(tasks[0].skillRelevant).toBe(true);
    expect(tasks[0].expected).toEqual({
      type: "llm_judge",
      criteria: [
        "identifies missing label on email input",
        "identifies icon-only submit button without accessible name",
      ],
      referenceAnswer:
        "The email input lacks a label and the submit button has no accessible name.",
    });
  });

  it("drops drafts with no prompt", () => {
    expect(
      normalizeDrafts([
        createTaskDraft({ prompt: "   ", skillRelevant: false }),
        createTaskDraft({ prompt: "Real task." }),
      ]),
    ).toHaveLength(1);
  });
});

describe("parseTaskDrafts", () => {
  it("does not coerce an explicit false into true", () => {
    const drafts = parseTaskDrafts([
      { prompt: "Rename a function.", skillRelevant: false, scoring: "contains", values: ["x"] },
    ]);

    expect(drafts[0].skillRelevant).toBe(false);
  });

  it("ignores non-objects rather than inventing tasks", () => {
    expect(parseTaskDrafts(["nope", null, { prompt: "" }, { prompt: "Keep me." }])).toHaveLength(1);
  });
});

describe("draftsFromText", () => {
  it("seeds pasted prompts as relevant judged tasks so they are visible to edit", () => {
    const drafts = draftsFromText("First task.\n\nSecond task.");

    expect(drafts).toHaveLength(2);
    expect(drafts.every((draft) => draft.skillRelevant)).toBe(true);
    expect(drafts.every((draft) => draft.criteria.length === 0)).toBe(true);
  });
});

describe("draftsFromTasks", () => {
  it("round-trips a non-relevant contains task", () => {
    const task = makeTask({
      skillRelevant: false,
      expected: { type: "contains", values: ["formatPersonName"], mode: "any" },
    });

    const [draft] = draftsFromTasks([task]);

    expect(draft.skillRelevant).toBe(false);
    expect(draft.scoring).toBe("contains");
    expect(draft.values).toEqual(["formatPersonName"]);
    expect(draft.containsMode).toBe("any");
  });

  it("exposes a judged task's name, prompt, criteria, and reference as editor fields", () => {
    const task = makeTask({
      name: "Settings form",
      prompt: "Review the settings form for accessibility issues.",
      expected: {
        type: "llm_judge",
        criteria: ["identifies missing label on email input"],
        referenceAnswer: "The email input has no label.",
      },
    });

    const [draft] = draftsFromTasks([task]);

    expect(draft.name).toBe("Settings form");
    expect(draft.prompt).toBe("Review the settings form for accessibility issues.");
    expect(draft.scoring).toBe("llm_judge");
    expect(draft.criteria).toEqual(["identifies missing label on email input"]);
    expect(draft.referenceAnswer).toBe("The email input has no label.");
  });
});
