import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Automated world-contract guard for the shadcn/ui world.
 *
 * The UI foundation is shadcn/ui on Tailwind v4: the design tokens are
 * the standard shadcn variable set (`:root` / `.dark` in globals.css,
 * registered as utilities via `@theme inline`). This guard enforces:
 *
 *   1. The shadcn variable set exists in globals.css (the theming
 *      contract every ui/ primitive relies on).
 *   2. The retired "Operator's Board" token world (patch-amber,
 *      operators-ivory, slate-ink, hairline-slate, panel-warm,
 *      well-warm) and its legacy hexes are GONE from the source tree —
 *      no partial migrations, no reintroduced ivory/slate/amber classes.
 *   3. No Tailwind blue utilities anywhere (the generic blue SaaS rut
 *      stays banned in the new world too).
 *   4. No Spanish UI copy (PRODUCT.md: English copy only) — with ONE
 *      recorded exception: the marketing landing route group
 *      `app/(landing)/` (WI-010, explicit founder decision — the Spanish
 *      guest funnel at `/`). The exception is surgical; the board, the
 *      wizard, the plan surface, login, and the visitor chat stay
 *      English-only.
 */

const SRC_ROOT = fileURLToPath(new URL('.', import.meta.url))
const GLOBALS_CSS = join(SRC_ROOT, 'app', 'globals.css')

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(full))
    } else if (/\.(ts|tsx|css)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

/**
 * The shadcn theming contract: the variables every primitive reads.
 * (Dark-mode values are defined but never activated — dark mode is an
 * explicit follow-up — so only the light `:root` set is asserted.)
 */
const SHADCN_ROOT_VARIABLES = [
  '--background',
  '--foreground',
  '--card',
  '--popover',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--destructive',
  '--border',
  '--input',
  '--ring',
  '--radius',
]

/**
 * The retired visual world (ADR-007 / DC-007): token names that must not
 * reappear anywhere in the source tree. This guard file itself names
 * them, so it is the one exclusion.
 */
const RETIRED_TOKENS = [
  'patch-amber',
  'operators-ivory',
  'slate-ink',
  'hairline-slate',
  'panel-warm',
  'well-warm',
]

/** The retired palette's committed hex values, legacy-form. */
const RETIRED_HEXES = [
  '#b8860b',
  '#8a6508',
  '#f8f4e9',
  '#fdfbf4',
  '#ede7d3',
  '#2d3142',
  '#d6d2c4',
]

/**
 * Distinctive Spanish words (PRODUCT.md binds UI copy to English). Every
 * entry is a full Spanish lexeme that no English sentence or identifier
 * in this codebase legitimately contains — word boundaries keep English
 * lookalikes ("document", "client", "line") out of the matches.
 */
const SPANISH_COPY_MARKERS = [
  'configuración',
  'bienvenido',
  'bienvenida',
  'usuario',
  'usuarios',
  'nombre',
  'archivo',
  'archivos',
  'documento',
  'documentos',
  'pregunta',
  'preguntas',
  'respuesta',
  'respuestas',
  'línea',
  'líneas',
  'tablero',
  'créditos',
  'cancelar',
  'eliminar',
  'guardar',
  'enviar',
  'iniciar sesión',
  'cerrar sesión',
  'gracias',
  'por favor',
]

describe('world contract guard (shadcn/ui world)', () => {
  // This guard file itself names the banned markers, so it is the one
  // exclusion; the (landing) route group is the other — the recorded
  // WI-010 decision makes it the ONLY Spanish-copy surface in the
  // product. Every other source and test file is scanned.
  const scanned = collectSourceFiles(SRC_ROOT).filter(
    (file) =>
      !file.endsWith('world-contract.test.ts') && !file.includes('(landing)'),
  )

  it('scans the whole app source tree', () => {
    expect(scanned.length).toBeGreaterThan(50)
  })

  it('declares the shadcn variable set in globals.css', () => {
    const css = readFileSync(GLOBALS_CSS, 'utf8')
    // Match the real `:root {` block, not comment mentions of the token.
    const rootStart = css.indexOf(':root {')
    const darkStart = css.indexOf('.dark {')
    expect(rootStart, 'globals.css must declare a :root block').toBeGreaterThan(-1)
    expect(darkStart, 'globals.css must declare a .dark block').toBeGreaterThan(rootStart)
    const root = css.slice(rootStart, darkStart)
    const missing = SHADCN_ROOT_VARIABLES.filter((variable) => !root.includes(variable))
    expect(missing, `Missing shadcn variables in :root: ${missing.join(', ')}`).toEqual([])

    // The dark-mode block stays declared (the shadcn contract) but the
    // light scheme is pinned — nothing may activate .dark.
    expect(css).toContain('color-scheme: light')
  })

  it('retires the old Operator\'s Board tokens from the whole tree', () => {
    const offenders: Array<{ file: string; token: string }> = []
    for (const file of scanned) {
      const content = readFileSync(file, 'utf8')
      for (const token of RETIRED_TOKENS) {
        if (content.includes(token)) {
          offenders.push({ file, token })
        }
      }
    }
    expect(
      offenders,
      `Retired tokens found in: ${offenders.map((o) => `${o.file} (${o.token})`).join(', ')}`,
    ).toEqual([])
  })

  it('ships no legacy hex values from the retired palette', () => {
    const offenders: Array<{ file: string; hex: string }> = []
    for (const file of scanned) {
      const content = readFileSync(file, 'utf8')
      for (const hex of RETIRED_HEXES) {
        if (content.toLowerCase().includes(hex)) {
          offenders.push({ file, hex })
        }
      }
    }
    expect(
      offenders,
      `Legacy hex found in: ${offenders.map((o) => `${o.file} (${o.hex})`).join(', ')}`,
    ).toEqual([])
  })

  it('never uses Tailwind blue utilities (no bg-blue-*)', () => {
    const offenders: string[] = []
    for (const file of scanned) {
      const content = readFileSync(file, 'utf8')
      if (/\b(?:bg|text|border|ring|from|to|via|fill|stroke)-blue-/.test(content)) {
        offenders.push(file)
      }
    }
    expect(offenders, `Blue utilities found in: ${offenders.join(', ')}`).toEqual([])
  })

  it('never ships Spanish UI copy outside the landing surface (English only, PRODUCT.md + WI-010 exception)', () => {
    const offenders: Array<{ file: string; marker: string }> = []
    for (const file of scanned) {
      const content = readFileSync(file, 'utf8')
      for (const marker of SPANISH_COPY_MARKERS) {
        const pattern = new RegExp(`\\b${marker}\\b`, 'i')
        if (pattern.test(content)) {
          offenders.push({ file, marker })
        }
      }
    }
    expect(
      offenders,
      `Spanish copy found in: ${offenders.map((o) => `${o.file} (${o.marker})`).join(', ')}`,
    ).toEqual([])
  })
})
