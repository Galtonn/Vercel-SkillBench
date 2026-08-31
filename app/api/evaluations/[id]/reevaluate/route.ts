import { ProviderError } from "@/lib/eval/provider";
import { EvaluationValidationError } from "@/lib/eval/runner";
import { ServiceError, startReevaluation } from "@/lib/eval/service";
import { SkillResolutionError } from "@/lib/eval/skill-parser";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/evaluations/[id]/reevaluate">,
) {
  const { id } = await context.params;

  try {
    const record = await startReevaluation(id);
    return Response.json({ id: record.id }, { status: 202 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (
      error instanceof EvaluationValidationError ||
      error instanceof SkillResolutionError ||
      error instanceof ProviderError
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error("[skillbench] reevaluate failed", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
