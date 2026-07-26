from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


OUT = Path(__file__).resolve().parents[1] / "output" / "pdf" / "sarl-demo"
OUT.mkdir(parents=True, exist_ok=True)

GREEN = colors.HexColor("#145A46")
DARK = colors.HexColor("#173A30")
GOLD = colors.HexColor("#F2C56B")
CREAM = colors.HexColor("#F6F3EA")
LIGHT = colors.HexColor("#EEF4F1")
GREY = colors.HexColor("#64716B")
RED = colors.HexColor("#B94A48")
PAGE_W, PAGE_H = A4

styles = getSampleStyleSheet()
small = ParagraphStyle("small", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.5, leading=11, textColor=DARK)
small_right = ParagraphStyle("small_right", parent=small, alignment=TA_RIGHT)
small_center = ParagraphStyle("small_center", parent=small, alignment=TA_CENTER)
bold = ParagraphStyle("bold", parent=small, fontName="Helvetica-Bold")


def money(value):
    return f"{value:,.3f}".replace(",", " ") + " TND"


def header(c, title, subtitle, reference):
    c.setFillColor(GREEN)
    c.rect(0, PAGE_H - 42 * mm, PAGE_W, 42 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(18 * mm, PAGE_H - 19 * mm, title)
    c.setFont("Helvetica", 9.5)
    c.drawString(18 * mm, PAGE_H - 27 * mm, subtitle)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(PAGE_W - 18 * mm, PAGE_H - 20 * mm, reference)
    c.setFillColor(colors.white)
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_W - 18 * mm, PAGE_H - 28 * mm, "DOCUMENT FICTIF - DEMONSTRATION")


def footer(c, page=1):
    c.setStrokeColor(colors.HexColor("#D9DED9"))
    c.line(18 * mm, 16 * mm, PAGE_W - 18 * mm, 16 * mm)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(GREY)
    c.drawString(18 * mm, 10.5 * mm, "Compta TN - Scenario SARL fictif - Ne pas utiliser comme justificatif reel")
    c.drawRightString(PAGE_W - 18 * mm, 10.5 * mm, f"Page {page}")


def info_box(c, x, y, w, h, title, lines):
    c.setFillColor(LIGHT)
    c.roundRect(x, y - h, w, h, 4 * mm, stroke=0, fill=1)
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x + 5 * mm, y - 7 * mm, title.upper())
    c.setFillColor(DARK)
    c.setFont("Helvetica", 8.5)
    offset = 14 * mm
    for line in lines:
        c.drawString(x + 5 * mm, y - offset, line)
        offset += 5 * mm


def draw_table(c, data, x, y, widths, row_heights=None, alignments=None):
    wrapped = []
    for row_index, row in enumerate(data):
        wrapped_row = []
        for col_index, value in enumerate(row):
            style = (
                ParagraphStyle(
                    f"header_{col_index}",
                    parent=bold,
                    textColor=colors.white,
                )
                if row_index == 0
                else small
            )
            if alignments and col_index < len(alignments):
                style = ParagraphStyle(
                    f"cell_{row_index}_{col_index}",
                    parent=style,
                    alignment=alignments[col_index],
                )
            wrapped_row.append(Paragraph(str(value), style))
        wrapped.append(wrapped_row)
    table = Table(wrapped, colWidths=widths, rowHeights=row_heights, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D9DED9")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]),
    ]))
    width, height = table.wrapOn(c, sum(widths), PAGE_H)
    table.drawOn(c, x, y - height)
    return y - height


