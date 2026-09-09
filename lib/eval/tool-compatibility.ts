import matter from "gray-matter";

import type { ResolvedSkill } from "./types";

const SAFE_SHELL_EQUIVALENTS = new Set([
  "cat",
  "find",
  "grep",
  "head",
  "jq",
  "ls",
  "tail",
]);
const UNSUPPORTED_AGENT_TOOLS = [
  "Write",
  "Edit",
  "NotebookEdit",
  "ComputerUse",
  "Browser",
];

export type SkillCompatibility = {
  compatible: boolean;
  unsupported: string[];
};

/** Returns command names while ignoring shell text embedded inside quotes. */
function shellExecutables(source: string): string[] {
  const segments: string[] = [];
  let segment = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  const finish = () => {
    if (segment.trim()) segments.push(segment);
    segment = "";
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (escaped) {
      escaped = false;
      if (char !== "\n") segment += char;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      segment += " ";
      continue;
    }
    if (char === "#" && (!segment || /\s$/.test(segment))) {
      while (index < source.length && source[index] !== "\n") index += 1;
      finish();
      continue;
    }
    if (char === "\n" || char === ";" || char === "|" || char === "&") {
      finish();
      if ((char === "|" || char === "&") && next === char) index += 1;
      continue;
    }
    segment += char;
  }
  finish();

  return segments.flatMap((entry) => {
    const executable = entry
      .trim()
      .match(/^(?:[A-Z_][A-Z0-9_]*=\S+\s+)*([\w.-]+)/i)?.[1];
    return executable ? [executable] : [];
  });
}

/**
 * Reject skills whose documented workflow depends on capabilities this hosted,
 * read-only harness cannot provide. Merely claiming success without those tools
 * would turn the comparison into prompt theater.
 */
export function assessSkillCompatibility(
  skill: Pick<ResolvedSkill, "raw" | "instructions">,
): SkillCompatibility {
  let frontmatter: Record<string, unknown> = {};
  try {
    frontmatter = matter(skill.raw).data as Record<string, unknown>;
  } catch {
    // Parsing was already validated when the skill was resolved.
  }

  const declared = String(
    frontmatter["allowed-tools"] ?? frontmatter.allowed_tools ?? "",
  );
  const unsupported = UNSUPPORTED_AGENT_TOOLS.filter((tool) =>
    new RegExp(`\\b${tool}\\b`, "i").test(declared),
  );

  const shellBlocks = [...skill.instructions.matchAll(/```(?:bash|sh|shell|zsh)\s*\n([\s\S]*?)```/gi)];
  for (const block of shellBlocks) {
    for (const executable of shellExecutables(block[1])) {
      if (!SAFE_SHELL_EQUIVALENTS.has(executable)) {
        unsupported.push(`shell:${executable}`);
      }
    }
  }

  const unique = [...new Set(unsupported)];
  return { compatible: unique.length === 0, unsupported: unique };
}

export function skillCompatibilityMessage(result: SkillCompatibility): string {
  return result.compatible
    ? "Compatible with the hosted read-only evaluator."
    : `This skill requires unsupported tools (${result.unsupported.join(", ")}). Add safe evaluator equivalents before running it.`;
}
