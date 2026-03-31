/**
 * Dynamic Prompt Assembly for Team Leads and Agents.
 *
 * When a task is dispatched, this module builds a rich system + user prompt
 * that tells the agent exactly:
 *   - Who they are (soul)
 *   - Their SOP / playbook
 *   - Which agents they can spawn (agent_types)
 *   - Which skills they can use (gstack skills)
 *   - Which MCP tools are available
 *   - Team working memory (what colleagues are doing)
 *   - Dependency context (outcomes of predecessor tasks)
 *   - How to create sub-tasks via MC API
 */

import type Database from 'better-sqlite3'

export interface TeamLeadRow {
  id: number
  name: string
  display_name: string
  description: string | null
  icon: string
  keywords: string
  skills: string
  agent_types: string
  mcp_scopes: string
  soul_template: string | null
  sop_content: string | null
  task_creation_instructions: string | null
  workspace_id: number
}

export interface DispatchableTaskExt {
  id: number
  title: string
  description: string | null
  priority: string
  team: string | null
  blocked_by: string | null
  parent_task_id: number | null
  ticket_prefix: string | null
  project_ticket_no: number | null
  workspace_id: number
  agent_name: string
  agent_id: number
  agent_config: string | null
  tags?: string[]
}

interface AgentMemoryRow {
  name: string
  status: string
  working_memory: string
}

interface TaskDepRow {
  id: number
  title: string
  status: string
  outcome: string | null
}

const DEFAULT_TASK_INSTRUCTIONS = `Use the MCP tool mc_create_task to create sub-tasks:

mc_create_task({
  title: "Sub-task title",
  description: "What needs to be done",
  assigned_to: "agent-name",
  parent_task_id: YOUR_TASK_ID,
  blocked_by: [],
  team: "your-team",
  priority: "medium"
})

When you finish a sub-task or your own task:
mc_update_task({ id: TASK_ID, status: "done", outcome: "Summary of what was accomplished" })

Rules:
1. BEFORE creating sub-tasks, check if there are already sub-tasks for your task (parent_task_id = YOUR_TASK_ID). Do NOT create duplicates — reuse existing sub-tasks instead.
2. Break complex work into sequential sub-tasks with blocked_by dependencies.
3. ALWAYS assign sub-tasks to specialized agents from Your Team — do NOT assign to yourself. You are the lead, not the executor. For example: assign backend work to "backend-architect", frontend to "frontend-developer", reviews to "code-reviewer", deploy to "devops-automator".
4. Set blocked_by to ensure correct execution order.
5. Update your working_memory so colleagues know your status.
6. When all sub-tasks complete, mark your parent task as done with a summary.

## Quality Gate Types
HARD gates (must pass to proceed — reviewer can reject and send back):
- plan-reviewer reviewing planner output
- code-reviewer reviewing coder output
- devops pre-deploy checks (tsc, tests, build)
- devops post-deploy auth smoke test

SOFT gates (advisory — log findings but don't block):
- security-engineer audit (run in parallel with code review)
- compliance-auditor check

For HARD gates: blocked_by the reviewer task.
For SOFT gates: run in PARALLEL with the next phase, do NOT block deployment.`

// ---------------------------------------------------------------------------
// Prompt builder for Team Leads
// NOTE: Guide fragments are injected by the lobster's task-executor.js locally,
// not here. MC is just a display layer.
// ---------------------------------------------------------------------------

