# Agent Health Widget — UI/UX Design Specification

**Task:** TASK-4 (Sub-task of TASK-1)
**Author:** Design Lead
**Date:** 2026-03-31
**Status:** Final

---

## Executive Summary

Design specification for the Agent Health Widget on the MC Dashboard. The widget already exists (`agent-health-widget.tsx`) with a custom SVG donut chart and 4-status legend. This spec **remaps the statuses** to the requested `healthy / degraded / offline / unknown` taxonomy and documents the complete visual contract for engineering handoff.

## Key Judgment

The existing widget architecture is solid — custom SVG donut, hover/click interactivity, 2-column legend grid, `panel` container. **No structural rewrite needed.** The change is a status taxonomy remap + color adjustment to align with the infrastructure health semantics requested in TASK-1.

---

## 1. Status Taxonomy Mapping

| New Status | Old Status | Meaning |
|-----------|-----------|---------|
| `healthy` | `online` | Agent responding, heartbeat normal |
| `degraded` | `busy` / `idle` | Agent responding but slow or overloaded |
| `offline` | `error` | Agent not responding, heartbeat missed |
| `unknown` | *(new)* | No heartbeat data, newly registered |

---

## 2. Color Definitions

### Status Colors (Dark Theme — Void Palette)

| Status | Stroke (SVG) | Background | Text | Border | Semantic |
|--------|-------------|------------|------|--------|----------|
| `healthy` | `#34D399` (green-400) | `bg-green-500/15` | `text-green-400` | `border-green-500/30` | Success / Mint |
| `degraded` | `#F59E0B` (amber-400) | `bg-amber-500/15` | `text-amber-400` | `border-amber-500/30` | Warning / Amber |
| `offline` | `#DC2626` (red-600) | `bg-red-500/15` | `text-red-400` | `border-red-500/30` | Destructive / Crimson |
| `unknown` | `#6B7280` (gray-500) | `bg-gray-500/15` | `text-gray-400` | `border-gray-500/30` | Neutral / Muted |

### Donut Empty State
- Background ring: `text-secondary` (HSL 220 25% 11%)

---

## 3. Layout Specification

