// D-11: a sync StandardsRepository over the one standards_bundle() JSON fetched per evaluation.
// Strict: a lookup for inputs other than the bundle's, or a null value, throws, never defaults.
import { type StandardsRepository, StandardsLookupError } from '../engine/standards'

export interface StandardsBundle {
  state: string
  county: string
  household_size: number
  vehicle_count: number
  national: number | null
  health_under_65: number | null
  health_65_plus: number | null
  transportation_area: string | null
  ownership: number | null
  operating: number | null
  housing: number | null
}

const AMOUNTS = ['national', 'health_under_65', 'health_65_plus', 'ownership', 'operating', 'housing'] as const

export const isStandardsBundle = (v: unknown): v is StandardsBundle => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const b = v as Record<string, unknown>
  return (
    typeof b.state === 'string' &&
    typeof b.county === 'string' &&
    Number.isInteger(b.household_size) &&
    Number.isInteger(b.vehicle_count) &&
    (b.transportation_area === null || typeof b.transportation_area === 'string') &&
    AMOUNTS.every((k) => b[k] === null || (typeof b[k] === 'number' && Number.isFinite(b[k])))
  )
}

export class BundleStandardsRepository implements StandardsRepository {
  constructor(private readonly bundle: StandardsBundle) {}

  private pick<T>(description: string, matches: boolean, value: T | null): T {
    if (!matches || value === null) throw new StandardsLookupError(`No ${description} found for supplied values.`)
    return value
  }

  private place(state: string, county: string): boolean {
    return state === this.bundle.state && county === this.bundle.county
  }

  nationalAmount(householdSize: number): number {
    return this.pick('national standard', householdSize === this.bundle.household_size, this.bundle.national)
  }

  // The engine asks for age 30 (under 65) and age 65 (65 or older); the bundle holds exactly those two.
  healthCareAmount(age: number): number {
    if (age === 30) return this.pick('health care standard', true, this.bundle.health_under_65)
    return this.pick('health care standard', age === 65, this.bundle.health_65_plus)
  }

  transportationArea(state: string, county: string): string {
    return this.pick('transportation area', this.place(state, county), this.bundle.transportation_area)
  }

  transportationOwnershipAmount(vehicleCount: number): number {
    return this.pick('ownership standard', vehicleCount === this.bundle.vehicle_count, this.bundle.ownership)
  }

  transportationOperatingAmount(area: string, vehicleCount: number): number {
    const matches = area === this.bundle.transportation_area && vehicleCount === this.bundle.vehicle_count
    return this.pick('operating standard', matches, this.bundle.operating)
  }

  housingAmount(state: string, county: string, householdSize: number): number {
    const matches = this.place(state, county) && householdSize === this.bundle.household_size
    return this.pick('housing standard', matches, this.bundle.housing)
  }
}
