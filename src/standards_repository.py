"""Database-backed IRS standards lookups.

The caller owns the PostgreSQL connection and passes this repository through
the determination flow. No IRS standard amounts or location mappings live in
Python; they are read from the lookup tables created by database_schema.sql.
"""

from __future__ import annotations

from typing import Any, Protocol


class StandardsLookupError(LookupError):
    """Raised when the database has no standard for the supplied variables."""


class StandardsRepository(Protocol):
    def national_amount(self, household_size: int) -> float: ...
    def health_care_amount(self, age: int) -> float: ...
    def transportation_area(self, state: str, county: str) -> str: ...
    def transportation_ownership_amount(self, vehicle_count: int) -> float: ...
    def transportation_operating_amount(self, area: str, vehicle_count: int) -> float: ...
    def housing_amount(self, state: str, county: str, household_size: int) -> float: ...


class PostgresStandardsRepository:
    """Read current standards from PostgreSQL using DB-API parameter binding."""

    def __init__(self, connection: Any) -> None:
        self._connection = connection

    def _one(self, query: str, parameters: tuple[object, ...], description: str) -> object:
        value = self._optional(query, parameters)
        if value is None:
            raise StandardsLookupError(f"No {description} found for supplied values.")
        return value

    def _optional(self, query: str, parameters: tuple[object, ...]) -> object | None:
        cursor = self._connection.cursor()
        try:
            cursor.execute(query, parameters)
            row = cursor.fetchone()
        finally:
            cursor.close()
        return None if row is None else row[0]

    def national_amount(self, household_size: int) -> float:
        return float(self._one("""
            WITH requested AS (SELECT GREATEST(%s, 1) AS household_size)
            SELECT standard.monthly_amount
                   + GREATEST(requested.household_size - standard.household_size, 0)
                     * standard.additional_person_amount
            FROM public.national_standards AS standard
            CROSS JOIN requested
            WHERE standard.household_size <= requested.household_size
            ORDER BY standard.household_size DESC
            LIMIT 1
        """, (household_size,), "national standard"))

    def health_care_amount(self, age: int) -> float:
        return float(self._one("""
            SELECT monthly_amount
            FROM public.health_care_standards
            WHERE minimum_age <= %s
              AND (maximum_age IS NULL OR maximum_age >= %s)
            ORDER BY minimum_age DESC
            LIMIT 1
        """, (age, age), "health-care standard"))

    def transportation_area(self, state: str, county: str) -> str:
        area = self._optional("""
            SELECT area
            FROM public.msa_county_standards
            WHERE state = public.canonical_state_name(%s)
              AND normalized_county = public.normalize_county_name(%s)
            ORDER BY source_row
            LIMIT 1
        """, (state, county))
        if area is not None:
            return str(area)
        return str(self._one("""
            SELECT region
            FROM public.state_region_standards
            WHERE state = public.canonical_state_name(%s)
        """, (state,), "state transportation region"))

    def transportation_ownership_amount(self, vehicle_count: int) -> float:
        return float(self._one("""
            SELECT monthly_amount
            FROM public.transportation_ownership_standards
            WHERE vehicle_count = LEAST(
                GREATEST(%s, 0),
                (SELECT MAX(vehicle_count) FROM public.transportation_ownership_standards)
            )
        """, (vehicle_count,), "transportation ownership standard"))

    def transportation_operating_amount(self, area: str, vehicle_count: int) -> float:
        return float(self._one("""
            SELECT monthly_amount
            FROM public.transportation_operating_standards
            WHERE area = %s
              AND vehicle_count = LEAST(
                  GREATEST(%s, 0),
                (SELECT MAX(vehicle_count) FROM public.transportation_operating_standards)
              )
        """, (area, vehicle_count), "transportation operating standard"))

    def housing_amount(self, state: str, county: str, household_size: int) -> float:
        return float(self._one("""
            WITH requested AS (SELECT GREATEST(%s, 1) AS household_size)
            SELECT standard.monthly_amount
            FROM public.housing_utilities_standards AS standard
            CROSS JOIN requested
            WHERE standard.state = public.canonical_state_name(%s)
              AND standard.normalized_county = public.normalize_county_name(%s)
            ORDER BY
                CASE WHEN standard.household_size <= requested.household_size THEN 0 ELSE 1 END,
                standard.household_size DESC,
                standard.source_row ASC
            LIMIT 1
        """, (household_size, state, county), "housing and utilities standard"))
