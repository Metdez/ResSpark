"""Standards facade used by the determination logic.

All values are provided by a caller-supplied database repository. This module
contains no IRS amount, state, county, or region data.
"""

from standards_repository import StandardsRepository


def national_standard(repository: StandardsRepository, household_size: int) -> float:
    return repository.national_amount(household_size)


def health_care_standard(repository: StandardsRepository, age: int) -> float:
    return repository.health_care_amount(age)


def transportation_area(repository: StandardsRepository, state: str, county: str) -> str:
    return repository.transportation_area(state, county)


def transportation_ownership_standard(repository: StandardsRepository, vehicle_count: int) -> float:
    return repository.transportation_ownership_amount(vehicle_count)


def transportation_operating_standard(
    repository: StandardsRepository, area: str, vehicle_count: int
) -> float:
    return repository.transportation_operating_amount(area, vehicle_count)


def housing_standard(
    repository: StandardsRepository, state: str, county: str, household_size: int
) -> float:
    return repository.housing_amount(state, county, household_size)