def invoice_pdf(filename, purchase=False):
    path = OUT / filename
    c = canvas.Canvas(str(path), pagesize=A4)
    if purchase:
        number, date = "FA-2026-062", "07/06/2026"
        issuer = ["Digital Systems SARL", "MF 4567890/F/A/000", "Centre Urbain Nord, Tunis", "sales@digitalsystems-demo.tn"]
        recipient = ["TechNova Solutions SARL", "MF 1765432/B/M/000", "Les Berges du Lac, Tunis", "contact@technova-demo.tn"]
        description, ht = "Ordinateur portable professionnel", 3000.0
        subtitle = "Facture fournisseur - acquisition d'une immobilisation"
    else:
        number, date = "FV-2026-001", "03/06/2026"
        issuer = ["TechNova Solutions SARL", "MF 1765432/B/M/000", "Les Berges du Lac, Tunis", "contact@technova-demo.tn"]
        recipient = ["Alpha Distribution SARL", "MF 1234567/C/A/000", "Charguia 1, Tunis", "finance@alpha-demo.tn"]
        description, ht = "Developpement d'un portail B2B", 10000.0
        subtitle = "Facture client - prestation de services informatiques"
    vat, stamp = ht * 0.19, 1.0
    total = ht + vat + stamp
    header(c, "FACTURE", subtitle, number)
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(PAGE_W - 18 * mm, PAGE_H - 51 * mm, f"Date : {date}")
    c.setFont("Helvetica", 8.5)
    c.drawRightString(PAGE_W - 18 * mm, PAGE_H - 57 * mm, "Echeance : 30/06/2026" if not purchase else "Echeance : 25/06/2026")
    box_w = (PAGE_W - 42 * mm) / 2
    info_box(c, 18 * mm, PAGE_H - 64 * mm, box_w, 38 * mm, "Emetteur", issuer)
    info_box(c, 24 * mm + box_w, PAGE_H - 64 * mm, box_w, 38 * mm, "Client", recipient)
    y = PAGE_H - 110 * mm
    data = [
        ["Designation", "Qte", "PU HT", "TVA", "Total HT"],
        [description, "1.000", money(ht), "19 %", money(ht)],
    ]
    y = draw_table(c, data, 18 * mm, y, [80 * mm, 18 * mm, 30 * mm, 20 * mm, 30 * mm], alignments=[TA_LEFT, TA_RIGHT, TA_RIGHT, TA_CENTER, TA_RIGHT])
    totals_x, totals_y = PAGE_W - 88 * mm, y - 10 * mm
    c.setFillColor(CREAM)
    c.roundRect(totals_x, totals_y - 41 * mm, 70 * mm, 41 * mm, 3 * mm, stroke=0, fill=1)
    rows = [("Total HT", ht), ("TVA 19 %", vat), ("Timbre fiscal", stamp), ("NET A PAYER", total)]
    for i, (label, amount) in enumerate(rows):
        yy = totals_y - (8 + i * 9) * mm
        c.setFillColor(GREEN if i == 3 else DARK)
        c.setFont("Helvetica-Bold" if i == 3 else "Helvetica", 9.5)
        c.drawString(totals_x + 5 * mm, yy, label)
        c.drawRightString(totals_x + 65 * mm, yy, money(amount))
    c.setFillColor(GREY)
    c.setFont("Helvetica", 8.5)
    c.drawString(18 * mm, 48 * mm, "Reglement par virement bancaire - Reference a reprendre dans le rapprochement.")
    c.setFillColor(RED)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(18 * mm, 40 * mm, "Donnees entierement fictives, creees uniquement pour la demonstration de Compta TN.")
    footer(c)
    c.save()
    return path


def bank_statement_pdf():
    path = OUT / "releve-bancaire-biat-juin-2026.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    header(c, "RELEVE BANCAIRE", "Compte courant BIAT Demo - Juin 2026", "RB-2026-06")
    info_box(c, 18 * mm, PAGE_H - 52 * mm, PAGE_W - 36 * mm, 30 * mm, "Titulaire", [
        "TechNova Solutions SARL - MF 1765432/B/M/000",
        "IBAN : TN59 1000 6035 1835 9847 8831",
        "Periode : 01/06/2026 au 30/06/2026 - Devise : TND",
    ])
    rows = [
        ["Date", "Libelle", "Reference", "Debit", "Credit"],
        ["10/06/2026", "Virement Alpha Distribution", "ENC-ALPHA-001", "", money(11901.0)],
        ["18/06/2026", "Virement Carthage Retail", "ENC-CARTHAGE-001", "", money(3000.0)],
        ["20/06/2026", "Virement Bureau Plus", "DEC-BUREAU-001", money(2381.0), ""],
        ["25/06/2026", "Virement Digital Systems", "DEC-DIGITAL-001", money(3571.0), ""],
    ]
    y = draw_table(c, rows, 18 * mm, PAGE_H - 93 * mm, [24 * mm, 66 * mm, 38 * mm, 27 * mm, 27 * mm], alignments=[TA_LEFT, TA_LEFT, TA_LEFT, TA_RIGHT, TA_RIGHT])
    c.setFillColor(CREAM)
    c.roundRect(18 * mm, y - 40 * mm, PAGE_W - 36 * mm, 30 * mm, 3 * mm, stroke=0, fill=1)
    c.setFillColor(DARK)
    c.setFont("Helvetica", 10)
    c.drawString(24 * mm, y - 21 * mm, "Solde initial")
    c.drawRightString(88 * mm, y - 21 * mm, money(0))
    c.drawString(108 * mm, y - 21 * mm, "Solde final")
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(GREEN)
    c.drawRightString(PAGE_W - 24 * mm, y - 21 * mm, money(8949.0))
    footer(c)
    c.save()
    return path


