from __future__ import annotations

from pathlib import Path
import sys
import unittest


SRC = Path(__file__).resolve().parents[1]
ROOT = SRC.parent
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from document_parse import parse_packet


class DocumentParseTests(unittest.TestCase):
    def test_example_packets_fill_case_columns(self):
        marcus = parse_packet(ROOT / "Examples/01_marcus_delgado_CNC")
        self.assertEqual(marcus["total_tax_owed"], 60000.0)
        self.assertEqual(marcus["tax_only_balance"], 44500.0)
        self.assertEqual(marcus["csed_months_remaining"], 79)
        self.assertFalse(marcus["filing_status_married"])
        self.assertEqual(marcus["state_of_residence"], "TX")
        self.assertEqual(marcus["pay_frequency"], "biweekly")
        self.assertEqual(marcus["gross_wages_taxpayer"], 2600.0)
        self.assertEqual(marcus["actual_current_taxes"], 380.9)
        self.assertEqual(marcus["actual_housing_utilities"], 1150.0)
        self.assertTrue(marcus["rents_home"])
        self.assertEqual(marcus["actual_vehicle_loan_lease"], 348.0)
        self.assertEqual(marcus["vehicle_loan_balances"], [9200.0])
        self.assertEqual(marcus["vehicle_count"], 1)
        self.assertNotIn("vehicle_market_values", marcus)
        self.assertEqual(marcus["actual_health_insurance_premiums"], 178.0)
        self.assertEqual(marcus["cash_and_bank_balances"], 578.81)
        self.assertFalse(marcus["has_unexplained_deposits"])
        self.assertEqual(marcus["unexplained_deposits_monthly"], 0.0)

        whitfield = parse_packet(ROOT / "Examples/02_whitfield_gregory_OIC")
        self.assertEqual(whitfield["total_tax_owed"], 82600.0)
        self.assertEqual(whitfield["tax_only_balance"], 60000.0)
        self.assertEqual(whitfield["csed_months_remaining"], 55)
        self.assertEqual(whitfield["state_of_residence"], "OH")
        self.assertEqual(whitfield["pay_frequency"], "semimonthly")
        self.assertEqual(whitfield["gross_wages_taxpayer"], 4200.0)
        self.assertEqual(whitfield["actual_current_taxes"], 1098.3)
        self.assertEqual(whitfield["actual_housing_utilities"], 1200.0)
        self.assertEqual(whitfield["vehicle_market_values"], [12000.0])
        self.assertEqual(whitfield["vehicle_loan_balance_total"], 9000.0)
        self.assertEqual(whitfield["cash_and_bank_balances"], 2305.9)
        self.assertFalse(whitfield["has_unexplained_deposits"])

        renata = parse_packet(ROOT / "Examples/03_renata_alves_streamlined_IA")
        self.assertEqual(renata["total_tax_owed"], 28000.0)
        self.assertEqual(renata["tax_only_balance"], 24000.0)
        self.assertEqual(renata["csed_months_remaining"], 91)
        self.assertEqual(renata["state_of_residence"], "FL")
        self.assertEqual(renata["gross_wages_taxpayer"], 6800.0)
        self.assertEqual(renata["actual_current_taxes"], 1472.2)
        self.assertEqual(renata["actual_housing_utilities"], 1850.0)
        self.assertEqual(renata["real_property_market_value"], 340000.0)
        self.assertEqual(renata["real_property_loan_balance"], 261000.0)
        self.assertTrue(renata["owns_home"])
        self.assertNotIn("vehicle_count", renata)
        self.assertEqual(renata["actual_health_insurance_premiums"], 260.0)
        self.assertEqual(renata["cash_and_bank_balances"], 6394.3)
        self.assertFalse(renata["has_unexplained_deposits"])


if __name__ == "__main__":
    unittest.main()
