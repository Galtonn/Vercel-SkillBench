import { resolveSkill, SkillResolutionError } from "@/lib/eval/skill-parser";

export const dynamic = "force-dynamic";

/**
 * Resolves a skill reference and returns its metadata, so the New Evaluation form
 * can show what will actually be loaded before spending any model calls. Returns
 * a real error when the skill cannot be fetched or parsed — it never falls back
 * to placeholder content.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const reference =
    payload && typeof payload === "object" && "skill" in payload
      ? String((payload as Record<string, unknown>).skill ?? "")
      : "";

  try {
    const skill = await resolveSkill(reference);
    return Response.json({
      name: skill.name,
      description: skill.description,
      sourceKind: skill.sourceKind,
      sourceLabel: skill.sourceLabel,
      instructionsLength: skill.instructions.length,
    });
  } catch (error) {
    if (error instanceof SkillResolutionError) {
      return Response.json(
        { error: error.message, attempts: error.attempts.slice(0, 8) },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 500 });
  }
}
