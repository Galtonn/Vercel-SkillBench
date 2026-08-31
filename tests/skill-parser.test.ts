import { describe, expect, it } from "vitest";

import { SkillResolutionError, parseSkill } from "@/lib/eval/skill-parser";

import { SKILL_MARKDOWN } from "./helpers/factories";

describe("parseSkill", () => {
  it("splits frontmatter metadata from the instruction body", () => {
    const skill = parseSkill(SKILL_MARKDOWN);

    expect(skill.name).toBe("analyze-bundle");
    expect(skill.description).toMatch(/reduce client-side bundle size/);
    expect(skill.instructions).toMatch(/^# Analyze Bundle/);
    expect(skill.instructions).not.toMatch(/description:/);
  });

  it("trims surrounding whitespace from every field", () => {
    const skill = parseSkill(`---
name: "  spaced-skill  "
description: "  A description.  "
---


   Body text.

`);

    expect(skill.name).toBe("spaced-skill");
    expect(skill.description).toBe("A description.");
    expect(skill.instructions).toBe("Body text.");
  });

  it("keeps extra frontmatter keys out of the instructions", () => {
    const skill = parseSkill(`---
name: tools-restricted
description: Has extra keys.
allowed-tools: Read, Grep
---

Body.`);

    expect(skill.instructions).toBe("Body.");
  });

  it("rejects an empty document", () => {
    expect(() => parseSkill("   ")).toThrow(SkillResolutionError);
    expect(() => parseSkill("   ")).toThrow(/empty/i);
  });

  it("rejects a missing name", () => {
    expect(() =>
      parseSkill(`---
description: No name here.
---

Body.`),
    ).toThrow(/`name`/);
  });

  it("rejects a missing description, which the Skill condition depends on", () => {
    expect(() =>
      parseSkill(`---
name: no-description
---

Body.`),
    ).toThrow(/`description`/);
  });

  it("rejects an empty instruction body", () => {
    expect(() =>
      parseSkill(`---
name: empty-body
description: Nothing follows.
---
`),
    ).toThrow(/body is empty/i);
  });

  it("rejects malformed YAML rather than guessing", () => {
    expect(() =>
      parseSkill(`---
name: broken
  description: [unclosed
---

Body.`),
    ).toThrow(SkillResolutionError);
  });

  it("treats a document with no frontmatter as missing metadata", () => {
    expect(() => parseSkill("# Just a heading\n\nSome prose.")).toThrow(/`name`/);
  });
});
