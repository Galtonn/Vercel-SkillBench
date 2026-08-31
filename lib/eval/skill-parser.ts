import { readFile } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import type { ParsedSkill, ResolvedSkill, SkillSourceKind } from "./types";

export class SkillResolutionError extends Error {
  readonly attempts: string[];

  constructor(message: string, attempts: string[] = []) {
    super(message);
    this.name = "SkillResolutionError";
    this.attempts = attempts;
  }
}

/**
 * Parses a SKILL.md document: YAML frontmatter for the metadata the agent sees
 * before loading, and the markdown body as the instructions it sees after.
 */
export function parseSkill(source: string): ParsedSkill {
  if (!source.trim()) {
    throw new SkillResolutionError("The SKILL.md file is empty.");
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SkillResolutionError(
      `The SKILL.md frontmatter is not valid YAML: ${detail}`,
    );
  }

  const data = parsed.data as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const description =
    typeof data.description === "string" ? data.description.trim() : "";
  const instructions = parsed.content.trim();

  if (!name) {
    throw new SkillResolutionError(
      "The SKILL.md frontmatter is missing a `name` field.",
    );
  }
  if (!description) {
    throw new SkillResolutionError(
      "The SKILL.md frontmatter is missing a `description` field. Without it the agent has nothing to decide on in the Skill condition.",
    );
  }
  if (!instructions) {
    throw new SkillResolutionError(
      "The SKILL.md body is empty, so there are no instructions to load.",
    );
  }

  return { name, description, instructions };
}

/* -------------------------------------------------------------------------- */
/* Source resolution                                                          */
/* -------------------------------------------------------------------------- */

function looksLikeRawMarkdown(reference: string) {
  const trimmed = reference.trim();
  return (
    trimmed.startsWith("---") ||
    trimmed.startsWith("#") ||
    /\n/.test(trimmed)
  );
}

function looksLikeLocalPath(reference: string) {
  const trimmed = reference.trim();
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.toLowerCase().endsWith(".md")
  );
}

/**
 * Candidate locations for a `owner/repo/skill-name` reference, ordered by how
 * common they are across published skill repositories.
 */
function githubCandidatePaths(skillName: string) {
  return [
    `.agents/skills/${skillName}/SKILL.md`,
    `skills/${skillName}/SKILL.md`,
    `.cursor/skills/${skillName}/SKILL.md`,
    `.claude/skills/${skillName}/SKILL.md`,
    `plugins/${skillName}/SKILL.md`,
    `${skillName}/SKILL.md`,
  ];
}

const GITHUB_BRANCHES = ["HEAD", "main", "master"];

async function fetchText(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: { Accept: "text/plain" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.text();
}

type GithubTarget = { owner: string; repo: string; filePath: string; ref: string };

/** Parses a github.com blob/raw URL into a raw-content target. */
function parseGithubUrl(reference: string): GithubTarget | null {
  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    return null;
  }
  if (url.hostname !== "github.com" && url.hostname !== "raw.githubusercontent.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (url.hostname === "raw.githubusercontent.com") {
    const [owner, repo, ref, ...rest] = segments;
    if (!owner || !repo || !ref || rest.length === 0) return null;
    return { owner, repo, ref, filePath: rest.join("/") };
  }

  const [owner, repo, kind, ref, ...rest] = segments;
  if (!owner || !repo || (kind !== "blob" && kind !== "raw") || !ref) return null;
  if (rest.length === 0) return null;
  return { owner, repo, ref, filePath: rest.join("/") };
}

async function resolveFromGithub(
  reference: string,
): Promise<{ raw: string; sourceLabel: string }> {
  const attempts: string[] = [];

  const direct = parseGithubUrl(reference);
  if (direct) {
    const url = `https://raw.githubusercontent.com/${direct.owner}/${direct.repo}/${direct.ref}/${direct.filePath}`;
    attempts.push(url);
    const raw = await fetchText(url);
    if (raw) return { raw, sourceLabel: url };
    throw new SkillResolutionError(
      `Could not fetch the SKILL.md at ${url}. The file may not exist or the repository may be private.`,
      attempts,
    );
  }

  const segments = reference
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);

  if (segments.length < 2) {
    throw new SkillResolutionError(
      `"${reference}" is not a recognised skill reference. Use owner/repo/skill-name, a github.com URL, a local path to a SKILL.md, or paste the SKILL.md contents.`,
    );
  }

  const [owner, repo, ...rest] = segments;

  // owner/repo/path/to/SKILL.md
  if (rest.at(-1)?.toLowerCase() === "skill.md") {
    for (const branch of GITHUB_BRANCHES) {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest.join("/")}`;
      attempts.push(url);
      const raw = await fetchText(url);
      if (raw) return { raw, sourceLabel: url };
    }
  }

  // owner/repo/skill-name
  const skillName = rest.join("/") || repo;
  for (const branch of GITHUB_BRANCHES) {
    for (const candidate of githubCandidatePaths(skillName)) {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${candidate}`;
      attempts.push(url);
      const raw = await fetchText(url);
      if (raw) return { raw, sourceLabel: url };
    }
  }

  throw new SkillResolutionError(
    `Could not find a SKILL.md for "${reference}" on GitHub. Tried ${attempts.length} locations under ${owner}/${repo}.`,
    attempts,
  );
}

/**
 * Reads a SKILL.md the operator pointed at on the server's own filesystem. The
 * path is arbitrary by design, which is why the bundler cannot trace this read.
 */
async function resolveFromDisk(
  reference: string,
): Promise<{ raw: string; sourceLabel: string }> {
  const absolute = path.isAbsolute(reference)
    ? reference
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), reference);

  try {
    // Operator-supplied path, so there is nothing for the bundler to trace.
    const raw = await readFile(/*turbopackIgnore: true*/ absolute, "utf8");
    return { raw, sourceLabel: absolute };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SkillResolutionError(
      `Could not read a SKILL.md at ${absolute}: ${detail}`,
    );
  }
}

/**
 * Resolves a skill reference into real content. Never substitutes placeholder
 * text — if the source cannot be loaded, this throws so the caller can surface
 * the failure instead of evaluating a fake skill.
 */
export async function resolveSkill(reference: string): Promise<ResolvedSkill> {
  const trimmed = reference.trim();
  if (!trimmed) {
    throw new SkillResolutionError("No skill was provided.");
  }

  let sourceKind: SkillSourceKind;
  let loaded: { raw: string; sourceLabel: string };

  if (looksLikeRawMarkdown(trimmed)) {
    sourceKind = "raw";
    loaded = { raw: trimmed, sourceLabel: "pasted SKILL.md" };
  } else if (looksLikeLocalPath(trimmed)) {
    sourceKind = "local";
    loaded = await resolveFromDisk(trimmed);
  } else {
    sourceKind = "github";
    loaded = await resolveFromGithub(trimmed);
  }

  const parsed = parseSkill(loaded.raw);

  return {
    ...parsed,
    reference: trimmed,
    sourceKind,
    sourceLabel: loaded.sourceLabel,
    raw: loaded.raw,
  };
}

/** Builds a ResolvedSkill from markdown produced by the improvement flow. */
export function resolveRevisedSkill(
  markdown: string,
  originReference: string,
): ResolvedSkill {
  const parsed = parseSkill(markdown);
  return {
    ...parsed,
    reference: originReference,
    sourceKind: "revision",
    sourceLabel: `SkillBench revision of ${originReference}`,
    raw: markdown,
  };
}
