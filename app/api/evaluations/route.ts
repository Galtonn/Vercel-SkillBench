import { EvaluationValidationError } from "@/lib/eval/runner";
import { createAndStartEvaluation } from "@/lib/eval/service";
import { SkillResolutionError } from "@/lib/eval/skill-parser";
import { ProviderError } from "@/lib/eval/provider";
import { toSummary } from "@/lib/adapters/ui";
import { listEvaluations } from "@/lib/storage/evaluations";

export const dynamic = "force-dynamic";

export async function GET() {
  const records = await listEvaluations();
  return Response.json({
    evaluations: records.map((record) => toSummary(record)),
  });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  try {
    const record = await createAndStartEvaluation(
      payload as Record<string, unknown>,
    );
    return Response.json({ id: record.id }, { status: 202 });
  } catch (error) {
    if (error instanceof EvaluationValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SkillResolutionError) {
      return Response.json(
        { error: error.message, attempts: error.attempts.slice(0, 8) },
        { status: 400 },
      );
    }
    if (error instanceof ProviderError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error("[skillbench] failed to create evaluation", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
