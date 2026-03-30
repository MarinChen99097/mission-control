import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/agents/health-summary - Aggregate agent status counts
 * Returns: { online: number, idle: number, busy: number, error: number, total: number }
 *
 * Status mapping:
 *   online = idle + busy (agents that are reachable and not in error)
 *   idle, busy, error = direct status counts from agents table
 *   total = all agents regardless of status
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = getDatabase();
    const workspaceId = auth.user.workspace_id ?? 1;

    const rows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM agents
      WHERE workspace_id = ?
      GROUP BY status
    `).all(workspaceId) as Array<{ status: string; count: number }>;

    let idle = 0;
    let busy = 0;
    let error = 0;
    let total = 0;

    for (const row of rows) {
      total += row.count;
      if (row.status === 'idle') idle = row.count;
      else if (row.status === 'busy') busy = row.count;
      else if (row.status === 'error') error = row.count;
    }

    return NextResponse.json({
      online: idle + busy,
      idle,
      busy,
      error,
      total,
    });
  } catch (error) {
    logger.error({ err: error }, 'GET /api/agents/health-summary error');
    return NextResponse.json({ error: 'Failed to fetch agent health summary' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
