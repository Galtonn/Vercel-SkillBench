import {
  buildInitialMessages,
  buildSkillLoadResult,
  buildUseSkillTool,
  USE_SKILL_TOOL_NAME,
} from "./conditions";
import { MAX_AGENT_ITERATIONS, MAX_SKILL_LOADS_PER_RUN } from "./config";
import {
  parseToolArguments,
  type ModelMessage,
  type ModelProvider,
  type ModelToolDefinition,
} from "./provider";
import type { ConfigId, EvalTask, ResolvedSkill, RunEvent, ToolCallRecord } from "./types";
import { ReadOnlyWorkspace, WORKSPACE_TOOLS } from "./workspace";

export type AgentRunInput = {
  provider: ModelProvider;
  configId: ConfigId;
  task: EvalTask;
  skill: ResolvedSkill;
  repoLabel: string;
  workspace: ReadOnlyWorkspace | null;
};

export type AgentRunOutput = {
  response: string;
  skillInvoked: boolean;
  skillInvocationReason: string | null;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  toolCalls: ToolCallRecord[];
  events: RunEvent[];
  latencyMs: number;
  truncated: boolean;
};

/**
 * Executes one agent run: real model calls, real tool calls, and — in the Skill
 * condition — a real `use_skill` invocation decision made by the model.
 *
 * Skill invocation is recorded only when the model actually calls the tool. It is
 * never inferred from the wording of the response.
 */
export async function runAgent(input: AgentRunInput): Promise<AgentRunOutput> {
  const startedAt = Date.now();
  const events: RunEvent[] = [];
  const toolCalls: ToolCallRecord[] = [];

  const at = () => Date.now() - startedAt;
  const record = (label: string, warning?: boolean) => {
    events.push({ atMs: at(), label, ...(warning ? { warning: true } : {}) });
  };

  record("Run started");

  const messages: ModelMessage[] = buildInitialMessages({
    configId: input.configId,
    skill: input.skill,
    task: input.task,
    repoLabel: input.repoLabel,
  });

  let skillToolAvailable = input.configId === "skill";
  let skillLoads = 0;
  let skillInvocationReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let modelCalls = 0;
  let response = "";
  let truncated = false;

  const buildTools = (): ModelToolDefinition[] | undefined => {
    const tools: ModelToolDefinition[] = [];
    if (input.workspace) tools.push(...WORKSPACE_TOOLS);
    if (skillToolAvailable) tools.push(buildUseSkillTool(input.skill));
    return tools.length > 0 ? tools : undefined;
  };

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration += 1) {
    const result = await input.provider.generate({
      messages,
      tools: buildTools(),
      temperature: 0.2,
      maxOutputTokens: 1600,
    });

    modelCalls += 1;
    inputTokens += result.inputTokens ?? 0;
    outputTokens += result.outputTokens ?? 0;

    if (result.toolCalls.length === 0) {
      response = result.text.trim();
      record("Final response received");
      break;
    }

    messages.push({
      role: "assistant",
      content: result.text,
      toolCalls: result.toolCalls,
    });

    for (const call of result.toolCalls) {
      const args = parseToolArguments(call);

      if (call.name === USE_SKILL_TOOL_NAME) {
        if (skillLoads >= MAX_SKILL_LOADS_PER_RUN) {
          toolCalls.push({
            name: call.name,
            detail: "already loaded",
            ok: false,
          });
          messages.push({
            role: "tool",
            toolCallId: call.id,
            content:
              "The skill is already loaded. Its instructions are above. Continue the task.",
          });
          continue;
        }

        skillLoads += 1;
        const reason = typeof args.reason === "string" ? args.reason.trim() : "";
        skillInvocationReason = reason || null;
        skillToolAvailable = false;

        record(
          `Skill invoked: ${input.skill.name}${reason ? ` — ${reason}` : ""}`,
        );
        record(
          `Skill instructions loaded (${input.skill.instructions.length} characters)`,
        );

        toolCalls.push({
          name: call.name,
          detail: reason || "no reason given",
          ok: true,
        });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: buildSkillLoadResult(input.skill),
        });
        continue;
      }

      if (!input.workspace) {
        toolCalls.push({ name: call.name, detail: "unavailable", ok: false });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content:
            "Error: no repository is mounted for this evaluation. Answer from the task description alone.",
        });
        continue;
      }

      const toolResult = await input.workspace.call(call.name, args);
      toolCalls.push({
        name: call.name,
        detail: toolResult.detail.replace(`${call.name} `, ""),
        ok: toolResult.ok,
      });
      record(toolResult.detail, !toolResult.ok);
      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: toolResult.content,
      });
    }
  }

  // The model was still calling tools when it hit the iteration cap. Ask once
  // more with no tools so the run produces an answer rather than nothing.
  if (!response) {
    truncated = true;
    record("Tool budget exhausted, requesting final answer", true);
    messages.push({
      role: "user",
      content:
        "You have used your tool budget. Give your final answer now, based on what you have already gathered.",
    });
    const forced = await input.provider.generate({
      messages,
      temperature: 0.2,
      maxOutputTokens: 1600,
    });
    modelCalls += 1;
    inputTokens += forced.inputTokens ?? 0;
    outputTokens += forced.outputTokens ?? 0;
    response = forced.text.trim();
    record("Final response received");
  }

  return {
    response,
    skillInvoked: skillLoads > 0,
    skillInvocationReason,
    inputTokens,
    outputTokens,
    modelCalls,
    toolCalls,
    events,
    latencyMs: Date.now() - startedAt,
    truncated,
  };
}
