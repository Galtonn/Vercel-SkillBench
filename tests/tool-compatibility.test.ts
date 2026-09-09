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

  it("does not mistake multiline jq filters for shell executables", () => {
    const result = assessSkillCompatibility(
      makeSkill({
        instructions: `\`\`\`bash
jq -s '
  group_by(.full_path)
  | map(max_by(.compressed_size))
  | sort_by(-.compressed_size)
  | .[0:10]
' sources.ndjson
\`\`\``,
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