### Widget Container
```
┌─────────────────────────────────────┐
│ panel                               │
│ ┌─ panel-header ──────────────────┐ │
│ │ "Agent Health"           [→]    │ │
│ └─────────────────────────────────┘ │
│ ┌─ panel-body ────────────────────┐ │
│ │                                 │ │
│ │  ┌─────────┐  ┌──────────────┐  │ │
│ │  │  DONUT  │  │ 2×2 Legend   │  │ │
│ │  │  CHART  │  │   Grid       │  │ │
│ │  │  140px  │  │              │  │ │
│ │  └─────────┘  └──────────────┘  │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Dimensions

| Element | Value |
|---------|-------|
| Widget grid size | `sm` (6 cols on xl, full-width on mobile) |
| Donut chart diameter | `140px` |
| Donut stroke width | `18px` |
| Donut inner radius | `(140 - 18) / 2 = 61px` |
| Center number font | `text-2xl font-bold font-mono-tight` (24px) |
| Center label font | `text-[10px]` (10px, muted-foreground) |
| Legend grid | `grid-cols-2 gap-2` |
| Legend card padding | `px-2.5 py-2` |
| Legend label font | `text-2xs uppercase tracking-wide opacity-70` |
| Legend value font | `text-lg font-bold font-mono-tight` (18px) |
| Panel header | `text-sm font-semibold` (14px) |
| Content gap (donut ↔ legend) | `gap-4` (16px) |

### Responsive Behavior

| Breakpoint | Layout |
|-----------|--------|
| `≥ 640px` (sm+) | Horizontal: donut left, legend right (`flex-row`) |
| `< 640px` | Vertical: donut top, legend bottom (`flex-col`) |
| Tablet (md) | Widget occupies 4 grid columns, horizontal layout |
| Desktop (xl) | Widget occupies 6 grid columns, horizontal layout |

---

## 4. Interaction Behavior

### Hover — Donut Segment
- **Trigger:** `mouseenter` on SVG circle segment
- **Effect:** Segment opacity → `0.8`, transition `200ms`
- **Linked:** Corresponding legend card gets `ring-1 ring-current scale-[1.02]`
- **Exit:** `mouseleave` → revert all effects

### Hover — Legend Card
- **Trigger:** `mouseenter` on legend button
- **Effect:** Card scales to `1.02`, gains `ring-1 ring-current`
- **Linked:** Corresponding donut segment highlights (shared `hoveredStatus` state)
- **Exit:** `mouseleave` → revert

### Click — Donut Segment or Legend Card
- **Action:** Navigate to Agent Squad panel filtered by status
- **Route:** `navigateToPanel('agents?status={statusKey}')`
- **Cursor:** `cursor-pointer` on both elements

### Keyboard
- **Focus:** Donut segments have `tabIndex={0}`, `role="button"`
- **Activation:** `Enter` or `Space` → same as click
- **Tab order:** Segments in order: healthy → degraded → offline → unknown

### Empty State (total = 0)
- Single gray ring, `text-secondary` stroke
- Center text: `0` in `text-2xl font-bold`
- No legend interaction

### Data Refresh
- **Polling:** `/api/agents/health-summary` every `30s`
- **Transition:** Value changes animate with `transition-all duration-500`

---

## 5. Accessibility

| Requirement | Implementation |
|-------------|---------------|
| ARIA label (chart) | `role="img" aria-label="Agent health: {total} total"` |
| ARIA label (segment) | `aria-label="{status}: {count}"` |
| Keyboard navigation | `tabIndex={0}` on each segment |
| Color contrast | All text colors pass WCAG AA on dark background |
| Color-blind safe | Status also communicated via text labels (not color alone) |

---

## 6. Data Contract

### API: `GET /api/agents/health-summary`

```typescript
interface HealthSummary {
  healthy: number
  degraded: number
  offline: number
  unknown: number
  total: number
}
```

### Segments Array (Frontend)

```typescript
const STATUS_COLORS = {
  healthy:  { stroke: '#34D399', bg: 'bg-green-500/15',  text: 'text-green-400', border: 'border-green-500/30' },
  degraded: { stroke: '#F59E0B', bg: 'bg-amber-500/15',  text: 'text-amber-400', border: 'border-amber-500/30' },
  offline:  { stroke: '#DC2626', bg: 'bg-red-500/15',    text: 'text-red-400',   border: 'border-red-500/30' },
  unknown:  { stroke: '#6B7280', bg: 'bg-gray-500/15',   text: 'text-gray-400',  border: 'border-gray-500/30' },
} as const

const segments = [
  { key: 'healthy',  value: health.healthy,  color: STATUS_COLORS.healthy.stroke,  label: t('agentHealthHealthy') },
  { key: 'degraded', value: health.degraded, color: STATUS_COLORS.degraded.stroke, label: t('agentHealthDegraded') },
  { key: 'offline',  value: health.offline,  color: STATUS_COLORS.offline.stroke,  label: t('agentHealthOffline') },
  { key: 'unknown',  value: health.unknown,  color: STATUS_COLORS.unknown.stroke,  label: t('agentHealthUnknown') },
]
```

---

## 7. i18n Keys Required

```json
{
  "agentHealthTitle": "Agent Health",
  "agentHealthHealthy": "Healthy",
  "agentHealthDegraded": "Degraded",
  "agentHealthOffline": "Offline",
  "agentHealthUnknown": "Unknown",
  "agentTotal": "agents"
}
```

---

## 8. Implementation Notes for Engineering

1. **File to modify:** `src/components/dashboard/widgets/agent-health-widget.tsx`
2. **Rename** `HealthSummary` fields: `online→healthy`, `idle+busy→degraded`, `error→offline`, add `unknown`
3. **Update** `STATUS_COLORS` keys and add `unknown` with gray palette
4. **Backend mapping:** Adjust `/api/agents/health-summary` to return the new taxonomy — or map at the frontend if backend already returns compatible data
5. **DonutChart component** is reusable as-is — no changes needed to the SVG rendering logic
6. **Legend grid** stays `grid-cols-2` — 4 statuses fit perfectly in 2×2

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Backend returns old status keys | Add frontend mapper: `online→healthy`, `error→offline`, etc. |
| `unknown` status never populated | Default to `0`, widget handles gracefully |
| Color-blind users can't distinguish green/amber | Labels always visible; consider adding icons in future iteration |

---

## Handoff

- **To:** `frontend` engineer — implement code changes per Section 8
- **To:** `backend` engineer — update health-summary API response shape
- **Verify with:** `/design-review` after implementation
