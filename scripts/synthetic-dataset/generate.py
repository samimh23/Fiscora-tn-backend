"""Offline, fictional financial-document pilot. Never trains or deploys a model."""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import subprocess
import zipfile
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

REPO = Path(__file__).resolve().parents[2]
SCHEMA_SOURCE = REPO / "src/documents/extraction/nuextract-extraction-client.service.ts"
DEFAULT_OUTPUT = REPO.parent / "output/financial-synthetic-pilot-v1"
MODEL = "numind/NuExtract3"
REVISION = "c99dc8f5641b866aa0192b6ea78f84bf9f3535f1"
LAYOUTS = {
    "train": ["teal_banner", "blue_rules", "mono_ledger", "burgundy_cards"],
    "validation": ["purple_sidebar"],
    "test": ["orange_minimal"],
}
PALETTE = {"teal_banner": "#176451", "blue_rules": "#234B78", "mono_ledger": "#333333",
           "burgundy_cards": "#7D3346", "purple_sidebar": "#65518C", "orange_minimal": "#995A20"}
GOODS = ["Clavier USB", "Ecran 24 pouces", "Chaise de bureau", "Routeur Wi-Fi", "Papier A4"]
SERVICES = ["Maintenance informatique", "Conseil technique", "Abonnement internet", "Reparation materiel", "Formation logiciel"]
INSTRUCTIONS = """Extract the supplied financial document into the JSON template.
Copy only visibly present values. Preserve monetary strings exactly, including spaces,
commas, points and leading zeros. Never calculate, correct or invent a missing value.
Return null for absent scalars and [] for absent lists. One visible table row is one output row.
Dates printed DD/MM/YYYY are day/month/year. Do not put a bank amount in both debit and credit.
document_type, invoice_nature and item_nature are semantic classifications; all other fields
are strictly extractive. BIENS means physical goods; SERVICES means work or subscriptions;
MIXTE means both; INDETERMINE means insufficient information. Distinguish HT and TTC using
the printed headers. Global discounts must be explicitly labelled. Additional fields contain
only useful nonempty metadata not already represented by standard fields or table columns.
Return JSON only."""


def read_templates(node: str) -> dict:
    """Read the actual TS constant literals; no duplicated schema to silently drift."""
    source = SCHEMA_SOURCE.read_text(encoding="utf-8")
    templates = {}
    for kind, name in [("invoice", "INVOICE_TEMPLATE"), ("bank_statement", "BANK_STATEMENT_TEMPLATE")]:
        match = re.search(r"const " + name + r" = (\{.*?\n\});", source, re.S)
        if not match:
            raise ValueError(f"Cannot locate {name}; update schema reader before generating")
        result = subprocess.run([node, "-e", "const vm=require('node:vm'); process.stdout.write(JSON.stringify(vm.runInNewContext('('+process.argv[1]+')',{})));", match[1]],
                                capture_output=True, text=True, check=True)
        templates[kind] = json.loads(result.stdout)
    return templates


def empty_target(schema):
    if isinstance(schema, dict):
        return {key: empty_target(value) for key, value in schema.items()}
    if isinstance(schema, list):
        return [] if isinstance(schema[0], dict) else None
    return None


def q(value):
    return Decimal(value).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def money(value, style):
    text = f"{q(value):,.3f}"
    if style == "fr":
        return text.replace(",", " ").replace(".", ",")
    if style == "plain":
        return text.replace(",", "")
    return text


def parse_money(value):
    if " " in value or ("," in value and "." not in value):
        return Decimal(value.replace(" ", "").replace(",", "."))
    return Decimal(value.replace(",", ""))


def date_text(value, style):
    return value.isoformat() if style == "iso" else value.strftime("%d/%m/%Y")


def scalar_paths(target, prefix=""):
    if isinstance(target, dict):
        for key, value in target.items():
            yield from scalar_paths(value, f"{prefix}.{key}" if prefix else key)
    elif isinstance(target, list):
        for index, value in enumerate(target):
            yield from scalar_paths(value, f"{prefix}[{index}]")
    elif target is not None:
        yield prefix, target


