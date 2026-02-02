/**
 * Content-aware routing for spec writes.
 *
 * Routes new content to appropriate files in directory-based specs
 * based on content patterns (requirement IDs, decision records, task IDs).
 */

const fs = require('fs');
const path = require('path');
const { detectSpecType, findFileContaining, DEFAULT_SPECS_DIR } = require('./specs-io');

/**
 * Extract requirement ID pattern from content.
 *
 * @param {string} content - Content to analyze
 * @returns {{feature: string|null, id: string|null}}
 */
function extractPRDPattern(content) {
  // Match patterns like PRD-AUTH-REQ-001, PRD-BILL-REQ-002
  const match = content.match(/PRD-([A-Z]+)-REQ-(\d+)/);
  if (match) {
    return { feature: match[1], id: `PRD-${match[1]}-REQ-${match[2]}` };
  }
  return { feature: null, id: null };
}

/**
 * Extract decision record ID from content.
 *
 * @param {string} content - Content to analyze
 * @returns {string|null}
 */
function extractDRPattern(content) {
  // Match patterns like DR-001, DR-002
  const match = content.match(/DR-(\d+)/);
  return match ? match[0] : null;
}

/**
 * Extract task ID from content.
 *
 * @param {string} content - Content to analyze
 * @returns {{taskId: string|null, milestone: string|null}}
 */
function extractTaskPattern(content) {
  // Match patterns like TASK-001, TASK-002
  const taskMatch = content.match(/TASK-(\d+)/);
  const taskId = taskMatch ? taskMatch[0] : null;

  // Match milestone patterns like M1, M2
  const milestoneMatch = content.match(/M(\d+)\s*[-:]/);
  const milestone = milestoneMatch ? `M${milestoneMatch[1]}` : null;

  return { taskId, milestone };
}

/**
 * Route PRD content to appropriate file.
 *
 * Routing rules:
 * - Features with IDs -> specs/product_specs/03-features/<feature-code>.md
 * - Open questions -> specs/product_specs/05-open-questions.md
 * - NFRs -> specs/product_specs/02-non-functional.md
 * - Default -> specs/product_specs/_index.md
 *
 * @param {string} content - Content to write
 * @param {string} baseDir - Base directory (defaults to current working directory)
 * @returns {{path: string, type: 'file'|'directory', isNew: boolean, reason: string}}
 */
function routePRDContent(content, baseDir = process.cwd()) {
  const detection = detectSpecType('product_specs', baseDir);

  // Single file mode - always return the file
  if (!detection.exists || detection.type === 'file') {
    const filePath = detection.exists
      ? detection.path
      : path.join(baseDir, DEFAULT_SPECS_DIR, 'product_specs.md');
    return {
      path: filePath,
      type: 'file',
      isNew: !detection.exists,
      reason: 'single-file mode'
    };
  }

  // Directory mode - route based on content
  const { feature, id } = extractPRDPattern(content);

  // Check for open questions
  if (content.includes('OQ-') || content.toLowerCase().includes('open question')) {
    const oqPath = path.join(detection.path, '05-open-questions.md');
    return {
      path: oqPath,
      type: 'directory',
      isNew: !fs.existsSync(oqPath),
      reason: 'contains open question'
    };
  }

  // Check for NFR content
  if (content.toLowerCase().includes('non-functional') ||
      content.toLowerCase().includes('nfr') ||
      content.includes('latency') ||
      content.includes('availability') ||
      content.includes('scalability')) {
    const nfrPath = path.join(detection.path, '02-non-functional.md');
    if (fs.existsSync(nfrPath)) {
      return {
        path: nfrPath,
        type: 'directory',
        isNew: false,
        reason: 'NFR content detected'
      };
    }
  }

  // Route features to appropriate file
  if (feature) {
    // Try to find existing file with this feature
    const found = findFileContaining('product_specs', id, baseDir);
    if (found.file) {
      return {
        path: found.file,
        type: 'directory',
        isNew: false,
        reason: `updating existing requirement ${id}`
      };
    }

    // Check if features directory exists
    const featuresDir = path.join(detection.path, '03-features');
    if (fs.existsSync(featuresDir) && fs.statSync(featuresDir).isDirectory()) {
      const featureFile = path.join(featuresDir, `${feature.toLowerCase()}.md`);
      return {
        path: featureFile,
        type: 'directory',
        isNew: !fs.existsSync(featureFile),
        reason: `feature ${feature}`
      };
    }
  }

  // Default to _index.md
  return {
    path: path.join(detection.path, '_index.md'),
    type: 'directory',
    isNew: !fs.existsSync(path.join(detection.path, '_index.md')),
    reason: 'default location'
  };
}

