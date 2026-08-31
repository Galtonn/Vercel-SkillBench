import { describe, expect, it } from "vitest";

import {
  EMPTY_CLASSIFICATION_COUNTS,
  classifyRun,
  countClassifications,
} from "@/lib/eval/classify";
import { CONFIG_IDS } from "@/lib/eval/types";

describe("classifyRun", () => {
  const cases = [
    ["invoked_pass", { skillRelevant: true, skillInvoked: true, success: true }],
    ["invoked_fail", { skillRelevant: true, skillInvoked: true, success: false }],
    ["missed_trigger_success", { skillRelevant: true, skillInvoked: false, success: true }],
    ["missed_trigger_failure", { skillRelevant: true, skillInvoked: false, success: false }],
    ["false_positive_pass", { skillRelevant: false, skillInvoked: true, success: true }],
    ["false_positive_fail", { skillRelevant: false, skillInvoked: true, success: false }],
    ["skill_not_needed", { skillRelevant: false, skillInvoked: false, success: true }],
  ] as const;

  for (const [expected, input] of cases) {
    it(`classifies ${expected}`, () => {
      expect(classifyRun({ configId: "skill", ...input })).toBe(expected);
    });
  }

  it("classifies skill_not_needed regardless of outcome", () => {
    expect(
      classifyRun({
        configId: "skill",
        skillRelevant: false,
        skillInvoked: false,
        success: false,
      }),
    ).toBe("skill_not_needed");
  });

  it("returns null for every configuration except Skill", () => {
    for (const configId of CONFIG_IDS.filter((id) => id !== "skill")) {
      expect(
        classifyRun({
          configId,
          skillRelevant: true,
          skillInvoked: true,
          success: true,
        }),
      ).toBeNull();
    }
  });
});

describe("countClassifications", () => {
  it("counts each category and ignores nulls", () => {
    const counts = countClassifications([
      "invoked_pass",
      "invoked_pass",
      "missed_trigger_failure",
      null,
      null,
    ]);

    expect(counts.invoked_pass).toBe(2);
    expect(counts.missed_trigger_failure).toBe(1);
    expect(counts.skill_not_needed).toBe(0);
  });

  it("returns a zeroed record for no input", () => {
    expect(countClassifications([])).toEqual(EMPTY_CLASSIFICATION_COUNTS);
  });

  it("does not mutate the shared empty record", () => {
    countClassifications(["invoked_pass"]);
    expect(EMPTY_CLASSIFICATION_COUNTS.invoked_pass).toBe(0);
  });
});