def validate_schema(value, schema, path=""):
    if isinstance(schema, dict):
        assert isinstance(value, dict) and value.keys() == schema.keys(), path
        for key in schema:
            validate_schema(value[key], schema[key], f"{path}.{key}")
    elif isinstance(schema, list) and isinstance(schema[0], dict):
        assert isinstance(value, list), path
        for item in value:
            validate_schema(item, schema[0], path)
    elif isinstance(schema, list):
        assert value is None or value in schema, (path, value)
    else:
        assert value is None or isinstance(value, str), path


def make_invoice(index, split, rng, schema):
    target = empty_target(schema)
    style = ["fr", "plain", "en"][index % 3]
    ds = "iso" if index % 4 == 0 else "fr"
    day = date(2026, 1, 1) + timedelta(days=rng.randrange(270))
    credit = index % 7 == 0
    sign = -1 if credit else 1
    nature = ["BIENS", "SERVICES", "MIXTE", "INDETERMINE"][index % 4]
    target.update(document_type="credit_note" if credit else "invoice", invoice_nature=nature,
                  document_number=f"{'AV' if credit else 'FA'}-SYN-{split[:1].upper()}-{index:04d}",
                  issue_date=date_text(day, ds), currency="TND")
    for party, label in [("supplier", "Fournisseur"), ("customer", "Client")]:
        target[party].update(name=f"{label} Fictif {split.upper()} {index:04d} SARL",
                             address=f"{rng.randrange(1, 90)} Rue Exemple, {'Tunis' if index % 2 else 'Sfax'}")
        if index % 5 != 0:
            target[party]["tax_id"] = f"SYN-{split[:1].upper()}-{party[:1].upper()}-{index:06d}"
        if index % 3 == 0:
            target[party]["registration_number"] = f"RC-TEST-{party[:1].upper()}-{index:04d}"
    line_totals, rates = [], []
    line_count = max(2 if nature == "MIXTE" else 1, 1 + index % 6)
    for row in range(line_count):
        item = empty_target(schema["line_items"][0])
        row_nature = nature if nature in ["BIENS", "SERVICES"] else (["BIENS", "SERVICES"][row % 2] if nature == "MIXTE" else "INDETERMINE")
        # Ensure MIXTE always has both goods and services.
        if nature == "MIXTE" and row == 0:
            row_nature = "BIENS"
        desc = rng.choice(GOODS if row_nature == "BIENS" else SERVICES) if row_nature != "INDETERMINE" else "Prestation lot X"
        quantity = rng.randrange(1, 9)
        price = q(Decimal(rng.randrange(1000, 180000)) / 1000)
        discount = [0, 5, 10][(index + row) % 3]
        rate = [0, 7, 13, 19][(index + row) % 4]
        total = q(sign * quantity * price * (100 - discount) / 100)
        item.update(reference=f"ART-{row + 1:03d}", description=desc, item_nature=row_nature,
                    quantity=str(sign * quantity), unit_price=money(price, style), unit_price_basis="HT",
                    discount_rate=f"{discount}%", tax_rate=f"{rate}%", line_total=money(total, style), line_total_basis="HT")
        if index % 7 == 0:
            item["barcode"] = f"000{index:04d}{row:04d}"
        target["line_items"].append(item)
        line_totals.append(total)
        rates.append(rate)
    if nature == "MIXTE" and len(target["line_items"]) == 1:
        raise AssertionError("MIXTE needs two lines")
    gross = sum(line_totals, Decimal(0))
    global_rate = 5 if index % 3 == 0 else 0
    discount_amount = q(gross * global_rate / 100)
    base = q(gross - discount_amount)
    tax = sum((q(amount * (100 - global_rate) / 100 * rate / 100) for amount, rate in zip(line_totals, rates)), Decimal(0))
    fodec = q(base / 100) if index % 7 == 0 else Decimal(0)
    stamp = Decimal(sign) if index % 6 != 0 else Decimal(0)
    other = q(Decimal(sign) * 2) if index % 11 == 0 else Decimal(0)
    total = q(base + tax + fodec + stamp + other)
    paid = q(total / 4) if not credit and index % 8 == 0 else Decimal(0)
    target.update(gross_subtotal_excl_tax=money(gross, style), subtotal_excl_tax=money(base, style),
                  tax_amount=money(tax, style), total_incl_tax=money(total, style), amount_due=money(total - paid, style))
    if global_rate:
        target.update(global_discount_rate=f"{global_rate}%", global_discount_amount=money(discount_amount, style))
    if fodec:
        target["fodec_amount"] = money(fodec, style)
    if stamp:
        target["stamp_tax"] = money(stamp, style)
    if other:
        target["other_taxes"].append({"label": "Frais annexes", "amount": money(other, style)})
    target["additional_fields"] = [{"label": "Echeance", "value": date_text(day + timedelta(days=30), ds)}]
    if paid:
        target["additional_fields"].append({"label": "Acompte", "value": money(paid, style)})
    return target, {"amount_style": style, "date_style": ds}


