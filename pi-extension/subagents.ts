import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as path from "path";
import * as fs from "fs";

/** Model tier mapping: maps abstract tiers to provider-specific models */
const TIER_MAP: Record<string, Record<string, string>> = {
  anthropic: {
    sonnet: "anthropic/claude-sonnet-4-20250514",
    opus: "anthropic/claude-opus-4-20250514",
  },
  google: {
    sonnet: "google/gemini-2.5-flash",
    opus: "google/gemini-2.5-pro",
  },
  openai: {
    sonnet: "openai/gpt-4.1-mini",
    opus: "openai/gpt-4.1",
  },
};

/** Expected structure for agent verification output */
interface AgentOutput {
  summary: string;
  score: number;
  findings: Array<{
    severity: "critical" | "major" | "minor";
    category: string;
    file: string;
    line: number;
    finding: string;
    recommendation: string;
  }>;
  verdict: "approve" | "request-changes";
}

/** Parse YAML frontmatter from a skill/agent file */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return fm;
}

/** Load agent system prompt from a SKILL.md file (body after frontmatter) */
function loadAgentPrompt(agentFile: string): string {
  const content = fs.readFileSync(agentFile, "utf-8");
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1].trim() : content;
}

/** Resolve the model tier (sonnet/opus) to a provider-specific model */
function resolveModelTier(agentFile: string, currentModel: string): string {
  const content = fs.readFileSync(agentFile, "utf-8");
  const fm = parseFrontmatter(content);
  const tier = fm.model || "inherit";
  if (tier === "inherit") return currentModel;
  const provider = currentModel.split("/")[0];
  return TIER_MAP[provider]?.[tier] || currentModel;
}

/** Validate that agent output matches the expected JSON structure */
function validateAgentOutput(output: unknown): {
  valid: boolean;
  verdict: string;
  score: number;
} {
  if (typeof output !== "object" || output === null) {
    return { valid: false, verdict: "unknown", score: 0 };
  }
  const obj = output as Record<string, unknown>;
  const hasRequiredFields =
    typeof obj.summary === "string" &&
    typeof obj.score === "number" &&
    Array.isArray(obj.findings) &&
    typeof obj.verdict === "string";
  return {
    valid: hasRequiredFields,
    verdict: (obj.verdict as string) || "unknown",
    score: (obj.score as number) || 0,
  };
}

/** Parse JSON output from the agent subprocess, with fallback for non-JSON */
function parseAgentOutput(stdout: string): AgentOutput | { raw: string } {
  try {
    // Look for JSON block in output (agent may emit non-JSON preamble)
    const jsonMatch = stdout.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AgentOutput;
    }
    return { raw: stdout };
  } catch {
    return { raw: stdout };
  }
}

/** Register the groundwork_agent tool with Pi */
export function registerSubagentTool(pi: ExtensionAPI, agentsDir: string) {
  pi.registerTool({
    name: "groundwork_agent",
    label: "Groundwork Agent",
    description:
      "Run a Groundwork verification or research agent. Supports parallel execution when multiple calls are made in one response.",
    parameters: Type.Object({
      agent: Type.String({
        description:
          "Agent name (e.g., code-quality-reviewer, security-reviewer)",
      }),
      task: Type.String({ description: "Task prompt for the agent" }),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      // Resolve the agent skill file — agents are installed as review-<name> skills
      let agentFile = path.join(agentsDir, `review-${params.agent}/SKILL.md`);
      if (!fs.existsSync(agentFile)) {
        // Try without review- prefix for direct skill references
        agentFile = path.join(agentsDir, `${params.agent}/SKILL.md`);
      }
      if (!fs.existsSync(agentFile)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Agent not found: ${params.agent}`,
                searched: [
                  `review-${params.agent}/SKILL.md`,
                  `${params.agent}/SKILL.md`,
                ],
              }),
            },
          ],
        };
      }

      const systemPrompt = loadAgentPrompt(agentFile);
      const model = resolveModelTier(agentFile, ctx.model);
      const fm = parseFrontmatter(fs.readFileSync(agentFile, "utf-8"));
      const maxTurns = parseInt(fm.maxTurns || "30", 10);

      onUpdate(`Running agent: ${params.agent} (model: ${model})`);

      // Spawn pi subprocess in JSON mode
      const result = await pi.exec(
        "pi",
        [
          "--mode",
          "json",
          "--model",
          model,
          "--max-turns",
          String(maxTurns),
          "--system-prompt",
          systemPrompt,
          "--prompt",
          params.task,
        ],
        { signal, timeout: 300_000 },
      );

      const output = parseAgentOutput(result.stdout);
      const validation = validateAgentOutput(output);

      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        details: {
          agent: params.agent,
          validation,
          exitCode: result.code,
        },
      };
    },

    renderCall(args, theme) {
      return new (theme.Text as any)(
        theme.fg("toolTitle", `Agent: ${args.agent}`),
        0,
        0,
      );
    },

    renderResult(result, { expanded }, theme) {
      const d = result.details as {
        agent?: string;
        validation?: { verdict: string; score: number };
      };
      const color =
        d?.validation?.verdict === "approve" ? "success" : "warning";
      return new (theme.Text as any)(
        theme.fg(
          color,
          `${d?.agent}: ${d?.validation?.verdict ?? "unknown"} (${d?.validation?.score ?? "?"})`,
        ),
        0,
        0,
      );
    },
  });
}
