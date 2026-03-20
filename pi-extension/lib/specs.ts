import * as fs from "fs";
import * as path from "path";

/** Spec detection results */
export interface SpecStatus {
  hasPrd: boolean;
  hasArch: boolean;
  hasTasks: boolean;
}

/** Detect which spec files exist in the specs directory */
export function detectSpecs(specsDir: string): SpecStatus {
  if (!specsDir || !fs.existsSync(specsDir)) {
    return { hasPrd: false, hasArch: false, hasTasks: false };
  }

  const files = fs.readdirSync(specsDir);
  const hasPrd = files.some(
    (f) =>
      f === "product-specs.md" ||
      f === "product_specs.md" ||
      f === "prd.md" ||
      (f === "product-specs" && isDirectory(path.join(specsDir, f))),
  );
  const hasArch = files.some(
    (f) =>
      f === "architecture.md" ||
      (f === "architecture" && isDirectory(path.join(specsDir, f))),
  );
  const hasTasks = files.some(
    (f) =>
      f === "tasks.md" || f === "tasks.json" || f.startsWith("TASK-"),
  );

  return { hasPrd, hasArch, hasTasks };
}

/** Extract a summary of specs for context injection */
export function extractSpecSummary(specsDir: string): string | null {
  if (!specsDir || !fs.existsSync(specsDir)) return null;

  const parts: string[] = [];

  // Extract PRD summary (features + NFRs)
  const prdSummary = extractPrdSummary(specsDir);
  if (prdSummary) parts.push(prdSummary);

  // Extract architecture decisions
  const archSummary = extractArchSummary(specsDir);
  if (archSummary) parts.push(archSummary);

  // Extract task status
  const taskSummary = extractTaskSummary(specsDir);
  if (taskSummary) parts.push(taskSummary);

  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** Extract features and NFRs from the PRD */
function extractPrdSummary(specsDir: string): string | null {
  const prdPath = findFile(specsDir, [
    "product-specs.md",
    "product_specs.md",
    "prd.md",
    "product-specs/overview.md",
  ]);
  if (!prdPath) return null;

  const content = fs.readFileSync(prdPath, "utf-8");
  const sections: string[] = [];

  // Extract features section
  const featuresMatch = content.match(
    /## Features\n([\s\S]*?)(?=\n## |\n# |$)/,
  );
  if (featuresMatch) {
    sections.push(`**Features:**\n${truncateSection(featuresMatch[1], 500)}`);
  }

  // Extract NFRs section
  const nfrMatch = content.match(
    /## (?:Non-Functional Requirements|NFRs?)\n([\s\S]*?)(?=\n## |\n# |$)/,
  );
  if (nfrMatch) {
    sections.push(`**NFRs:**\n${truncateSection(nfrMatch[1], 300)}`);
  }

  if (sections.length === 0) return null;
  return `### Product Specs\n${sections.join("\n")}`;
}

/** Extract key decisions from architecture doc */
function extractArchSummary(specsDir: string): string | null {
  const archPath = findFile(specsDir, [
    "architecture.md",
    "architecture/overview.md",
  ]);
  if (!archPath) return null;

  const content = fs.readFileSync(archPath, "utf-8");

  // Extract decisions section
  const decisionsMatch = content.match(
    /## (?:Key Decisions|Decisions|Architecture Decisions)\n([\s\S]*?)(?=\n## |\n# |$)/,
  );
  if (!decisionsMatch) return null;

  return `### Architecture Decisions\n${truncateSection(decisionsMatch[1], 500)}`;
}

/** Extract task completion status */
function extractTaskSummary(specsDir: string): string | null {
  const tasksPath = findFile(specsDir, ["tasks.md", "tasks.json"]);
  if (!tasksPath) return null;

  const content = fs.readFileSync(tasksPath, "utf-8");

  if (tasksPath.endsWith(".json")) {
    try {
      const tasks = JSON.parse(content) as Array<{
        id: string;
        status: string;
      }>;
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === "completed").length;
      return `### Tasks: ${done}/${total} completed`;
    } catch {
      return null;
    }
  }

  // Markdown task list — count checkboxes
  const totalTasks = (content.match(/^- \[[ x]\]/gm) || []).length;
  const doneTasks = (content.match(/^- \[x\]/gm) || []).length;
  if (totalTasks === 0) return null;
  return `### Tasks: ${doneTasks}/${totalTasks} completed`;
}

/** Find the first existing file from a list of candidates */
function findFile(dir: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const full = path.join(dir, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

/** Truncate a section to maxLen characters, breaking at line boundaries */
function truncateSection(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text.trim();
  const truncated = text.slice(0, maxLen);
  const lastNewline = truncated.lastIndexOf("\n");
  return (lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated).trim() + "\n...";
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
