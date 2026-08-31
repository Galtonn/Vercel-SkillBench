import { describe, expect, it } from "vitest";

import {
  generatedTasksToDrafts,
  parseGeneratedTasks,
} from "@/lib/eval/generate-benchmark";

describe("parseGeneratedTasks", () => {
  const valid = {
    tasks: [
      {
        name: "Settings form",
        prompt: "Review the settings form for accessibility issues.",
        skillRelevant: true,
        judgeCriteria: ["identifies missing label on email input"],
        referenceAnswer: "The email input has no label.",
      },
      {
        name: "Rename a helper",
        prompt: "Rename formatUserName to formatPersonName.",
        skillRelevant: false,
        judgeCriteria: ["Names formatPersonName and lib/format-name.ts"],
        referenceAnswer: "",
      },
    ],
  };

  it("parses a well-formed generator payload", () => {
    const tasks = parseGeneratedTasks(JSON.stringify(valid));

    expect(tasks).toHaveLength(2);
    expect(tasks![0].skillRelevant).toBe(true);
    expect(tasks![1].skillRelevant).toBe(false);
    expect(tasks![0].judgeCriteria).toEqual(["identifies missing label on email input"]);
  });

  it("parses fenced JSON", () => {
    const tasks = parseGeneratedTasks("```json\n" + JSON.stringify(valid) + "\n```");
    expect(tasks).toHaveLength(2);
  });

  it("drops a task with no criteria rather than filling generic ones", () => {
    const tasks = parseGeneratedTasks(
      JSON.stringify({
        tasks: [
          {
            name: "Bad",
            prompt: "Do something.",
            skillRelevant: true,
            judgeCriteria: [],
          },
          valid.tasks[0],
        ],
      }),
    );

    expect(tasks).toHaveLength(1);
    expect(tasks![0].name).toBe("Settings form");
  });

  it("drops a task whose skillRelevant is not a boolean", () => {
    const tasks = parseGeneratedTasks(
      JSON.stringify({
        tasks: [{ ...valid.tasks[0], skillRelevant: "yes" }, valid.tasks[1]],
      }),
    );

    expect(tasks).toHaveLength(1);
    expect(tasks![0].skillRelevant).toBe(false);
  });

  it("returns null for prose", () => {
    expect(parseGeneratedTasks("Here are some tasks I thought of.")).toBeNull();
  });

  it("converts generated tasks into editor drafts without flipping relevance", () => {
    const drafts = generatedTasksToDrafts(parseGeneratedTasks(JSON.stringify(valid))!);

    expect(drafts.map((draft) => draft.skillRelevant)).toEqual([true, false]);
    expect(drafts[0].criteria).toEqual(["identifies missing label on email input"]);
    expect(drafts[0].referenceAnswer).toBe("The email input has no label.");
  });
});
