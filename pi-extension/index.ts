import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as path from "path";
import { registerSubagentTool } from "./subagents";
import { detectSpecs, extractSpecSummary } from "./lib/specs";
import { resolveProjectContext, type ProjectContext } from "./lib/project-context";

export default function (pi: ExtensionAPI) {
  let projectCtx: ProjectContext = { root: "", specsDir: "", name: "" };

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

  // Template variable resolution in message content
  pi.on("context", async (event, _ctx) => {
    return {
      messages: resolveTemplateVars(event.messages, projectCtx),
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
      const configPath = path.join(projectCtx.root, ".groundwork.yml");
      try {
        const fs = await import("fs");
        if (!fs.existsSync(configPath)) {
          ctx.ui.showMessage("No .groundwork.yml found in project root.");
          return;
        }
        const content = fs.readFileSync(configPath, "utf-8");
        const projects = parseProjectList(content);
        if (projects.length === 0) {
          ctx.ui.showMessage("No projects defined in .groundwork.yml");
          return;
        }
        const selected = await ctx.ui.select("Select project:", projects);
        if (selected) {
          projectCtx = resolveProjectContext(ctx.cwd, selected);
          ctx.ui.showMessage(`Switched to project: ${selected}`);
        }
      } catch {
        ctx.ui.showMessage("Failed to read .groundwork.yml");
      }
    },
  });
}

/** Replace template variables like {{PROJECT_ROOT}} in messages */
function resolveTemplateVars(
  messages: Array<{ role: string; content: string }>,
  ctx: ProjectContext,
): Array<{ role: string; content: string }> {
  return messages.map((msg) => ({
    ...msg,
    content: msg.content
      .replace(/\{\{PROJECT_ROOT\}\}/g, ctx.root)
      .replace(/\{\{PROJECT_NAME\}\}/g, ctx.name)
      .replace(/\{\{SPECS_DIR\}\}/g, ctx.specsDir),
  }));
}

/** Extract project names from .groundwork.yml content */
function parseProjectList(content: string): string[] {
  const projects: string[] = [];
  const lines = content.split("\n");
  let inProjects = false;
  for (const line of lines) {
    if (/^projects:/.test(line)) {
      inProjects = true;
      continue;
    }
    if (inProjects) {
      const match = line.match(/^\s+-\s+name:\s*(.+)/);
      if (match) {
        projects.push(match[1].trim());
      } else if (/^\S/.test(line)) {
        break; // End of projects block
      }
    }
  }
  return projects;
}
