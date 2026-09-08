import { requestCancellation } from "@/lib/eval/runner";
import { loadEvaluation } from "@/lib/storage/evaluations";
import { demoSessionFromRequest } from "@/lib/auth/demo-session";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/evaluations/[id]/cancel">,
) {
  const { id } = await context.params;
  const session = await demoSessionFromRequest(request, { mutation: true });
  if (!session) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const record = await loadEvaluation(id, session.id);
  if (!record) {
    return Response.json({ error: "Evaluation not found." }, { status: 404 });
  }
  if (record.status !== "running" && record.status !== "queued") {
    return Response.json(
      { error: "This evaluation is not running." },
      { status: 409 },
    );
  }

  const accepted = await requestCancellation(id, session.id);
  if (!accepted) {
    return Response.json(
      {
        error:
          "This evaluation could not be marked for cancellation.",
      },
      { status: 409 },
    );
  }

  return Response.json({ ok: true });
}
