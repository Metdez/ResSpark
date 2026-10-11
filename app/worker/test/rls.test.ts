import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

// PLAT-02 proof from outside: the publishable key with no session (role anon)
// must be refused on every public table. Run with `pnpm -C app run test:rls`.
//
// Strict 401 + 42501 on purpose: `200 []` would let an empty table such as
// client_links pass while grants leak (RLS with no policies still answers 200 []
// when a grant exists). With grants revoked (F-5, F-6, migration 0002), Postgres
// raises 42501 and PostgREST maps it to 401 for anon.

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const key =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY

const BASELINE_TABLE_COUNT = 15
// 15 baseline tables (src/schemas/database_schema.sql) + 5 from migration 0002, sorted.
const TABLES = [
  'app_migrations',
  'case_financial_data',
  'cases',
  'client_links',
  'county_suffixes',
  'determination_runs',
  'document_extractions',
  'documents',
  'events',
  'firms',
  'health_care_standards',
  'housing_utilities_standards',
  'msa_county_standards',
  'national_standards',
  'question_definitions',
  'staff_profiles',
  'state_aliases',
  'state_region_standards',
  'transportation_operating_standards',
  'transportation_ownership_standards',
]

describe.skipIf(!url || !key)('anon is denied on every public table', () => {
  beforeAll(() => {
    const schema = readFileSync(
      fileURLToPath(
        // .href: the Workers and Node URL types clash under tsc.
        new URL('../../../src/schemas/database_schema.sql', import.meta.url)
          .href
      ),
      'utf8'
    )
    // A new baseline table must be added to TABLES too.
    expect(schema.match(/^CREATE TABLE /gm)?.length).toBe(BASELINE_TABLE_COUNT)
  })

  for (const table of TABLES) {
    it(table, async () => {
      // Always send apikey: without it the 401 comes from key validation, not grants.
      const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: key! },
      })
      const body: unknown = await res.json().catch(() => null)
      expect(res.status).toBe(401)
      expect((body as { code?: string } | null)?.code).toBe('42501')
    })
  }

  it('rpc log_event is not callable by anon', async () => {
    const res = await fetch(`${url}/rest/v1/rpc/log_event`, {
      method: 'POST',
      headers: { apikey: key!, 'content-type': 'application/json' },
      body: JSON.stringify({
        p_firm_id: null,
        p_case_id: null,
        p_request_id: null,
        p_actor_type: null,
        p_actor_id: null,
        p_action: null,
        p_payload: null,
      }),
    })
    expect([401, 404]).toContain(res.status)
  })
})
