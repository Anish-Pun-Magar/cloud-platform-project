import tempfile
import unittest
from pathlib import Path
import sys

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "engine"))
import processor


class BasicProcessorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_encoding_delimiter_and_basic_cleaning(self):
        source = self.root / "input.csv"
        source.write_bytes("Full Name;Age;Price;Joined Date;Active;Email;Phone;City\n Ana  Lee ;25;$1,200;Jan 7 2026;Y;ANA@example.com;+977 980-123-4567;서울\nBad;140;$-2;bad-date;maybe;bad-email;invalid;부산\n".encode("cp949"))
        raw, encoding, delimiter = processor.read_csv(source)
        clean, issues, rejected, report = processor.clean_data(raw)
        self.assertEqual((encoding, delimiter), ("cp949", ";"))
        self.assertEqual(clean.loc[0, "full_name"], "Ana Lee")
        self.assertEqual(clean.loc[0, "price"], 1200)
        self.assertEqual(clean.loc[0, "joined_date"], "2026-01-07")
        self.assertEqual(clean.loc[0, "active"], True)
        self.assertEqual(clean.loc[0, "email"], "ana@example.com")
        self.assertEqual(str(clean["age"].dtype), "Int64")
        self.assertEqual(clean.loc[0, "phone"], "+9779801234567")
        self.assertEqual(len(rejected), 1)
        self.assertIn("age", rejected.loc[0, "rejection_reason"])
        self.assertEqual(report["rows_before"], 2)

    def test_utf8_and_latin1_are_detected(self):
        for filename, encoding, separator, content in (
            ("utf.csv", "utf-8-sig", ",", "city,value\n서울,1\n"),
            ("latin.tsv", "latin-1", "\t", "city\tvalue\ncafé\t1\n"),
        ):
            path = self.root / filename
            path.write_bytes(content.encode(encoding))
            _, found_encoding, found_separator = processor.read_csv(path)
            self.assertEqual((found_encoding, found_separator), (encoding, separator))

    def test_duplicate_key_and_phone_review_goes_to_report(self):
        data = pd.DataFrame({"ID": ["1", "1", "2"], "Name": ["Ana", "Ana", "Bea"],
                             "Phone": ["010-1234-5678", "010 1234 5678", "01012345678"]})
        clean, issues, rejected, report = processor.clean_data(data, key="id")
        self.assertEqual(len(clean), 2)
        self.assertEqual(len(rejected), 1)
        self.assertIn("shared_phone_number", set(issues["issue"]))
        self.assertIn("local_phone_no_country_code", set(issues["issue"]))
        self.assertNotIn("phone_needs_country_code", clean.columns)
        self.assertNotIn("has_shared_phone_conflict", clean.columns)
        self.assertEqual(report["duplicate_records_removed"], 1)

    def test_dashboard_outputs_and_batch_cli_contract(self):
        input_dir = self.root / "input"
        input_dir.mkdir()
        (input_dir / "one.csv").write_text("name,age\nAda,30\nBob,31\nCam,32\n", encoding="utf-8")
        output_dir = self.root / "output"
        processor.run(input_dir, output_dir)
        self.assertEqual({p.name for p in (output_dir / "one").iterdir()}, set(processor.FILES))
        self.assertEqual(processor.process_dataset(input_dir / "one.csv", self.root / "single" / "cleaned.csv")["rows_after"], 3)


if __name__ == "__main__":
    unittest.main()
