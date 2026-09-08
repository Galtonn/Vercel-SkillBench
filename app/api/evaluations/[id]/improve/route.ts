import { toDetail } from "@/lib/adapters/ui";
import { ImprovementError } from "@/lib/eval/improve";
import { ProviderError } from "@/lib/eval/provider";
import { improveSkill, ServiceError } from "@/lib/eval/service";
import { demoSessionFromRequest } from "@/lib/auth/demo-session";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/evaluations/[id]/improve">,
) {
  const { id } = await context.params;
  const session = await demoSessionFromRequest(request, { mutation: true });
  if (!session) return Response.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const record = await improveSkill(id, session.id);
    return Response.json({ detail: toDetail(record) });
  } catch (error) {
    if (error instanceof ServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ProviderError || error instanceof ImprovementError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error("[skillbench] improve failed", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
