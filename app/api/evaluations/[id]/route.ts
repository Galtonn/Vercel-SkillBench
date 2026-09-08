import { toDetail, toProgressView } from "@/lib/adapters/ui";
import { abandonEvaluation } from "@/lib/eval/runner";
import { deleteEvaluation, loadEvaluation } from "@/lib/storage/evaluations";
import { demoSessionFromRequest } from "@/lib/auth/demo-session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: RouteContext<"/api/evaluations/[id]">,
) {
  const { id } = await context.params;
  const session = await demoSessionFromRequest(request);
  if (!session) return Response.json({ error: "Unauthorized." }, { status: 401 });

  let record;
  try {
    record = await loadEvaluation(id, session.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 500 });
  }

  if (!record) {
    return Response.json({ error: "Evaluation not found." }, { status: 404 });
  }

  return Response.json({
    progress: toProgressView(record),
    detail: record.metrics ? toDetail(record) : null,
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/evaluations/[id]">,
) {
  const { id } = await context.params;
  const session = await demoSessionFromRequest(request, { mutation: true });
  if (!session) return Response.json({ error: "Unauthorized." }, { status: 401 });

  let record;
  try {
    record = await loadEvaluation(id, session.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 400 });
  }

  if (!record) {
    return Response.json({ error: "Evaluation not found." }, { status: 404 });
  }

  if (record.status === "queued" || record.status === "running") {
    return Response.json(
      { error: "Cancel this evaluation before deleting it." },
      { status: 409 },
    );
  }

  abandonEvaluation(id);

  try {
    await deleteEvaluation(id, session.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
