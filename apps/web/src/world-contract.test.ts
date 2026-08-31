import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * WI-007 Task 16 — automated world-contract guard (ADR-007 R-1).
 *
 * kaddo guard (v3.68.0) has no custom pattern-rule mechanism (its guard
 * detects drift between modified code and knowledge artifacts only, see
 * `kaddo guard --help`), so the visual world contract is enforced here
 * as a grep-style test instead:
 *
 *   1. No `bg-blue-*` (or any Tailwind blue utility) anywhere in the
 *      app source — the ivory/slate/amber board is the committed world;
 *      the generic blue SaaS rut is the failure mode R-1 guards against.
 *   2. No Spanish UI copy (PRODUCT.md: English copy only) — matched
 *      against a curated list of Spanish words that cannot appear in
 *      English copy or code identifiers.
 */

const SRC_ROOT = fileURLToPath(new URL('.', import.meta.url))

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

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

describe('world contract guard (ADR-007 R-1)', () => {
  // This guard file itself names the banned Spanish markers, so it is the
  // one exclusion; every other source and test file is scanned.
  const scanned = collectSourceFiles(SRC_ROOT).filter(
    (file) => !file.endsWith('world-contract.test.ts'),
  )

  it('scans the whole app source tree', () => {
    expect(scanned.length).toBeGreaterThan(50)
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

  it('never ships Spanish UI copy (English only, PRODUCT.md)', () => {
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