def make_bank(index, split, rng, schema):
    target = empty_target(schema)
    style = ["fr", "plain", "en"][index % 3]
    ds = "iso" if index % 4 == 0 else "fr"
    start = date(2026, 1 + index % 8, 1)
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    opening = q(Decimal(rng.randrange(2000000, 10000000)) / 1000)
    bank = target["bank_statement"]
    target.update(document_type="bank_statement", currency="TND")
    bank.update(bank_name=f"Banque Fictive {split.upper()} {index:03d}", account_number=f"SYN-{split[:1].upper()}-{index:010d}",
                period_start=date_text(start, ds), period_end=date_text(end, ds), opening_balance=money(opening, style))
    # Invalid on purpose: must never resemble a usable real IBAN.
    if index % 4:
        bank["iban"] = f"TN-TEST-NOT-VALID-{index:06d}"
    balance = opening
    count = 24 if index % 4 == 0 else 4 + index % 9
    signed_amount_column = index % 2 == 0
    for row in range(count):
        tx = empty_target(schema["bank_statement"]["transactions"][0])
        credit = row % 3 == 0
        amount = q(Decimal(rng.randrange(1000, 750000)) / 1000)
        signed = amount if credit else -amount
        balance = q(balance + signed)
        day = start + timedelta(days=min(row + 1, 27))
        tx.update(transaction_date=date_text(day, ds), value_date=date_text(min(day + timedelta(days=1), end), ds),
                  description=("Virement client" if credit else ["Reglement fournisseur", "Frais bancaires", "Paiement carte"][row % 3]),
                  reference=f"TX-{index:03d}-{row:03d}", balance=money(balance, style))
        if signed_amount_column:
            tx["amount"] = money(signed, style)
        else:
            tx["credit" if credit else "debit"] = money(amount, style)
        bank["transactions"].append(tx)
    bank["closing_balance"] = money(balance, style)
    return target, {"amount_style": style, "date_style": ds, "signed_amount_column": signed_amount_column}


