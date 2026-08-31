import type { ConfigId, RunClassification } from "./types";

/**
 * Classifies a run in the Skill configuration by crossing the benchmark's ground
 * truth (was the skill relevant?) with what the model actually did (did it call
 * use_skill?) and the scored outcome.
 *
 * Only the Skill configuration has a meaningful classification: it is the only
 * condition where the model chooses whether to load the instructions. The other
 * conditions either never offer the skill (baseline) or always deliver it
 * (explicit, agents-md), so there is no discovery decision to classify.
 */
export function classifyRun(input: {
  configId: ConfigId;
  skillRelevant: boolean;
  skillInvoked: boolean;
  success: boolean;
}): RunClassification | null {
  if (input.configId !== "skill") return null;

  const { skillRelevant, skillInvoked, success } = input;

  if (skillRelevant && skillInvoked) {
    return success ? "invoked_pass" : "invoked_fail";
  }
  if (skillRelevant && !skillInvoked) {
    return success ? "missed_trigger_success" : "missed_trigger_failure";
  }
  if (!skillRelevant && skillInvoked) {
    return success ? "false_positive_pass" : "false_positive_fail";
  }
  return "skill_not_needed";
}

export const EMPTY_CLASSIFICATION_COUNTS: Record<RunClassification, number> = {
  invoked_pass: 0,
  invoked_fail: 0,
  missed_trigger_success: 0,
  missed_trigger_failure: 0,
  false_positive_pass: 0,
  false_positive_fail: 0,
  skill_not_needed: 0,
};

export function countClassifications(
  classifications: (RunClassification | null)[],
): Record<RunClassification, number> {
  const counts = { ...EMPTY_CLASSIFICATION_COUNTS };
  for (const classification of classifications) {
    if (classification) counts[classification] += 1;
  }
  return counts;
}
