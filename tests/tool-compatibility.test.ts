import { describe, expect, it } from "vitest";

import { assessSkillCompatibility } from "@/lib/eval/tool-compatibility";
import { hostedSkillInstructions } from "@/lib/eval/conditions";
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

describe("hostedSkillInstructions", () => {
  it("maps analyzer instructions to safe tools and preserves size semantics", () => {
    const instructions = hostedSkillInstructions(
      makeSkill({
        instructions:
          "Inspect routes.ndjson and sources.ndjson, then use module_edges.ndjson.",
      }),
    );

    expect(instructions).toContain("query_json_lines");
    expect(instructions).toMatch(/inspect the source files named in\s+the task/);
    expect(instructions).toContain("routes.ndjson.client_compressed_size");
    expect(instructions).toContain("client: true");
    expect(instructions).toContain("module_edges.ndjson");
  });

  it("does not add analyzer-specific field guidance to unrelated skills", () => {
    const instructions = hostedSkillInstructions(
      makeSkill({ instructions: "Review accessible form labels." }),
    );

    expect(instructions).toContain("Hosted evaluator workflow");
    expect(instructions).not.toContain("client_compressed_size");
  });
});
