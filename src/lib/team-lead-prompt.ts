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
import { lobsterFetch } from './lobster-api'

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
1. Break complex work into sequential sub-tasks with blocked_by dependencies
2. Assign each sub-task to the most appropriate agent from Your Team
3. Set blocked_by to ensure correct execution order
4. Update your working_memory so colleagues know your status
5. When all sub-tasks complete, mark your parent task as done with a summary`

// ---------------------------------------------------------------------------
// Guide fragment fetcher — pulls from lobster via gateway
// ---------------------------------------------------------------------------

export async function fetchGuideFragments(names: string[]): Promise<string> {
  if (!names || names.length === 0) return ''
  try {
    const data = await lobsterFetch(`/api/guide-fragments/${names.join(',')}`)
    if (data?.fragments) {
      return data.fragments
        .filter((f: any) => f.content)
        .map((f: any) => f.content)
        .join('\n\n---\n\n')
    }
  } catch { /* gateway unreachable — skip fragments */ }
  return ''
}

// ---------------------------------------------------------------------------
// Prompt builder for Team Leads
// ---------------------------------------------------------------------------

export function buildTeamLeadSystemPrompt(
  teamLead: TeamLeadRow,
  task: DispatchableTaskExt,
  db: Database.Database,
  guideContent?: string,
): string {
  const parts: string[] = []

  // A. Role Definition
  parts.push(teamLead.soul_template || `# You are ${teamLead.display_name}\n\n${teamLead.description || ''}`)

  // B. SOP / Playbook
  if (teamLead.sop_content) {
    parts.push('\n## Your SOP / Playbook\n')
    parts.push(teamLead.sop_content)
  }

  // B2. Guide Fragments (from PROFESSIONAL_ENGINEERING_TEAM_GUIDE)
  if (guideContent) {
    parts.push('\n## Professional Standards (from Team Guide)\n')
    parts.push(guideContent)
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
  guideContent?: string,
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

  // D2. Guide Fragments
  if (guideContent) {
    parts.push('\n## Professional Standards (from Team Guide)\n')
    parts.push(guideContent)
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

  // I. Task completion instructions
  parts.push('\n## When Done')
  parts.push('Use mc_update_task({ id: YOUR_TASK_ID, status: "done", outcome: "summary" }) to mark complete.')
  parts.push('This will automatically unblock downstream tasks.')

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
