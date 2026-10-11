// _PATHS and _NEXT from src/case_api.py:28-40, verbatim (recommendation wording).

export const NEXT_STEP = 'A tax professional must review this result before anything is filed.'

export const PATHS: Readonly<Record<string, { id: string; label: string }>> = {
  'BLOCKED — Compliance gate failed': { id: 'blocked', label: 'Compliance block' },
  'Currently Not Collectible (CNC / Status 53)': { id: 'cnc', label: 'Currently not collectible' },
  'MANUAL REVIEW — negative income, meaningful equity present': { id: 'manual_equity', label: 'Manual review' },
  'Simple Payment Plan': { id: 'simple_plan', label: 'Simple payment plan' },
  'Non-Simple Installment Agreement': { id: 'non_simple_installment', label: 'Non-simple installment agreement' },
  'MANUAL REVIEW — payment resolution needs review': { id: 'manual_payment', label: 'Manual review' },
}

export const outcomeFor = (path: string): { id: string; label: string } | null =>
  Object.hasOwn(PATHS, path) ? PATHS[path] : null

// Recorded with every evaluation so a stored run names the engine that produced it.
export const ENGINE_VERSION = 'ts-port-1'