class Document:
    def __init__(self, path, layout):
        self.pdf = canvas.Canvas(str(path), pagesize=A4, invariant=1)
        self.pdf.setTitle("Fiscora synthetic training document - not valid")
        self.layout, self.accent = layout, HexColor(PALETTE[layout])
        self.page, self.evidence = 1, []
        self.font = "Courier" if layout == "mono_ledger" else "Helvetica"

    def text(self, x, y, value, field=None, size=9, bold=False):
        if value is None:
            return
        font = "Helvetica-Bold" if bold else self.font
        value = str(value)
        width = self.pdf.stringWidth(value, font, size)
        assert 25 <= x and x + width <= A4[0] - 25 and 25 <= y <= A4[1] - 25, (field, value, x, y, width)
        self.pdf.setFont(font, size)
        self.pdf.setFillColor(HexColor("#17212B"))
        self.pdf.drawString(x, y, value)
        if field:
            self.evidence.append({"field": field, "value": value, "page": self.page,
                                  "bbox_pdf": [x, y - 2, x + width, y + size]})

    def header(self, title):
        c = self.pdf
        if self.layout in ["teal_banner", "burgundy_cards"]:
            c.setFillColor(self.accent)
            c.rect(36, 749, A4[0] - 72, 52, fill=1, stroke=0)
            c.setFillColor(white)
            c.setFont("Helvetica-Bold", 20)
            c.drawString(48, 767, title)
        else:
            self.text(40, 773, title, size=20, bold=True)
            c.setStrokeColor(self.accent)
            c.setLineWidth(3 if self.layout == "blue_rules" else 1)
            c.line(40, 752, 555, 752)
        if self.layout == "purple_sidebar":
            c.setFillColor(self.accent)
            c.rect(27, 48, 4, 690, fill=1, stroke=0)

    def row_background(self, y, index, height):
        c = self.pdf
        if self.layout == "mono_ledger":
            c.setStrokeColor(HexColor("#BBBBBB"))
            c.rect(38, y - height + 8, 520, height, fill=0, stroke=1)
        elif index % 2 == 0:
            c.setFillColor(HexColor("#F0F3F5"))
            c.rect(38, y - height + 8, 520, height, fill=1, stroke=0)

    def footer(self, total_pages):
        self.text(40, 39, "SYNTHETIC TRAINING ONLY - NOT A VALID FINANCIAL DOCUMENT", size=8)
        self.text(480, 25, f"Page {self.page}/{total_pages}", size=8)

    def next_page(self):
        self.pdf.showPage()
        self.page += 1


def render_invoice(path, target, layout):
    doc = Document(path, layout)
    doc.header("AVOIR" if target["document_type"] == "credit_note" else "FACTURE")
    doc.text(40, 730, "Numero :", size=10)
    doc.text(103, 730, target["document_number"], "document_number", size=10, bold=True)
    doc.text(365, 730, "Date :")
    doc.text(402, 730, target["issue_date"], "issue_date")
    doc.text(40, 710, "Devise :")
    doc.text(100, 710, target["currency"], "currency")
    for party, x, label in [("supplier", 40, "FOURNISSEUR"), ("customer", 300, "CLIENT")]:
        doc.text(x, 677, label, size=10, bold=True)
        doc.text(x, 658, target[party]["name"], f"{party}.name", size=9)
        doc.text(x, 641, target[party]["address"], f"{party}.address")
        if target[party]["tax_id"]:
            doc.text(x, 624, "MF :")
            doc.text(x + 30, 624, target[party]["tax_id"], f"{party}.tax_id")
        if target[party]["registration_number"]:
            doc.text(x, 607, "RC :")
            doc.text(x + 30, 607, target[party]["registration_number"], f"{party}.registration_number")
    columns = [(40, "reference", "Reference"), (95, "description", "Designation"), (271, "quantity", "Qte"),
               (302, "unit_price", "PU HT"), (377, "discount_rate", "Remise"), (420, "tax_rate", "TVA"), (463, "line_total", "Montant HT")]
    for x, _, label in columns:
        doc.text(x, 576, label, size=8, bold=True)
    y = 552
    for index, item in enumerate(target["line_items"]):
        doc.row_background(y, index, 32)
        for x, key, _ in columns:
            doc.text(x, y, item[key], f"line_items[{index}].{key}", size=8)
        if item["barcode"]:
            doc.text(95, y - 13, "Code-barres :", size=7)
            doc.text(151, y - 13, item["barcode"], f"line_items[{index}].barcode", size=7)
        y -= 32
    fields = [("gross_subtotal_excl_tax", "Total lignes HT"), ("global_discount_rate", "Remise globale (%)"),
              ("global_discount_amount", "Remise globale"), ("subtotal_excl_tax", "Net HT"), ("tax_amount", "Total TVA"),
              ("fodec_amount", "FODEC"), ("stamp_tax", "Timbre")]
    y -= 20
    for key, label in fields:
        if target[key] is not None:
            doc.text(326, y, label)
            doc.text(465, y, target[key], key)
            y -= 19
    for index, item in enumerate(target["other_taxes"]):
        doc.text(326, y, item["label"], f"other_taxes[{index}].label")
        doc.text(465, y, item["amount"], f"other_taxes[{index}].amount")
        y -= 19
    for key, label in [("total_incl_tax", "Total TTC"), ("amount_due", "Net a payer")]:
        doc.text(326, y, label, bold=True)
        doc.text(465, y, target[key], key, bold=True)
        y -= 19
    for index, item in enumerate(target["additional_fields"]):
        doc.text(40, 140 - index * 19, item["label"], f"additional_fields[{index}].label")
        doc.text(116, 140 - index * 19, item["value"], f"additional_fields[{index}].value")
    doc.footer(1)
    doc.pdf.save()
    return doc.evidence