/**
 * Route architecture content to appropriate file.
 *
 * Routing rules:
 * - Decision records -> specs/architecture/11-decisions/<DR-NNN>.md
 * - Components -> specs/architecture/04-components/<component>.md
 * - Data architecture -> specs/architecture/05-data.md
 * - Security -> specs/architecture/07-security.md
 * - Default -> specs/architecture/_index.md
 *
 * @param {string} content - Content to write
 * @param {string} baseDir - Base directory (defaults to current working directory)
 * @returns {{path: string, type: 'file'|'directory', isNew: boolean, reason: string}}
 */
function routeArchitectureContent(content, baseDir = process.cwd()) {
  const detection = detectSpecType('architecture', baseDir);

  // Single file mode - always return the file
  if (!detection.exists || detection.type === 'file') {
    const filePath = detection.exists
      ? detection.path
      : path.join(baseDir, DEFAULT_SPECS_DIR, 'architecture.md');
    return {
      path: filePath,
      type: 'file',
      isNew: !detection.exists,
      reason: 'single-file mode'
    };
  }

  // Directory mode - route based on content
  const drId = extractDRPattern(content);

  // Route decision records
  if (drId) {
    // Try to find existing file with this DR
    const found = findFileContaining('architecture', drId, baseDir);
    if (found.file) {
      return {
        path: found.file,
        type: 'directory',
        isNew: false,
        reason: `updating existing decision ${drId}`
      };
    }

    // Check if decisions directory exists
    const decisionsDir = path.join(detection.path, '11-decisions');
    if (fs.existsSync(decisionsDir) && fs.statSync(decisionsDir).isDirectory()) {
      const drFile = path.join(decisionsDir, `${drId}.md`);
      return {
        path: drFile,
        type: 'directory',
        isNew: !fs.existsSync(drFile),
        reason: `decision record ${drId}`
      };
    }
  }

  // Check for component definitions
  if (content.toLowerCase().includes('component') ||
      content.includes('### 4.')) {
    const componentsDir = path.join(detection.path, '04-components');
    if (fs.existsSync(componentsDir) && fs.statSync(componentsDir).isDirectory()) {
      // Try to extract component name
      const componentMatch = content.match(/###\s+\d+\.\d+\s+([A-Za-z]+)/);
      if (componentMatch) {
        const componentFile = path.join(componentsDir, `${componentMatch[1].toLowerCase()}.md`);
        return {
          path: componentFile,
          type: 'directory',
          isNew: !fs.existsSync(componentFile),
          reason: `component ${componentMatch[1]}`
        };
      }
      return {
        path: path.join(componentsDir, '_index.md'),
        type: 'directory',
        isNew: !fs.existsSync(path.join(componentsDir, '_index.md')),
        reason: 'component section'
      };
    }
  }

  // Check for data architecture
  if (content.toLowerCase().includes('data architecture') ||
      content.toLowerCase().includes('schema') ||
      content.toLowerCase().includes('database')) {
    const dataPath = path.join(detection.path, '05-data.md');
    if (fs.existsSync(dataPath)) {
      return {
        path: dataPath,
        type: 'directory',
        isNew: false,
        reason: 'data architecture content'
      };
    }
  }

  // Check for security content
  if (content.toLowerCase().includes('security') ||
      content.toLowerCase().includes('authentication') ||
      content.toLowerCase().includes('authorization')) {
    const securityPath = path.join(detection.path, '07-security.md');
    if (fs.existsSync(securityPath)) {
      return {
        path: securityPath,
        type: 'directory',
        isNew: false,
        reason: 'security content'
      };
    }
  }

  // Default to _index.md
  return {
    path: path.join(detection.path, '_index.md'),
    type: 'directory',
    isNew: !fs.existsSync(path.join(detection.path, '_index.md')),
    reason: 'default location'
  };
}

/**
 * Route tasks content to appropriate file.
 *
 * Routing rules:
 * - Tasks with milestone -> specs/tasks/<milestone>/<TASK-NNN>.md
 * - Overview/index -> specs/tasks/_index.md
 * - Default -> specs/tasks/_index.md
 *
 * @param {string} content - Content to write
 * @param {string} baseDir - Base directory (defaults to current working directory)
 * @returns {{path: string, type: 'file'|'directory', isNew: boolean, reason: string}}
 */
function routeTasksContent(content, baseDir = process.cwd()) {
  const detection = detectSpecType('tasks', baseDir);

  // Single file mode - always return the file
  if (!detection.exists || detection.type === 'file') {
    const filePath = detection.exists
      ? detection.path
      : path.join(baseDir, DEFAULT_SPECS_DIR, 'tasks.md');
    return {
      path: filePath,
      type: 'file',
      isNew: !detection.exists,
      reason: 'single-file mode'
    };
  }

  // Directory mode - route based on content
  const { taskId, milestone } = extractTaskPattern(content);

  // Route tasks to milestone directories
  if (taskId) {
    // Try to find existing file with this task
    const found = findFileContaining('tasks', taskId, baseDir);
    if (found.file) {
      return {
        path: found.file,
        type: 'directory',
        isNew: false,
        reason: `updating existing task ${taskId}`
      };
    }

    // If we have a milestone, route to that directory
    if (milestone) {
      try {
        // Find the milestone directory (may have a name after the number)
        // e.g., M1, M1-authentication, M1_setup all match "M1"
        const entries = fs.readdirSync(detection.path);

        // Filter to directories that match the milestone pattern
        // Sort to prefer exact matches over prefixed ones (M1 before M1-foo before M10)
        const matchingDirs = entries
          .filter(e => {
            // Must start with the milestone (e.g., "M1")
            if (!e.startsWith(milestone)) return false;
            // Next character must be non-digit (to avoid M1 matching M10)
            const nextChar = e[milestone.length];
            return nextChar === undefined || !/\d/.test(nextChar);
          })
          .filter(e => {
            const fullPath = path.join(detection.path, e);
            return fs.statSync(fullPath).isDirectory();
          })
          .sort((a, b) => {
            // Prefer exact match
            if (a === milestone) return -1;
            if (b === milestone) return 1;
            // Then shorter names (M1-auth before M1-authentication-extended)
            return a.length - b.length;
          });

        if (matchingDirs.length > 0) {
          const milestoneDir = matchingDirs[0];
          const taskFile = path.join(detection.path, milestoneDir, `${taskId}.md`);
          return {
            path: taskFile,
            type: 'directory',
            isNew: !fs.existsSync(taskFile),
            reason: `task ${taskId} in ${milestone}`
          };
        } else {
          // Log warning when milestone directory is not found
          if (process.env.GROUNDWORK_DEBUG) {
            console.error(`[spec-router] Milestone directory not found for ${milestone} in ${detection.path}`);
          }
        }
      } catch (err) {
        // Directory unreadable, fall through to default
        if (process.env.GROUNDWORK_DEBUG) {
          console.error(`[spec-router] Error reading tasks directory: ${err.message}`);
        }
      }
    }
  }

  // Default to _index.md
  return {
    path: path.join(detection.path, '_index.md'),
    type: 'directory',
    isNew: !fs.existsSync(path.join(detection.path, '_index.md')),
    reason: 'default location'
  };
}

/**
 * Generic router that selects the appropriate routing function based on spec name.
 *
 * @param {string} specName - Name like 'product_specs', 'architecture', 'tasks'
 * @param {string} content - Content to write
 * @param {string} baseDir - Base directory (defaults to current working directory)
 * @returns {{path: string, type: 'file'|'directory', isNew: boolean, reason: string}}
 */
function routeContent(specName, content, baseDir = process.cwd()) {
  const normalizedName = specName.toLowerCase().replace(/-/g, '_');

  switch (normalizedName) {
    case 'product_specs':
    case 'prd':
      return routePRDContent(content, baseDir);

    case 'architecture':
    case 'arch':
      return routeArchitectureContent(content, baseDir);

    case 'tasks':
      return routeTasksContent(content, baseDir);

    default:
      // Unknown spec type - use simple path resolution
      const detection = detectSpecType(specName, baseDir);
      if (detection.exists && detection.type === 'directory') {
        return {
          path: path.join(detection.path, '_index.md'),
          type: 'directory',
          isNew: !fs.existsSync(path.join(detection.path, '_index.md')),
          reason: 'unknown spec type, using index'
        };
      }
      return {
        path: detection.path,
        type: 'file',
        isNew: !detection.exists,
        reason: 'unknown spec type'
      };
  }
}

module.exports = {
  routePRDContent,
  routeArchitectureContent,
  routeTasksContent,
  routeContent,
  extractPRDPattern,
  extractDRPattern,
  extractTaskPattern
};
