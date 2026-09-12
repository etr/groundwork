import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as path from "path";
import { registerSubagentTool } from "./subagents";
import { detectSpecs, extractSpecSummary } from "./lib/specs";
import {
  resolveProjectContext,
  listProjects,
  type ProjectContext,
} from "./lib/project-context";

// Lowercase Groundwork template variables are the supported contract;
// substitution is delegated to the shared, tested JS helper.
const { applyTemplateVars } = require("./lib/template-vars");

export default function (pi: ExtensionAPI) {
  let projectCtx: ProjectContext = {
    root: "",
    specsDir: "",
    name: "",
    selectionRequired: false,
    bindings: {},
  };

  // Register groundwork_agent tool for subprocess-based agent dispatch
  const agentsDir = path.resolve(__dirname, "../skills");
  registerSubagentTool(pi, agentsDir);

  // SessionStart equivalent — detect project context and specs
  pi.on("session_start", async (_event, ctx) => {
    projectCtx = resolveProjectContext(ctx.cwd);
    const specs = detectSpecs(projectCtx.specsDir);
    ctx.ui.setWidget("groundwork-status", [
      `Groundwork | ${projectCtx.name} | PRD: ${specs.hasPrd ? "✓" : "✗"} | Arch: ${specs.hasArch ? "✓" : "✗"} | Tasks: ${specs.hasTasks ? "✓" : "✗"}`,
    ], { placement: "belowEditor" });
  });

  // Spec injection — provide spec summary as system context
  pi.on("before_agent_start", async (_event, _ctx) => {
    const summary = extractSpecSummary(projectCtx.specsDir);
    if (summary) {
      return { systemPrompt: `<groundwork-context>\n${summary}\n</groundwork-context>` };
    }
  });

  // Template variable resolution in message content (lowercase bindings)
  pi.on("context", async (event, _ctx) => {
    return {
      messages: event.messages.map((msg) => ({
        ...msg,
        content: applyTemplateVars(msg.content, projectCtx.bindings),
      })),
    };
  });

  // PreCompact equivalent — preserve Groundwork state in compaction summary
  pi.on("session_before_compact", async (_event, _ctx) => {
    // Future: inject compaction-safe state summary
  });

  // Commit alignment checking on tool results
  pi.on("tool_result", async (event, _ctx) => {
    if (event.toolName === "bash" && event.input?.command?.includes("git commit")) {
      // Future: check commit alignment with active task
    }
  });

  // Project selector command for monorepo support
  pi.registerCommand("groundwork-select-project", {
    description: "Select active project in monorepo",
    handler: async (_args, ctx) => {
      const projects = listProjects(ctx.cwd);
      if (projects.length === 0) {
        ctx.ui.showMessage("No projects defined in .groundwork.yml");
        return;
      }
      const selected = await ctx.ui.select(
        "Select project:",
        projects.map((p) => p.name),
      );
      if (selected) {
        projectCtx = resolveProjectContext(ctx.cwd, selected);
        ctx.ui.showMessage(`Switched to project: ${selected}`);
      }
    },
  });
}
