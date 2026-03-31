export interface ThemeMeta {
  id: string
  label: string
  group: 'light' | 'dark'
  swatch: string
  background?: string
}

export const THEMES: ThemeMeta[] = [
  { id: 'void', label: 'Void', group: 'dark', swatch: '#22D3EE', background: 'void-bg' },
  { id: 'midnight-blue', label: 'Midnight Blue', group: 'dark', swatch: '#3B82F6' },
  { id: 'synthwave', label: 'Synthwave', group: 'dark', swatch: '#F472B6', background: 'synthwave-bg' },
  { id: 'solarized-dark', label: 'Solarized Dark', group: 'dark', swatch: '#B58900' },
  { id: 'catppuccin', label: 'Catppuccin Mocha', group: 'dark', swatch: '#CBA6F7' },
  { id: 'dracula', label: 'Dracula', group: 'dark', swatch: '#50FA7B' },
  { id: 'nord', label: 'Nord', group: 'dark', swatch: '#88C0D0' },
  { id: 'vercel', label: 'Vercel', group: 'dark', swatch: '#EDEDED' },
  { id: 'retro-terminal', label: 'Retro Terminal', group: 'dark', swatch: '#00FF41', background: 'terminal-bg' },
  { id: 'light', label: 'Light', group: 'light', swatch: '#6B7280' },
  { id: 'paper', label: 'Paper', group: 'light', swatch: '#8B6914' },
]

/** All theme IDs for the next-themes `themes` prop (includes 'system'). */
export const THEME_IDS = [...THEMES.map(t => t.id), 'system']

/** Default theme for each color mode group. */
export const DEFAULT_DARK_THEME = 'void'
export const DEFAULT_LIGHT_THEME = 'light'

/** Get the color mode group for a theme ID: 'dark', 'light', or 'system'. */
export function getColorMode(themeId: string | undefined): 'dark' | 'light' | 'system' {
  if (!themeId || themeId === 'system') return 'system'
  return isThemeDark(themeId) ? 'dark' : 'light'
}

/** Look up whether a theme is dark or light.
 *  For 'system', checks the OS preference via matchMedia. */
export function isThemeDark(themeId: string): boolean {
  if (themeId === 'system') {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return true
  }
  const meta = THEMES.find(t => t.id === themeId)
  return meta ? meta.group === 'dark' : true
}
