import { describe, expect, it } from "vitest";

import { assessSkillCompatibility } from "@/lib/eval/tool-compatibility";
import { makeSkill } from "./helpers/factories";

describe("assessSkillCompatibility", () => {
  it("accepts read-only grep and jq workflows with safe equivalents", () => {
    const result = assessSkillCompatibility(
      makeSkill({
        instructions: "```bash\ngrep 'client' sources.ndjson | jq .path\n```",
      }),
    );

    expect(result).toEqual({ compatible: true, unsupported: [] });
  });

  it("rejects skills that require execution or writes", () => {
    const result = assessSkillCompatibility(
      makeSkill({
        raw: "---\nname: x\ndescription: x\nallowed-tools: Write\n---\nbody",
        instructions: "```bash\nnpm run build\n```",
      }),
    );

    expect(result.compatible).toBe(false);
    expect(result.unsupported).toEqual(["Write", "shell:npm"]);
  });
});