def render_bank(path, target, layout, metadata):
    doc = Document(path, layout)
    bank = target["bank_statement"]
    pages = (len(bank["transactions"]) + 11) // 12
    columns = [(40, "transaction_date", "Date"), (105, "value_date", "Valeur"), (170, "description", "Libelle"), (287, "reference", "Reference")]
    columns += [(375, "amount", "Montant signe")] if metadata["signed_amount_column"] else [(366, "debit", "Debit"), (426, "credit", "Credit")]
    columns += [(492, "balance", "Solde")]
    for page in range(pages):
        doc.header("RELEVE BANCAIRE")
        doc.text(40, 725, bank["bank_name"], "bank_statement.bank_name", size=12, bold=True)
        doc.text(40, 701, "Compte :")
        doc.text(98, 701, bank["account_number"], "bank_statement.account_number")
        if bank["iban"]:
            doc.text(300, 701, "IBAN :")
            doc.text(341, 701, bank["iban"], "bank_statement.iban")
        doc.text(40, 680, "Periode du")
        doc.text(100, 680, bank["period_start"], "bank_statement.period_start")
        doc.text(175, 680, "au")
        doc.text(195, 680, bank["period_end"], "bank_statement.period_end")
        doc.text(420, 680, "Devise :")
        doc.text(470, 680, target["currency"], "currency")
        if page == 0:
            doc.text(40, 654, "Solde initial :", bold=True)
            doc.text(140, 654, bank["opening_balance"], "bank_statement.opening_balance", bold=True)
        for x, _, label in columns:
            doc.text(x, 614, label, size=8, bold=True)
        for local_index, tx in enumerate(bank["transactions"][page * 12:page * 12 + 12]):
            index = page * 12 + local_index
            y = 586 - local_index * 29
            doc.row_background(y, local_index, 29)
            for x, key, _ in columns:
                doc.text(x, y, tx[key], f"bank_statement.transactions[{index}].{key}", size=7)
        if page == pages - 1:
            doc.text(355, 160, "Solde final :", bold=True)
            doc.text(465, 160, bank["closing_balance"], "bank_statement.closing_balance", bold=True)
        doc.footer(pages)
        if page != pages - 1:
            doc.next_page()
    doc.pdf.save()
    return doc.evidence


