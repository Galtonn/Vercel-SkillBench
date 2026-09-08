import { ProviderError } from "@/lib/eval/provider";
import { EvaluationValidationError, executeEvaluation } from "@/lib/eval/runner";
import { ServiceError, createReevaluation } from "@/lib/eval/service";
import { SkillResolutionError } from "@/lib/eval/skill-parser";
import { demoSessionFromRequest } from "@/lib/auth/demo-session";
import { after } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: RouteContext<"/api/evaluations/[id]/reevaluate">,
) {
  const { id } = await context.params;
  const session = await demoSessionFromRequest(request, { mutation: true });
  if (!session) return Response.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const record = await createReevaluation(id, session.id);
    after(() => executeEvaluation(record.id));
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
