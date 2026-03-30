# Agent Health Widget — UI/UX Design Spec

**Ticket:** TASK-004 (Parent: TASK-001)
**Author:** design-lead
**Date:** 2026-03-31
**Status:** Final

---

## 1. Executive Summary

Redesign the Agent Health Widget's status model from `online/idle/busy/error` to `healthy/degraded/offline/unknown` to better reflect actual agent health semantics. The widget retains the existing donut chart + legend card layout that already ships in MC Dashboard, with updated colors, labels, and interaction states.

---

## 2. Layout Spec

### Widget Container
- **Component:** `.panel` (existing pattern)
- **Grid size:** `sm` (6 columns on desktop, 12 on tablet)
- **Min height:** 200px
- **Structure:**

```
┌──────────────────────────────────────────┐
│ panel-header                             │
│  "Agent Health"              [→ icon]    │
├──────────────────────────────────────────┤
│ panel-body  (flex row, gap-4)            │
│                                          │
│  ┌─────────┐   ┌──────────────────────┐  │
│  │  Donut  │   │  Legend Grid (2×2)   │  │
│  │  Chart  │   │  ┌────┐  ┌────┐     │  │
│  │  140×140 │   │  │ H  │  │ D  │     │  │
│  │         │   │  └────┘  └────┘     │  │
│  │  total  │   │  ┌────┐  ┌────┐     │  │
│  │  center │   │  │ O  │  │ U  │     │  │
│  └─────────┘   │  └────┘  └────┘     │  │
│                 └──────────────────────┘  │
└──────────────────────────────────────────┘
```

### Responsive Behavior

| Breakpoint | Layout | Notes |
|------------|--------|-------|
| Desktop (≥1280px) | `flex-row` — Donut left, Legend right | 6-col grid slot |
| Tablet (768–1279px) | `flex-row` — same, 12-col slot | Legend cards shrink |
| Mobile (<768px) | `flex-col` — Donut stacked above Legend | Donut centered |

### Spacing (matches existing `panel-body`)
- Panel padding: `p-4` (16px)
- Gap between donut and legend: `gap-4` (16px)
- Legend grid gap: `gap-2` (8px)
- Legend card internal padding: `px-2.5 py-2`

---

## 3. Color Definitions

### Status Colors (HSL, mapped to Void theme)

| Status | Hex | HSL | Semantic | Tailwind Token |
|--------|-----|-----|----------|----------------|
| **Healthy** | `#34D399` | 160 60% 52% | `void-mint` / `success` | `green-400` |
| **Degraded** | `#F59E0B` | 38 92% 50% | `void-amber` / `warning` | `amber-400` |
| **Offline** | `#6B7280` | 220 5% 46% | Neutral muted | `gray-500` |
| **Unknown** | `#8B5CF6` | 263 90% 66% | `void-violet` | `violet-400` |

### Per-Status CSS Classes

```typescript
const STATUS_COLORS = {
  healthy:  { stroke: '#34D399', bg: 'bg-green-500/15',  text: 'text-green-400',  border: 'border-green-500/30' },
  degraded: { stroke: '#F59E0B', bg: 'bg-amber-500/15',  text: 'text-amber-400',  border: 'border-amber-500/30' },
  offline:  { stroke: '#6B7280', bg: 'bg-gray-500/15',   text: 'text-gray-400',   border: 'border-gray-500/30' },
  unknown:  { stroke: '#8B5CF6', bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30' },
} as const
```

### Design Rationale
- **Healthy → Green:** Universal "good" signal, matches existing `success` semantic
- **Degraded → Amber:** Warning tone, matches existing `warning` semantic
- **Offline → Gray:** De-emphasized, clearly "inactive" without alarm
- **Unknown → Violet:** Distinct from error/warning, signals "needs attention" without panic. Uses existing `void-violet` accent.

---

## 4. Donut Chart Spec

