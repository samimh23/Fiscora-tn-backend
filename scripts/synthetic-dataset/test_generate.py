import random
import tempfile
import unittest
from pathlib import Path

import generate as g


class PilotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schemas = g.read_templates("node")

    def test_money_roundtrip(self):
        for value in ["0", "1.001", "12345.678", "-7890.001"]:
            for style in ["fr", "plain", "en"]:
                self.assertEqual(g.parse_money(g.money(value, style)), g.q(value))

    def test_all_targets_visible_and_balanced(self):
        (g.REPO / "tmp").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=g.REPO / "tmp") as directory:
            for kind, count in [("invoice", 70), ("bank_statement", 30)]:
                for index in range(count):
                    split = "train" if index < count * .8 else "validation" if index < count * .9 else "test"
                    layout = g.LAYOUTS[split][index % len(g.LAYOUTS[split])]
                    rng = random.Random(f"20261008:{kind}:{index}")
                    factory = g.make_invoice if kind == "invoice" else g.make_bank
                    target, metadata = factory(index, split, rng, self.schemas[kind])
                    path = Path(directory) / f"{kind}-{index}.pdf"
                    evidence = g.render_invoice(path, target, layout) if kind == "invoice" else g.render_bank(path, target, layout, metadata)
                    g.verify_target(target, self.schemas[kind], evidence, kind)
                    self.assertTrue(path.stat().st_size > 1000)

    def test_reproducible_and_split_safe(self):
        for kind in self.schemas:
            factory = g.make_invoice if kind == "invoice" else g.make_bank
            self.assertEqual(factory(3, "train", random.Random(123), self.schemas[kind]),
                             factory(3, "train", random.Random(123), self.schemas[kind]))
        self.assertTrue(set(g.LAYOUTS["train"]).isdisjoint(g.LAYOUTS["test"]))
        self.assertTrue(set(g.LAYOUTS["validation"]).isdisjoint(g.LAYOUTS["test"]))

    def test_visibility_validator_rejects_invented_value(self):
        target, _ = g.make_invoice(1, "train", random.Random(1), self.schemas["invoice"])
        with self.assertRaisesRegex(AssertionError, "Target not visible"):
            g.verify_target(target, self.schemas["invoice"], [], "invoice")

    def test_holdouts_cover_credit_notes_and_multpage_statements(self):
        for split, invoice_range, bank_range in [("train", range(56), range(24)), ("validation", range(56, 63), range(24, 27)), ("test", range(63, 70), range(27, 30))]:
            invoices = [g.make_invoice(i, split, random.Random(i), self.schemas["invoice"])[0] for i in invoice_range]
            banks = [g.make_bank(i, split, random.Random(i), self.schemas["bank_statement"])[0] for i in bank_range]
            self.assertIn("credit_note", {target["document_type"] for target in invoices})
            self.assertTrue(any(len(target["bank_statement"]["transactions"]) > 12 for target in banks))


if __name__ == "__main__":
    unittest.main()
