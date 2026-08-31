import { MAX_TASKS } from "./config";
import { createTaskDraft, type TaskDraft } from "./custom-tasks";
import type { ModelProvider } from "./provider";
import type { ParsedSkill } from "./types";
import type { ReadOnlyWorkspace } from "./workspace";

/**
 * Proposes a benchmark for an arbitrary skill against a repository fixture.
 *
 * The output is a *draft*. It is returned to the editor for review and is never
 * run directly, because a model writing both the tasks and the ground truth can
 * be confidently wrong about both, and a benchmark nobody checked is not
 * evidence. The generator's job is to remove the blank-page problem, not to
 * certify the result.
 */

const SYSTEM_PROMPT = `You design evaluation benchmarks for AI agent skills.

You will be given a skill (its name, description, and full instructions) and a
read-only repository. Your job is to write tasks that measure whether an agent
does better work when it has that skill than when it does not.

Write 5 to 8 tasks with this mix:

- Several where the skill is clearly relevant and a correct answer depends on
  knowledge or procedure the skill provides.
- One or two where the skill is relevant but the prompt does not announce it.
  Phrase these the way a colleague would: describe a symptom or a goal, and use
  none of the skill's own vocabulary. These measure whether the agent recognises
  unprompted that the skill applies.
- One or two where the skill is genuinely NOT relevant. These must be plausible
  work in the same repository — a rename, a typing fix, a copy change — that the
  skill does not help with. Without them, false-positive skill loading cannot be
  measured at all, so they are required, not optional.

Rules for the tasks themselves:

- Ground every task in this specific repository. Name real files, real symbols,
  real values that you read. Do not invent files.
- Prefer tasks with a verifiable answer over tasks that ask for an opinion.
- Do not mention the skill, its name, or that a benchmark is running.

Rules for judgeCriteria, which are the ground truth the evaluator scores against:

- Write 3 to 5 criteria per task, each one a specific, checkable statement about
  what a correct answer contains. "Identifies that the email input in
  app/settings/form.tsx has no associated label" is a criterion. "Provides useful
  suggestions" is not, and is unacceptable.
- Where a task has a wrong answer that a plausible agent would give, write a
  criterion that explicitly rules it out.
- Criteria must be true of this repository. If you are not certain of a fact, do
  not write a criterion that asserts it.

referenceAnswer is a short prose example of a correct response, stating the facts
a good answer contains. It is orientation for the evaluator, not a template.

Respond with a single JSON object and nothing else:
{"tasks":[{"name":"...","prompt":"...","skillRelevant":true,"judgeCriteria":["...","..."],"referenceAnswer":"..."}]}`;

/** Files worth showing the generator, in priority order. */
const INTERESTING_EXTENSIONS = [
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".css",
  ".json",
  ".md",
];

const MAX_CONTEXT_FILES = 12;
const MAX_FILE_CHARS = 6000;
const MAX_TOTAL_CONTEXT_CHARS = 60_000;

/**
 * Reads a bounded slice of the repository for the generator's context.
 *
 * The agent under test explores the repo with tools, but the generator gets one
 * call, so it needs the interesting files up front. Selection is deliberately
 * dumb — shallowest first, then alphabetical — because a clever heuristic here
 * would bias which parts of the repo get benchmarked.
 */
export async function collectRepoContext(workspace: ReadOnlyWorkspace): Promise<{
  tree: string;
  files: { path: string; contents: string }[];
}> {
  const listing = await workspace.listFiles(".");
  const tree = listing.ok ? listing.content : "(could not read the repository)";

  const paths = tree
    .split("\n")
    .map((line) => line.replace(/\s*\(\d+ bytes\)\s*$/, "").trim())
    .filter((line) => line && !line.endsWith("/"))
    .filter((line) => INTERESTING_EXTENSIONS.some((ext) => line.endsWith(ext)))
    .sort((a, b) => {
      const depth = a.split("/").length - b.split("/").length;
      return depth !== 0 ? depth : a.localeCompare(b);
    })
    .slice(0, MAX_CONTEXT_FILES);

  const files: { path: string; contents: string }[] = [];
  let budget = MAX_TOTAL_CONTEXT_CHARS;

  for (const path of paths) {
    if (budget <= 0) break;
    const result = await workspace.readFile(path);
    if (!result.ok) continue;
    const contents = result.content.slice(0, Math.min(MAX_FILE_CHARS, budget));
    budget -= contents.length;
    files.push({ path, contents });
  }

  return { tree, files };
}

