import type { ModelMessage, ModelToolDefinition } from "./provider";
import type { ConfigId, EvalTask, ResolvedSkill } from "./types";

/**
 * Prompt construction for the four skill-delivery conditions.
 *
 * The only thing that varies between conditions is how (and whether) the skill
 * reaches the model. The task text, the tools, and the base instructions are
 * identical, so a success difference is attributable to delivery.
 */

const BASE_SYSTEM_PROMPT = `You are a senior software engineer investigating a repository.

You are working in a read-only checkout. Available tools may include:
- list_files: list files and directories, recursively.
- read_file: read a file as text.
- search_files: search files for literal text (safe grep equivalent).
- query_json_lines: filter, group, sort, and project NDJSON (safe jq equivalent).
- fetch_url: fetch public text from the allowlisted raw GitHub host.

You cannot run shell commands and you cannot edit files. When a task asks for a
change, describe the change precisely and show the edited code.

When skill instructions mention read-only grep, jq, head, tail, or WebFetch,
translate them to the equivalent tools above. Do not pretend a command ran.

Ground your answer in what you actually read from the repository. Cite the file
paths and the specific numbers or code you relied on. If you are uncertain, say
what you are uncertain about rather than guessing.

Answer in concise prose or markdown. Do not pad the answer.`;

export const USE_SKILL_TOOL_NAME = "use_skill";

export function buildUseSkillTool(skill: ResolvedSkill): ModelToolDefinition {
  return {
    name: USE_SKILL_TOOL_NAME,
    description: `Load the full instructions for the "${skill.name}" skill. Call this before other repository tools whenever the current task clearly matches the skill's name or description, even if you think you could solve it unaided. Do not call it for unrelated tasks. You may call it at most once.`,
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "One sentence explaining why this skill is relevant to the current task.",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  };
}

/**
 * The Skill condition. The model sees only the skill's name and description —
 * the same metadata a real agent sees when scanning available skills — plus a
 * tool it can call to load the body. Whether it calls that tool is the
 * measurement.
 */
function skillAvailabilityBlock(skill: ResolvedSkill) {
  return `## Skill selection rule

This repository provides the following skill:

- name: ${skill.name}
  description: ${skill.description}

Before using repository tools or answering, compare the task with the skill's
name and description. If the task clearly falls within that scope, you MUST call
the \`${USE_SKILL_TOOL_NAME}\` tool first to load its instructions. Applicability,
not whether you think you can solve the task unaided, determines whether to load
it. Do not call it when the task is unrelated to the skill.`;
}

/**
 * The Explicit Trigger condition. Instructions are supplied up front and the
 * prompt states they apply to this task, so discovery is removed from the
 * equation and only the quality of the instructions is under test.
 */
function explicitSkillBlock(skill: ResolvedSkill) {
  return `## Skill: ${skill.name}

The following skill is relevant to this specific task. Use it.

${skill.description}

---

${skill.instructions}`;
}

/**
 * The AGENTS.md condition. The same instructions are delivered as persistent
 * repository guidance rather than as a task-scoped directive: present for every
 * task, with no claim of relevance to the current one.
 *
 * This is a controlled delivery-strategy comparison, not a reproduction of any
 * particular coding agent's AGENTS.md handling.
 */
function agentsMdBlock(skill: ResolvedSkill) {
  return `## AGENTS.md

These are persistent repository instructions. They are available throughout your
work in this repository, for every task, whether or not they apply to the task in
front of you. Follow them where they are relevant.

${skill.instructions}`;
}

export function buildSystemPrompt(
  configId: ConfigId,
  skill: ResolvedSkill,
): string {
  switch (configId) {
    case "baseline":
      return BASE_SYSTEM_PROMPT;
    case "skill":
      return `${BASE_SYSTEM_PROMPT}\n\n${skillAvailabilityBlock(skill)}`;
    case "explicit":
      return `${BASE_SYSTEM_PROMPT}\n\n${explicitSkillBlock(skill)}`;
    case "agents-md":
      return `${agentsMdBlock(skill)}\n\n---\n\n${BASE_SYSTEM_PROMPT}`;
  }
}

export function buildTaskMessage(task: EvalTask, repoLabel: string): string {
  return `Repository: ${repoLabel}

Task:
${task.prompt}`;
}

export function buildInitialMessages(input: {
  configId: ConfigId;
  skill: ResolvedSkill;
  task: EvalTask;
  repoLabel: string;
}): ModelMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(input.configId, input.skill) },
    { role: "user", content: buildTaskMessage(input.task, input.repoLabel) },
  ];
}

/** The tool result returned when the model chooses to load the skill. */
export function buildSkillLoadResult(skill: ResolvedSkill): string {
  return `Skill "${skill.name}" loaded. Follow these instructions for the remainder of this task.

---

${skill.instructions}`;
}
