import { generateBenchmark } from "@/lib/eval/generate-benchmark";
import { createOpenAIProvider } from "@/lib/eval/openai-provider";
import { ProviderError } from "@/lib/eval/provider";
import { SkillResolutionError, resolveSkill } from "@/lib/eval/skill-parser";
import { workspaceIdFromRepo } from "@/lib/eval/fixtures";
import { ReadOnlyWorkspace } from "@/lib/eval/workspace";
import { WORKSPACE_DIRECTORIES } from "@/lib/eval/benchmarks";
import { demoSessionFromRequest } from "@/lib/auth/demo-session";
import { readJsonBody, RequestBodyError } from "@/lib/http/json";

export const dynamic = "force-dynamic";

/**
 * Proposes a custom benchmark for a skill against a fixture. The result is a
 * draft for the New Evaluation form — it is never started as an evaluation.
 */
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

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const skillReference = typeof body.skill === "string" ? body.skill.trim() : "";
  const repo = typeof body.repo === "string" ? body.repo.trim() : "";

  if (!skillReference) {
    return Response.json({ error: "Provide a skill to generate tasks for." }, { status: 400 });
  }

  const workspaceId =
    (typeof body.workspaceId === "string" && body.workspaceId) ||
    workspaceIdFromRepo(repo);

  if (!workspaceId || !WORKSPACE_DIRECTORIES[workspaceId]) {
    return Response.json(
      {
        error:
          "Benchmark generation needs a known repository fixture. Choose fixtures/bundle-bench or fixtures/ui-bench.",
      },
      { status: 400 },
    );
  }

  try {
    const skill = await resolveSkill(skillReference);
    const workspace = new ReadOnlyWorkspace(WORKSPACE_DIRECTORIES[workspaceId]);
    const provider = createOpenAIProvider();

    const result = await generateBenchmark({
      provider,
      skill,
      repoLabel: repo || workspaceId,
      workspace,
    });

    if (result.error || result.drafts.length === 0) {
      return Response.json(
        { error: result.error ?? "The generator returned no tasks." },
        { status: 502 },
      );
    }

    return Response.json({
      drafts: result.drafts,
      skillName: skill.name,
    });
  } catch (error) {
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
    console.error("[skillbench] failed to generate benchmark", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