def verify_target(target, schema, evidence, kind):
    validate_schema(target, schema)
    drawn = {(entry["field"], entry["value"]) for entry in evidence}
    classifications = {"document_type", "invoice_nature"}
    for field, value in scalar_paths(target):
        if field in classifications or field.endswith(".item_nature") or field.endswith("_basis"):
            continue
        assert (field, value) in drawn, f"Target not visible: {field} = {value}"
    if kind == "invoice":
        for item in target["line_items"]:
            line = q(parse_money(item["quantity"]) * parse_money(item["unit_price"]) *
                     (100 - Decimal(item["discount_rate"].rstrip("%"))) / 100)
            assert line == parse_money(item["line_total"])
        natures = {item["item_nature"] for item in target["line_items"]}
        expected_nature = "INDETERMINE" if "INDETERMINE" in natures else "MIXTE" if len(natures) > 1 else next(iter(natures))
        assert target["invoice_nature"] == expected_nature
        gross = sum((parse_money(item["line_total"]) for item in target["line_items"]), Decimal(0))
        assert gross == parse_money(target["gross_subtotal_excl_tax"])
        base = gross - parse_money(target["global_discount_amount"] or "0")
        assert base == parse_money(target["subtotal_excl_tax"])
        rate = Decimal((target["global_discount_rate"] or "0").rstrip("%"))
        assert q(gross * rate / 100) == parse_money(target["global_discount_amount"] or "0")
        tax = sum((q(parse_money(item["line_total"]) * (100 - rate) / 100 *
                     Decimal(item["tax_rate"].rstrip("%")) / 100) for item in target["line_items"]), Decimal(0))
        assert tax == parse_money(target["tax_amount"])
        total = base + sum(parse_money(target[key] or "0") for key in ["tax_amount", "fodec_amount", "stamp_tax"])
        total += sum(parse_money(item["amount"]) for item in target["other_taxes"])
        assert total == parse_money(target["total_incl_tax"])
        paid = next((parse_money(item["value"]) for item in target["additional_fields"] if item["label"] == "Acompte"), Decimal(0))
        assert total - paid == parse_money(target["amount_due"])
    else:
        bank = target["bank_statement"]
        balance = parse_money(bank["opening_balance"])
        for tx in bank["transactions"]:
            assert not (tx["debit"] and tx["credit"])
            balance += parse_money(tx["amount"]) if tx["amount"] else parse_money(tx["credit"] or "0") - parse_money(tx["debit"] or "0")
            assert balance == parse_money(tx["balance"])
        assert balance == parse_money(bank["closing_balance"])