| Property | Value |
|----------|-------|
| **Size** | 140×140px (SVG viewBox) |
| **Stroke width** | 18px |
| **Radius** | `(140 - 18) / 2 = 61px` |
| **Rotation** | `-90deg` (starts at 12 o'clock) |
| **Stroke linecap** | `butt` (clean segment boundaries) |
| **Segment order** | healthy → degraded → offline → unknown (clockwise) |
| **Center text (line 1)** | Total count, `text-2xl font-bold font-mono-tight`, `fill-foreground` |
| **Center text (line 2)** | "agents" label, `text-[10px]`, `fill-muted-foreground` |
| **Empty state** | Single gray ring (`text-secondary`), center shows `0` |
| **Transition** | `transition-all duration-500` on segment arcs |

### Accessibility
- `role="img"` on SVG root
- `aria-label="Agent health: {total} total"` on SVG
- Each segment: `role="button"`, `tabIndex={0}`, `aria-label="{status}: {count}"`
- Keyboard: `Enter` / `Space` triggers click action

---

## 5. Legend Cards Spec

### Grid
- `grid grid-cols-2 gap-2`
- Each card fills available width

### Card Structure
```
┌─────────────────┐
│ HEALTHY          │  ← text-2xs uppercase tracking-wide opacity-70
│ 12               │  ← text-lg font-bold font-mono-tight
└─────────────────┘
```

### Card Styles
- Base: `rounded-lg border px-2.5 py-2 text-left`
- Colors: `{bg} {border} {text}` from STATUS_COLORS
- Cursor: `cursor-pointer`
- Transition: `transition-all duration-200`

### Card States

| State | Effect |
|-------|--------|
| **Default** | Colored bg/border/text per status |
| **Hover** | `ring-1 ring-current scale-[1.02]` |
| **Donut segment hovered** | Same ring effect (synchronized) |
| **Focus** | Browser default focus ring (keyboard) |
| **Active/Click** | Navigates to Agent Squad filtered view |

---

## 6. Interaction Behavior

### Hover Synchronization
- Hovering a **donut segment** highlights the corresponding **legend card** (ring + scale)
- Hovering a **legend card** highlights the corresponding **donut segment** (`opacity-80`)
- State managed via `useState<StatusKey | null>`

### Click Actions

| Element | Action |
|---------|--------|
| Donut segment | `navigateToPanel('agents?status={key}')` |
| Legend card | `navigateToPanel('agents?status={key}')` |
| Panel header arrow icon | `navigateToPanel('agents')` (unfiltered) |

### Data Refresh
- Poll `/api/agents/health-summary` every **30 seconds**
- Silent failure — shows stale data on error
- No loading spinner (widget shows last known state)

---

## 7. Panel Header

```tsx
<div className="panel-header">
  <h3 className="text-sm font-semibold">{t('agentHealthTitle')}</h3>
  <button
    onClick={() => navigateToPanel('agents')}
    className="text-muted-foreground hover:text-foreground transition-smooth"
    aria-label="View all agents"
  >
    →
  </button>
</div>
```

---

## 8. i18n Keys

| Key | en | zh-TW |
|-----|----|-------|
| `dashboard.agentHealthTitle` | Agent Health | Agent 健康狀態 |
| `dashboard.agentHealthHealthy` | Healthy | 健康 |
| `dashboard.agentHealthDegraded` | Degraded | 異常 |
| `dashboard.agentHealthOffline` | Offline | 離線 |
| `dashboard.agentHealthUnknown` | Unknown | 未知 |
| `dashboard.agentTotal` | agents | agents |

---

## 9. API Contract

**Endpoint:** `GET /api/agents/health-summary`

**Response:**
```json
{
  "healthy": 5,
  "degraded": 2,
  "offline": 1,
  "unknown": 1,
  "total": 9
}
```

---

## 10. Implementation Delta (from current code)

The existing `agent-health-widget.tsx` is 95% reusable. Changes required:

| What | Current | Target |
|------|---------|--------|
| `HealthSummary` interface | `online, idle, busy, error` | `healthy, degraded, offline, unknown` |
| `STATUS_COLORS` keys | `online, idle, busy, error` | `healthy, degraded, offline, unknown` |
| `STATUS_COLORS.offline` color | n/a | gray-500 (new) |
| `STATUS_COLORS.unknown` color | n/a | violet-500 (new) |
| i18n keys | `agentHealthOnline`, etc. | `agentHealthHealthy`, etc. |
| Panel header | No navigation arrow | Add `→` button |
| API response shape | `{ online, idle, busy, error, total }` | `{ healthy, degraded, offline, unknown, total }` |

**DonutChart component:** No changes needed — it's generic and accepts any segments array.

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| API not yet returning new status keys | Widget falls back to 0 for missing keys; graceful degradation |
| Color-blind users can't distinguish green/amber | Labels + numbers always visible; not relying on color alone |
| Tablet layout too cramped with 4 legend cards | 2×2 grid tested; cards have min internal padding |

---

## 12. Handoff

- **To Engineering (frontend):** Implement status key rename + color updates in `agent-health-widget.tsx`
- **To Engineering (backend):** Update `/api/agents/health-summary` to return new status keys
- **To QA (journey-qa):** Verify hover sync, click navigation, responsive breakpoints, keyboard accessibility
