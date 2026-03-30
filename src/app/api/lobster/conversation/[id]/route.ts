import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { lobsterFetch } from '@/lib/lobster-api'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params
  return NextResponse.json(await lobsterFetch(`/api/conversation/${id}`))
}