def write_json(path, content):
    path.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path, rows):
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def generate(output, seed=20261008, node="node"):
    if output.exists():
        raise ValueError("Output exists; choose a new directory. Existing data is never overwritten.")
    schemas = read_templates(node)
    for folder in ["images", "targets", "annotations", "templates", "splits", "previews", "source-pdfs"]:
        (output / folder).mkdir(parents=True, exist_ok=True)
    for kind, schema in schemas.items():
        write_json(output / "templates" / f"{kind}.json", schema)
    rows, manifests, failures = [], [], []
    for kind, total in [("invoice", 70), ("bank_statement", 30)]:
        for index in range(total):
            split = "train" if index < total * .8 else "validation" if index < total * .9 else "test"
            layout = LAYOUTS[split][index % len(LAYOUTS[split])]
            rng = random.Random(f"{seed}:{kind}:{index}")
            ident = f"{kind}-{index:04d}"
            try:
                factory = make_invoice if kind == "invoice" else make_bank
                target, metadata = factory(index, split, rng, schemas[kind])
                pdf_path = output / "source-pdfs" / f"{ident}.pdf"
                evidence = render_invoice(pdf_path, target, layout) if kind == "invoice" else render_bank(pdf_path, target, layout, metadata)
                verify_target(target, schemas[kind], evidence, kind)
                pdf = pdfium.PdfDocument(str(pdf_path))
                images = []
                profile = ["clean", "light_scan", "low_contrast"][index % 3]
                for page in range(len(pdf)):
                    bitmap = pdf[page].render(scale=1.7)
                    image = bitmap.to_pil().convert("RGB")
                    if profile == "light_scan":
                        image = image.convert("L").convert("RGB").filter(ImageFilter.GaussianBlur(.25))
                    elif profile == "low_contrast":
                        image = ImageEnhance.Contrast(image).enhance(.78)
                    relative = f"images/{ident}-p{page + 1}.jpg"
                    image.save(output / relative, quality=95 if profile == "clean" else 82)
                    images.append(relative)
                    with Image.open(output / relative) as verify:
                        verify.verify()
                    bitmap.close()
                    pdf[page].close()
                pdf.close()
                for entry in evidence:
                    x1, y1, x2, y2 = entry["bbox_pdf"]
                    entry["bbox_1000"] = [round(x1 / A4[0] * 1000), round((A4[1] - y2) / A4[1] * 1000), round(x2 / A4[0] * 1000), round((A4[1] - y1) / A4[1] * 1000)]
                annotation = {"id": ident, "synthetic": True, "layout": layout, "profile": profile, "split": split,
                              "seed": seed, "evidence": evidence, "metadata": metadata}
                write_json(output / "targets" / f"{ident}.json", target)
                write_json(output / "annotations" / f"{ident}.json", annotation)
                rows.append({"id": ident, "source_id": ident, "kind": kind, "split": split, "images": images,
                             "template": schemas[kind], "instructions": INSTRUCTIONS, "output": target})
                manifests.append({"id": ident, "source_id": ident, "kind": kind, "split": split, "layout": layout,
                                  "profile": profile, "images": images, "target": f"targets/{ident}.json",
                                  "annotation": f"annotations/{ident}.json", "synthetic": True})
            except Exception as error:
                failures.append({"id": ident, "error": str(error)})
    write_jsonl(output / "samples.jsonl", rows)
    write_jsonl(output / "manifest.jsonl", manifests)
    for split in LAYOUTS:
        write_jsonl(output / "splits" / f"{split}.jsonl", [row for row in rows if row["split"] == split])
    seen = {}
    for manifest in manifests:
        for image in manifest["images"]:
            digest = hashlib.sha256((output / image).read_bytes()).hexdigest()
            assert digest not in seen, f"Duplicate image: {image} and {seen.get(digest)}"
            seen[digest] = image
    assert len({row["source_id"] for row in rows}) == len(rows)
    for left in LAYOUTS:
        for right in LAYOUTS:
            if left != right:
                assert set(LAYOUTS[left]).isdisjoint(LAYOUTS[right])
    report = {"documents": len(rows), "images": len(seen), "by_kind": dict(Counter(row["kind"] for row in rows)),
              "by_split": dict(Counter(row["split"] for row in rows)), "by_layout": dict(Counter(row["layout"] for row in manifests)),
              "by_profile": dict(Counter(row["profile"] for row in manifests)), "failures": failures,
              "checks": ["exact app template", "visible target evidence", "invoice totals", "bank running balances", "unique images", "source/layout split isolation"],
              "base_model": MODEL, "base_revision": REVISION, "schema_source_sha256": hashlib.sha256(SCHEMA_SOURCE.read_bytes()).hexdigest(),
              "seed": seed, "status": "PASS" if len(rows) == 100 and not failures else "FAIL"}
    write_json(output / "validation-report.json", report)
    # Full-size selected pages plus a contact sheet; these must be inspected manually.
    selected = [next(row for row in manifests if row["kind"] == kind and row["layout"] == layout)
                for kind in schemas for layout in PALETTE]
    sheet = Image.new("RGB", (4 * 310, 3 * 465), "#DFE4E8")
    draw = ImageDraw.Draw(sheet)
    for index, row in enumerate(selected):
        im = Image.open(output / row["images"][0]).convert("RGB")
        im.save(output / "previews" / f"{row['id']}.png")
        im.thumbnail((295, 418))
        x, y = (index % 4) * 310, (index // 4) * 465
        sheet.paste(im, (x + 7, y + 25))
        draw.text((x + 7, y + 5), f"{row['id']} / {row['layout']}", fill="black")
    sheet.save(output / "previews/contact-sheet.png")
    write_json(output / "dataset-card.json", {"purpose": "Local pilot, not production accuracy evidence", "license": "CC0-1.0",
               "all_parties_fictional": True, "tax_values": "Synthetic arithmetic scenarios, not tax/legal guidance",
               "limitations": ["100 examples are a pipeline smoke test, not sufficient proof of improvement", "French ASCII/TND only",
                              "No handwriting or phone perspective", "Repeated synthetic footer is a domain cue", "Real accountant-reviewed evaluation required"],
               "not_started": ["GPU training", "model deployment", "live traffic changes"]})
    (output / "README.md").write_text((Path(__file__).parent / "README.md").read_text(encoding="utf-8"), encoding="utf-8")
    if failures:
        raise RuntimeError(json.dumps(report, indent=2))
    package = output.with_suffix(".zip")
    with zipfile.ZipFile(package, "x", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(output.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(output).as_posix())
    print(json.dumps({"dataset": str(output), "zip": str(package), **report}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--seed", type=int, default=20261008)
    parser.add_argument("--node", default="node")
    args = parser.parse_args()
    generate(args.output.resolve(), args.seed, args.node)
