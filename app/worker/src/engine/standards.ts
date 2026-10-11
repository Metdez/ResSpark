// Port of src/standards_repository.py (interface, error) and src/standards.py (facade).
// No IRS amount lives here: every value comes from the injected repository.

export interface StandardsRepository {
  nationalAmount(householdSize: number): number
  healthCareAmount(age: number): number
  transportationArea(state: string, county: string): string
  transportationOwnershipAmount(vehicleCount: number): number
  transportationOperatingAmount(area: string, vehicleCount: number): number
  housingAmount(state: string, county: string, householdSize: number): number
}

export class StandardsLookupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StandardsLookupError'
  }
}

export const nationalStandard = (
  repository: StandardsRepository,
  householdSize: number
): number => repository.nationalAmount(householdSize)

export const healthCareStandard = (
  repository: StandardsRepository,
  age: number
): number => repository.healthCareAmount(age)

export const transportationArea = (
  repository: StandardsRepository,
  state: string,
  county: string
): string => repository.transportationArea(state, county)

export const transportationOwnershipStandard = (
  repository: StandardsRepository,
  vehicleCount: number
): number => repository.transportationOwnershipAmount(vehicleCount)

export const transportationOperatingStandard = (
  repository: StandardsRepository,
  area: string,
  vehicleCount: number
): number => repository.transportationOperatingAmount(area, vehicleCount)

export const housingStandard = (
  repository: StandardsRepository,
  state: string,
  county: string,
  householdSize: number
): number => repository.housingAmount(state, county, householdSize)
