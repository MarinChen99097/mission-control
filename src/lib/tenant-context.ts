/**
 * OrgOfClaws — Tenant Context & Query Scoping
 * ==============================================
 * Provides tenant-scoped database queries for Mission Control.
 * All multi-tenant tables (tasks, agents, comments, activities, etc.)
 * are filtered by workspace_id to enforce data isolation.
 *
 * Usage:
 *   import { TenantContext, withTenantScope } from '@/lib/tenant-context';
 *
 *   // In API route:
 *   const ctx = TenantContext.fromRequest(request, db);
 *   const tasks = ctx.query('tasks', 'SELECT * FROM tasks WHERE workspace_id = ?');
 *
 *   // Or as middleware wrapper:
 *   export const GET = withTenantScope(async (ctx) => {
 *     const tasks = ctx.all('SELECT * FROM tasks WHERE workspace_id = ?', ctx.workspaceId);
 *     return NextResponse.json(tasks);
 *   });
 */

import { NextResponse } from 'next/server';

export interface TenantInfo {
  tenantId: number;
  workspaceId: number;
  userId: number;
  userEmail: string;
  role: 'admin' | 'operator' | 'viewer';
}

// Tables that require workspace_id scoping
const SCOPED_TABLES = new Set([
  'tasks', 'agents', 'comments', 'activities', 'notifications',
  'projects', 'runs', 'skills', 'webhooks', 'webhook_deliveries',
  'workflow_templates', 'workflow_pipelines', 'pipeline_runs',
  'alert_rules', 'direct_connections', 'token_usage',
  'adapter_configs', 'project_agent_assignments', 'agent_trust_scores',
  'mcp_call_log', 'eval_runs', 'eval_golden_sets', 'eval_traces',
  'team_leads', 'messages', 'api_keys', 'security_events',
  'standup_reports', 'task_subscriptions', 'github_syncs',
  'agent_api_keys', 'gateway_health_logs',
]);

export class TenantContext {
  constructor(
    public readonly db: any,
    public readonly tenant: TenantInfo,
  ) {}

  get workspaceId(): number {
    return this.tenant.workspaceId;
  }

  get tenantId(): number {
    return this.tenant.tenantId;
  }

  get userId(): number {
    return this.tenant.userId;
  }

  get userEmail(): string {
    return this.tenant.userEmail;
  }

  get isAdmin(): boolean {
    return this.tenant.role === 'admin';
  }

  /**
   * Run a query scoped to this tenant's workspace.
   * Automatically appends workspace_id filter if the table is in SCOPED_TABLES.
   */
  scopedAll(sql: string, ...params: any[]): any[] {
    return this.db.prepare(sql).all(...params, this.workspaceId);
  }

  scopedGet(sql: string, ...params: any[]): any {
    return this.db.prepare(sql).get(...params, this.workspaceId);
  }

  scopedRun(sql: string, ...params: any[]): any {
    return this.db.prepare(sql).run(...params, this.workspaceId);
  }

  /**
   * Verify the caller has at least the required role level.
   */
  requireRole(minRole: 'viewer' | 'operator' | 'admin'): void {
    const levels = { viewer: 0, operator: 1, admin: 2 };
    if (levels[this.tenant.role] < levels[minRole]) {
      throw new Error(`Requires ${minRole} role`);
    }
  }

  /**
   * Verify an entity belongs to this workspace before modifying it.
   */
  verifyOwnership(table: string, id: number | string): boolean {
    if (!SCOPED_TABLES.has(table)) return true;

    const row = this.db.prepare(
      `SELECT workspace_id FROM ${table} WHERE id = ?`
    ).get(id);

    return row?.workspace_id === this.workspaceId;
  }

  /**
   * Insert a record with automatic workspace_id injection.
   */
  scopedInsert(table: string, data: Record<string, any>): any {
    if (SCOPED_TABLES.has(table)) {
      data.workspace_id = this.workspaceId;
    }

    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;

    return this.db.prepare(sql).run(...Object.values(data));
  }
}

/**
 * Higher-order function to wrap API routes with tenant context.
 * Handles JWT validation, tenant resolution, and error responses.
 *
 * Example:
 *   export const GET = withTenantScope(async (ctx, request) => {
 *     const tasks = ctx.scopedAll('SELECT * FROM tasks WHERE workspace_id = ?');
 *     return NextResponse.json(tasks);
 *   });
 */
export function withTenantScope(
  handler: (ctx: TenantContext, request: Request) => Promise<NextResponse>,
  options?: { minRole?: 'viewer' | 'operator' | 'admin' }
) {
  return async (request: Request): Promise<NextResponse> => {
    // Dynamic imports to avoid circular dependencies
    const { resolveRequestTenant } = await import('./jwt-auth');
    const { getDatabase } = await import('./db');

    const db = getDatabase();

    // Try Marketing Backend JWT first
    const resolved = await resolveRequestTenant(request, db);

    if (!resolved) {
      // Fallback: try MC's native session auth
      const { validateSession } = await import('./auth');
      const sessionToken = request.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];

      if (sessionToken) {
        const session = validateSession(sessionToken);
        if (session) {
          const ctx = new TenantContext(db, {
            tenantId: (session as any).tenant_id || 1,
            workspaceId: (session as any).workspace_id || 1,
            userId: session.id,
            userEmail: session.username,
            role: session.role || 'viewer',
          });

          if (options?.minRole) {
            try {
              ctx.requireRole(options.minRole);
            } catch {
              return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
            }
          }

          return handler(ctx, request);
        }
      }

      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ctx = new TenantContext(db, {
      tenantId: resolved.tenantId,
      workspaceId: resolved.workspaceId,
      userId: resolved.userId,
      userEmail: resolved.user.email,
      role: resolved.role as 'admin' | 'operator' | 'viewer',
    });

    if (options?.minRole) {
      try {
        ctx.requireRole(options.minRole);
      } catch {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    return handler(ctx, request);
  };
}