export function buildGeneratorPrompt(input: {
  skill: ParsedSkill;
  repoLabel: string;
  tree: string;
  files: { path: string; contents: string }[];
}): string {
  const fileBlocks = input.files
    .map((file) => `### ${file.path}\n\n\`\`\`\n${file.contents}\n\`\`\``)
    .join("\n\n");

  return `## Skill under test

name: ${input.skill.name}
description: ${input.skill.description}

### SKILL.md instructions

${input.skill.instructions}

## Repository: ${input.repoLabel}

### File tree

${input.tree}

### Selected files

${fileBlocks || "(no readable source files)"}`;
}

export type GeneratedTask = {
  name: string;
  prompt: string;
  skillRelevant: boolean;
  judgeCriteria: string[];
  referenceAnswer: string;
};

/**
 * Validates the generator's output against the documented schema.
 *
 * A task missing a prompt or criteria is dropped rather than repaired: a
 * generated task with no ground truth is exactly the failure mode this whole
 * change exists to remove, so it must not survive into the editor looking
 * complete. `skillRelevant` must be a real boolean — defaulting it to true would
 * reintroduce the everything-is-relevant bug through the generator.
 */
export function parseGeneratedTasks(text: string): GeneratedTask[] | null {
  if (!text?.trim()) return null;

  const candidates: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.push(fenced[1]);
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced?.[0]) candidates.push(braced[0]);
  candidates.push(text);

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;

    const raw = (parsed as Record<string, unknown>).tasks;
    if (!Array.isArray(raw)) continue;

    const tasks: GeneratedTask[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const item = entry as Record<string, unknown>;

      const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
      if (!prompt) continue;

      if (typeof item.skillRelevant !== "boolean") continue;

      const judgeCriteria = Array.isArray(item.judgeCriteria)
        ? item.judgeCriteria
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      if (judgeCriteria.length === 0) continue;

      tasks.push({
        name: typeof item.name === "string" ? item.name.trim() : "",
        prompt,
        skillRelevant: item.skillRelevant,
        judgeCriteria,
        referenceAnswer:
          typeof item.referenceAnswer === "string" ? item.referenceAnswer.trim() : "",
      });
    }

    if (tasks.length > 0) return tasks.slice(0, MAX_TASKS);
  }

  return null;
}

export function generatedTasksToDrafts(tasks: GeneratedTask[]): TaskDraft[] {
  return tasks.map((task) =>
    createTaskDraft({
      name: task.name,
      prompt: task.prompt,
      skillRelevant: task.skillRelevant,
      scoring: "llm_judge",
      criteria: task.judgeCriteria,
      referenceAnswer: task.referenceAnswer,
    }),
  );
}

export async function generateBenchmark(input: {
  provider: ModelProvider;
  skill: ParsedSkill;
  repoLabel: string;
  workspace: ReadOnlyWorkspace | null;
}): Promise<{ drafts: TaskDraft[]; error: string | null }> {
  if (!input.workspace) {
    return {
      drafts: [],
      error:
        "Benchmark generation needs a repository fixture to read. Choose one before generating.",
    };
  }

  let context: Awaited<ReturnType<typeof collectRepoContext>>;
  try {
    context = await collectRepoContext(input.workspace);
  } catch (error) {
    return {
      drafts: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const userPrompt = buildGeneratorPrompt({
    skill: input.skill,
    repoLabel: input.repoLabel,
    tree: context.tree,
    files: context.files,
  });

  try {
    const result = await input.provider.generate({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      maxOutputTokens: 4000,
      jsonMode: true,
    });

    const tasks = parseGeneratedTasks(result.text);
    if (!tasks) {
      return {
        drafts: [],
        error: "The generator did not return tasks in the expected format.",
      };
    }

    return { drafts: generatedTasksToDrafts(tasks), error: null };
  } catch (error) {
    return {
      drafts: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
