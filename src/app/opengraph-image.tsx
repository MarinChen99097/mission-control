import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Org of Claws — AI Agent Team for Your Business'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage() {
  const isOrgOfClaws = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.MC_PUBLIC_BASE_URL ||
    ''
  ).includes('orgofclaws')

  if (!isOrgOfClaws) {
    // MC standalone: simple branded card
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ fontSize: 72, fontWeight: 800, color: '#58a6ff', display: 'flex' }}>
            Mission Control
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#8b949e',
              marginTop: 16,
              display: 'flex',
            }}
          >
            AI Agent Orchestration Dashboard
          </div>
        </div>
      ),
      { ...size },
    )
  }

  // OrgOfClaws branded OG image
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 40%, #7f1d1d 100%)',
          fontFamily: 'system-ui, sans-serif',
          padding: '60px',
          gap: '48px',
        }}
      >
        {/* Left: Text */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            gap: '16px',
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 900,
              color: '#ffffff',
              lineHeight: 1.1,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>Org of Claws</span>
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.85)',
              lineHeight: 1.4,
              display: 'flex',
            }}
          >
            Your AI Agent Team
          </div>
          <div
            style={{
              fontSize: 20,
              color: 'rgba(255,255,255,0.65)',
              lineHeight: 1.5,
              marginTop: 8,
              display: 'flex',
            }}
          >
            Marketing, Engineering, Sales & Ops — orchestrated by AI
          </div>
        </div>

        {/* Right: Lobster emoji as placeholder (real logo served via icon.png) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 280,
            height: 280,
            borderRadius: 40,
            background: 'rgba(255,255,255,0.15)',
            fontSize: 160,
          }}
        >
          🦞
        </div>
      </div>
    ),
    { ...size },
  )
}
