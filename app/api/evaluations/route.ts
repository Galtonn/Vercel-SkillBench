import { EvaluationValidationError } from "@/lib/eval/runner";
import { executeEvaluation } from "@/lib/eval/runner";
import { createEvaluation, ServiceError } from "@/lib/eval/service";
import { SkillResolutionError } from "@/lib/eval/skill-parser";
import { ProviderError } from "@/lib/eval/provider";
import { toSummary } from "@/lib/adapters/ui";
import { listEvaluations } from "@/lib/storage/evaluations";
import { demoSessionFromRequest } from "@/lib/auth/demo-session";
import { after } from "next/server";
import { readJsonBody, RequestBodyError } from "@/lib/http/json";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const session = await demoSessionFromRequest(request);
  if (!session) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const records = await listEvaluations(session.id);
  return Response.json({
    evaluations: records.map((record) => toSummary(record)),
  });
}

export async function POST(request: Request) {
  const session = await demoSessionFromRequest(request, { mutation: true });
  if (!session) return Response.json({ error: "Unauthorized." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  try {
    const record = await createEvaluation(
      payload as Record<string, unknown>,
      session.id,
    );
    after(() => executeEvaluation(record.id));
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
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error("[skillbench] failed to create evaluation", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
