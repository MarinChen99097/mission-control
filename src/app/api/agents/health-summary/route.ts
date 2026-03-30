import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/agents/health-summary - Agent Health Widget API
 *
 * Returns aggregated health status for all agents with per-agent details.
 * Uses a 30-second in-memory cache to avoid hitting the DB on every poll.
 *
 * Health classification (based on agent status + last_seen freshness):
 *   healthy  = status is 'idle' or 'busy' AND last_seen within 5 minutes
 *   degraded = status is 'error', OR last_seen between 5-15 minutes ago
 *   offline  = status is 'offline', OR last_seen > 15 minutes ago
 *   unknown  = never seen (last_seen is null)
 */

const HEALTHY_THRESHOLD_SEC = 5 * 60;   // 5 minutes
const DEGRADED_THRESHOLD_SEC = 15 * 60; // 15 minutes
const CACHE_TTL_MS = 30_000;            // 30 seconds

interface CacheEntry {
  data: any;
  timestamp: number;
}

// Per-workspace cache
const cache = new Map<number, CacheEntry>();

function classifyHealth(status: string, lastSeen: number | null): 'healthy' | 'degraded' | 'offline' | 'unknown' {
  if (lastSeen === null || lastSeen === undefined) return 'unknown';

  const now = Math.floor(Date.now() / 1000);
  const age = now - lastSeen;

  if (status === 'offline') return 'offline';
  if (status === 'error') return 'degraded';

  // idle or busy
  if (age <= HEALTHY_THRESHOLD_SEC) return 'healthy';
  if (age <= DEGRADED_THRESHOLD_SEC) return 'degraded';
  return 'offline';
}

function buildHealthSummary(workspaceId: number) {
  const db = getDatabase();

  const agents = db.prepare(`
    SELECT id, name, role, status, last_seen, last_activity, config
    FROM agents
    WHERE workspace_id = ? AND hidden = 0
    ORDER BY name ASC
  `).all(workspaceId) as Array<{
    id: number;
    name: string;
    role: string;
    status: string;
    last_seen: number | null;
    last_activity: string | null;
    config: string | null;
  }>;

  let healthy = 0;
  let degraded = 0;
  let offline = 0;
  let unknown = 0;

  const agentList = agents.map(agent => {
    const health = classifyHealth(agent.status, agent.last_seen);

    if (health === 'healthy') healthy++;
    else if (health === 'degraded') degraded++;
    else if (health === 'offline') offline++;
    else unknown++;

    return {
      name: agent.name,
      role: agent.role,
      status: health,
      raw_status: agent.status,
      last_heartbeat: agent.last_seen
        ? new Date(agent.last_seen * 1000).toISOString()
        : null,
      last_activity: agent.last_activity || null,
    };
  });

  return {
    total: agents.length,
    healthy,
    degraded,
    offline,
    unknown,
    agents: agentList,
  };
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const workspaceId = auth.user.workspace_id ?? 1;

    // Check cache
    const cached = cache.get(workspaceId);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    // Build fresh data
    const data = buildHealthSummary(workspaceId);

    // Update cache
    cache.set(workspaceId, { data, timestamp: now });

    return NextResponse.json(data);
  } catch (error) {
    logger.error({ err: error }, 'GET /api/agents/health-summary error');
    return NextResponse.json({ error: 'Failed to fetch agent health summary' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