def payslip_pdf():
    path = OUT / "bulletin-paie-amira-juin-2026.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    header(c, "BULLETIN DE PAIE", "Periode de juin 2026", "PAIE-2026-06-001")
    box_w = (PAGE_W - 42 * mm) / 2
    info_box(c, 18 * mm, PAGE_H - 53 * mm, box_w, 35 * mm, "Employeur", [
        "TechNova Solutions SARL", "MF 1765432/B/M/000", "CNSS CNSS-884422-10",
    ])
    info_box(c, 24 * mm + box_w, PAGE_H - 53 * mm, box_w, 35 * mm, "Salariee", [
        "Amira Trabelsi", "CIN 11223344", "CNSS 01234567-89 - CDI",
    ])
    gross = 1800.0
    cnss = 165.240
    irpp = 140.0
    net = gross - cnss - irpp
    rows = [
        ["Rubrique", "Base", "Taux", "Gain", "Retenue"],
        ["Salaire brut mensuel", money(gross), "", money(gross), ""],
        ["Cotisation CNSS salarie", money(gross), "9,18 %", "", money(cnss)],
        ["IRPP - montant pedagogique", money(gross - cnss), "Bareme", "", money(irpp)],
    ]
    y = draw_table(c, rows, 18 * mm, PAGE_H - 102 * mm, [65 * mm, 33 * mm, 24 * mm, 30 * mm, 30 * mm], alignments=[TA_LEFT, TA_RIGHT, TA_CENTER, TA_RIGHT, TA_RIGHT])
    c.setFillColor(GREEN)
    c.roundRect(18 * mm, y - 32 * mm, PAGE_W - 36 * mm, 23 * mm, 3 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(25 * mm, y - 23 * mm, "NET A PAYER")
    c.drawRightString(PAGE_W - 25 * mm, y - 23 * mm, money(net))
    c.setFillColor(GREY)
    c.setFont("Helvetica", 8.5)
    c.drawString(18 * mm, y - 46 * mm, "Les retenues sont fictives et servent uniquement a illustrer le module Paie & CNSS.")
    footer(c)
    c.save()
    return path


def declaration_receipt_pdf():
    path = OUT / "accuse-depot-declaration-juin-2026.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    header(c, "ACCUSE DE DEPOT", "Declaration mensuelle - Juin 2026", "DEMO-DECL-2026-06-0001")
    c.setFillColor(LIGHT)
    c.roundRect(18 * mm, PAGE_H - 105 * mm, PAGE_W - 36 * mm, 47 * mm, 5 * mm, stroke=0, fill=1)
    c.setFillColor(GREEN)
    c.circle(38 * mm, PAGE_H - 81 * mm, 10 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(38 * mm, PAGE_H - 86 * mm, "OK")
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(55 * mm, PAGE_H - 75 * mm, "Declaration deposee avec succes")
    c.setFont("Helvetica", 9.5)
    c.drawString(55 * mm, PAGE_H - 84 * mm, "Contribuable : TechNova Solutions SARL")
    c.drawString(55 * mm, PAGE_H - 91 * mm, "Matricule fiscal : 1765432/B/M/000")
    c.drawString(55 * mm, PAGE_H - 98 * mm, "Periode : 06/2026")
    rows = [
        ["Information", "Valeur"],
        ["Reference de depot", "DEMO-DECL-2026-06-0001"],
        ["Statut", "DEPOSEE"],
        ["Date de depot", "15/07/2026 10:30"],
        ["Canal", "Simulation Compta TN"],
        ["Montant", "Voir la declaration validee dans l'application"],
    ]
    draw_table(c, rows, 30 * mm, PAGE_H - 122 * mm, [58 * mm, 92 * mm], alignments=[TA_LEFT, TA_LEFT])
    c.setFillColor(RED)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawCentredString(PAGE_W / 2, 42 * mm, "SPECIMEN FICTIF - AUCUNE VALEUR ADMINISTRATIVE")
    footer(c)
    c.save()
    return path


def main():
    files = [
        invoice_pdf("facture-vente-fv-2026-001.pdf"),
        invoice_pdf("facture-achat-fa-2026-062.pdf", purchase=True),
        bank_statement_pdf(),
        payslip_pdf(),
        declaration_receipt_pdf(),
    ]
    for file in files:
        print(file)


if __name__ == "__main__":
    main()