export function buildTeamLeadSystemPrompt(
  teamLead: TeamLeadRow,
  task: DispatchableTaskExt,
  db: Database.Database,
): string {
  const parts: string[] = []

  // A. Role Definition
  parts.push(teamLead.soul_template || `# You are ${teamLead.display_name}\n\n${teamLead.description || ''}`)

  // B. SOP / Playbook
  if (teamLead.sop_content) {
    parts.push('\n## Your SOP / Playbook\n')
    parts.push(teamLead.sop_content)
  }

  // C. Your Team — agent_types
  const agentTypes = safeJsonArray(teamLead.agent_types)
  if (agentTypes.length > 0) {
    parts.push('\n## Your Team — Agents you can assign tasks to')
    parts.push('| Agent Type | How to assign |')
    parts.push('|------------|---------------|')
    for (const at of agentTypes) {
      const agentName = String(at).toLowerCase().replace(/ /g, '-')
      parts.push(`| ${at} | mc_create_task assigned_to="${agentName}" |`)
    }
  }

  // D. Your Skills
  const skills = safeJsonArray(teamLead.skills)
  if (skills.length > 0) {
    parts.push('\n## Your Skills — Commands you can use directly')
    parts.push(skills.join(', '))
  }

  // E. Task Creation Instructions
  parts.push('\n## How to Create Sub-tasks')
  parts.push(teamLead.task_creation_instructions || DEFAULT_TASK_INSTRUCTIONS)

  // F. Team Working Memory
  appendTeamWorkingMemory(parts, db, task.workspace_id)

  // G. Dependency Context
  appendDependencyContext(parts, db, task)

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Prompt builder for regular Agents (execution layer)
// ---------------------------------------------------------------------------

export function buildAgentSystemPrompt(
  task: DispatchableTaskExt,
  db: Database.Database,
): string | null {
  // Read agent's soul_content and config
  const agentRow = db.prepare(
    'SELECT soul_content, config FROM agents WHERE id = ? AND workspace_id = ?'
  ).get(task.agent_id, task.workspace_id) as { soul_content: string | null; config: string | null } | undefined

  if (!agentRow?.soul_content && !agentRow?.config) return null

  const parts: string[] = []
  const config = safeJsonObject(agentRow?.config)

  // A. Soul / Role definition
  if (agentRow?.soul_content) {
    parts.push(agentRow.soul_content)
  }

  // B. Skills from config
  const skills = Array.isArray(config.skills) ? config.skills : []
  if (skills.length > 0) {
    parts.push('\n## Your Skills')
    parts.push(skills.join(', '))
  }

  // C. Agent types this agent can spawn
  const agentTypes = Array.isArray(config.agent_types) ? config.agent_types : []
  if (agentTypes.length > 0) {
    parts.push('\n## Agents you can spawn as sub-agents')
    for (const at of agentTypes) {
      parts.push(`- ${at}`)
    }
  }

  // D. MCP tools
  const mcpTools = Array.isArray(config.mcp_tools) ? config.mcp_tools : []
  if (mcpTools.length > 0) {
    parts.push('\n## Your MCP Tools')
    for (const tool of mcpTools) {
      parts.push(`- ${tool}`)
    }
  }

  // E. Output format
  if (config.output_format) {
    parts.push('\n## Output Format')
    parts.push(`Use the "${config.output_format}" output format.`)
  }

  // F. Handoff
  const handoff = Array.isArray(config.handoff_to) ? config.handoff_to : []
  if (handoff.length > 0) {
    parts.push('\n## After Completion')
    parts.push(`Your output will be handed off to: ${handoff.join(', ')}`)
    parts.push('Make sure your output contains everything they need.')
  }

  // G. Team Working Memory
  appendTeamWorkingMemory(parts, db, task.workspace_id)

  // H. Dependency Context
  appendDependencyContext(parts, db, task)

  // I. Role-specific instructions
  const agentName = task.agent_name.toLowerCase()
  const isReviewer = ['code-reviewer', 'plan-reviewer', 'security-engineer', 'compliance-auditor', 'integration-checker'].includes(agentName)
  const isCoder = ['backend-architect', 'frontend-developer', 'software-architect', 'database-optimizer'].includes(agentName)
  const isDevops = agentName === 'devops-automator'

  if (isReviewer) {
    parts.push('\n## Reviewer Protocol')
    parts.push(`You are a REVIEWER. Your job is to find real issues, not rubber-stamp.

If the work PASSES:
  mc_update_task({ id: YOUR_TASK_ID, status: "done", outcome: "PASS: <brief summary>" })

If the work FAILS (HARD gate — code-reviewer, plan-reviewer):
  1. Add a comment to the UPSTREAM task (the one you reviewed) with specific, actionable feedback:
     mc_add_comment({ id: UPSTREAM_TASK_ID, content: "Rework requested: <specific issues>" })
  2. Send the upstream task back for rework:
     mc_update_task({ id: UPSTREAM_TASK_ID, status: "rework_requested" })
  3. Do NOT mark your own task as done. Wait for the rework.
  Max rework cycles: 2. If upstream already reworked 2x, approve with caveats or mark your task failed.

If the work has FINDINGS but is acceptable (SOFT gate — security-engineer, compliance-auditor):
  mc_update_task({ id: YOUR_TASK_ID, status: "done", outcome: "PASS with findings: <list issues>" })
  Findings are advisory. Do NOT block the pipeline for theoretical issues.`)
  } else if (isCoder) {
    parts.push('\n## Coder Self-Verification Protocol')
    parts.push(`BEFORE marking your task as done, you MUST run these checks:

1. TypeScript compilation (if .ts/.tsx files changed):
   Run: npx tsc --noEmit
   FAIL = fix before marking done. Do NOT submit broken types.

2. Existing tests (if test files exist):
   Run: pnpm test (or pytest for Python)
   FAIL = fix before marking done.

3. Build check (if frontend repo):
   Run: pnpm build
   FAIL = fix before marking done.

4. Self-review your own diff:
   Run: git diff
   Check for: hardcoded secrets, debug console.log, TODO/FIXME left in, any file you didn't intend to change.

Only after ALL checks pass:
  mc_update_task({ id: YOUR_TASK_ID, status: "done", outcome: "summary + verification results" })

If you receive a rework_requested task, a reviewer found issues. Read the comments for specific feedback and address EVERY point.`)
  } else if (isDevops) {
    parts.push('\n## DevOps Verification Protocol')
    parts.push(`You MUST run checks in order. Do not skip steps.

### Phase 1: Pre-Deploy (HARD GATE — block push if any fail)
- [ ] TypeScript: npx tsc --noEmit (frontend repos)
- [ ] Tests: pnpm test or pytest (if tests exist)
- [ ] Build: pnpm build (frontend repos)
If any fail: fix if trivial, otherwise mark task FAILED. Do NOT push broken code.

### Phase 2: Deploy
- git add + commit (Conventional Commits format) + push
- Monitor Cloud Build until SUCCESS or FAILURE
- Confirm new Cloud Run revision serving

### Phase 3: Post-Deploy (HARD GATE)
- [ ] Auth smoke: curl WITHOUT token → expect 401/403. curl WITH test token → expect 200
- [ ] Modified endpoints: happy path + one edge case (empty body, missing field)
- [ ] GCP error log: severity>=ERROR in last 3 minutes → expect 0
- [ ] Frontend check: /browse if UI changes, check console errors

### Phase 4: Traffic
- gcloud run services update-traffic --to-latest
- Only after Phase 3 passes

Record ALL results in your task outcome with pass/fail for each check.
If post-deploy fails: rollback traffic to previous revision, mark task FAILED.`)
  } else {
    parts.push('\n## When Done')
    parts.push('Use mc_update_task({ id: YOUR_TASK_ID, status: "done", outcome: "summary" }) to mark complete.')
    parts.push('This will automatically unblock downstream tasks.')
  }

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Build user prompt (shared for both team leads and agents)
// ---------------------------------------------------------------------------

export function buildDispatchUserPrompt(
  task: DispatchableTaskExt,
  rejectionFeedback?: string | null,
): string {
  const ticket = task.ticket_prefix && task.project_ticket_no
    ? `${task.ticket_prefix}-${String(task.project_ticket_no).padStart(3, '0')}`
    : `TASK-${task.id}`

  const lines = [
    `**[${ticket}] ${task.title}**`,
    `Priority: ${task.priority}`,
  ]

  if (task.tags && task.tags.length > 0) {
    lines.push(`Tags: ${task.tags.join(', ')}`)
  }

  if (task.parent_task_id) {
    lines.push(`Parent Task: TASK-${task.parent_task_id}`)
  }

  if (task.team) {
    lines.push(`Team: ${task.team}`)
  }

  if (task.description) {
    lines.push('', task.description)
  }

  if (rejectionFeedback) {
    lines.push('', '## Previous Review Feedback', rejectionFeedback, '', 'Please address this feedback.')
  }

  lines.push('', 'Complete this task. Be concise and actionable.')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appendTeamWorkingMemory(parts: string[], db: Database.Database, workspaceId: number): void {
  try {
    const rows = db.prepare(`
      SELECT name, status, working_memory FROM agents
      WHERE workspace_id = ? AND working_memory IS NOT NULL AND working_memory != ''
      LIMIT 20
    `).all(workspaceId) as AgentMemoryRow[]

    if (rows.length > 0) {
      parts.push('\n## Team Working Memory (colleague status)')
      for (const r of rows) {
        parts.push(`- **${r.name}** (${r.status}): ${r.working_memory.slice(0, 200)}`)
      }
    }
  } catch { /* ignore if table doesn't exist yet */ }
}

function appendDependencyContext(parts: string[], db: Database.Database, task: DispatchableTaskExt): void {
  const blockedByIds = safeJsonArray(task.blocked_by).map(Number).filter(n => n > 0)
  if (blockedByIds.length === 0) return

  try {
    const placeholders = blockedByIds.map(() => '?').join(',')
    const deps = db.prepare(`
      SELECT id, title, status, outcome FROM tasks
      WHERE id IN (${placeholders}) AND workspace_id = ?
    `).all(...blockedByIds, task.workspace_id) as TaskDepRow[]

    const completed = deps.filter(d => d.status === 'done')
    if (completed.length > 0) {
      parts.push('\n## Completed Dependencies (results from predecessor tasks)')
      for (const d of completed) {
        parts.push(`- **[TASK-${d.id}] ${d.title}**: ${d.outcome || '(no outcome recorded)'}`)
      }
    }

    const pending = deps.filter(d => d.status !== 'done')
    if (pending.length > 0) {
      parts.push('\n## Pending Dependencies (still in progress)')
      for (const d of pending) {
        parts.push(`- [TASK-${d.id}] ${d.title} — status: ${d.status}`)
      }
    }
  } catch { /* ignore */ }
}

function safeJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function safeJsonObject(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Team Lead lookup
// ---------------------------------------------------------------------------

export function findTeamLeadForAgent(
  db: Database.Database,
  agentName: string,
  workspaceId: number,
): TeamLeadRow | null {
  try {
    return db.prepare(
      'SELECT * FROM team_leads WHERE name = ? AND workspace_id = ? AND enabled = 1'
    ).get(agentName, workspaceId) as TeamLeadRow | null
  } catch {
    return null
  }
}
