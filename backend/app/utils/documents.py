import io
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)


PAGE_W, PAGE_H = A4
MARGIN = 36


def _num(val: Any) -> float:
    if val is None:
        return 0.0
    return float(val)


def _fmt(val: Any, currency: str = "Rs.") -> str:
    return f"{currency}{_num(val):,.2f}"


def _date_fmt(d: Any) -> str:
    if d is None:
        return ""
    if isinstance(d, str):
        return d
    if isinstance(d, (date, datetime)):
        return d.strftime("%d-%m-%Y")
    return str(d)


def _number_to_words_indian(num: float) -> str:
    if num == 0:
        return "Zero"

    ones = [
        "",
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "Nine",
        "Ten",
        "Eleven",
        "Twelve",
        "Thirteen",
        "Fourteen",
        "Fifteen",
        "Sixteen",
        "Seventeen",
        "Eighteen",
        "Nineteen",
    ]
    tens = [
        "",
        "",
        "Twenty",
        "Thirty",
        "Forty",
        "Fifty",
        "Sixty",
        "Seventy",
        "Eighty",
        "Ninety",
    ]

    def _two_digits(n: int) -> str:
        if n < 20:
            return ones[n]
        return tens[n // 10] + (" " + ones[n % 10] if n % 10 else "")

    def _three_digits(n: int) -> str:
        result = ""
        if n // 100 > 0:
            result = ones[n // 100] + " Hundred"
            n %= 100
            if n > 0:
                result += " and "
        result += _two_digits(n)
        return result

    num_int = int(num)
    paise = round((num - num_int) * 100)

    result = ""
    if num_int >= 10000000:
        result += _three_digits(num_int // 10000000) + " Crore "
        num_int %= 10000000
    if num_int >= 100000:
        result += _two_digits(num_int // 100000) + " Lakh "
        num_int %= 100000
    if num_int >= 1000:
        result += _two_digits(num_int // 1000) + " Thousand "
        num_int %= 1000
    if num_int > 0:
        result += _three_digits(num_int)

    result = result.strip()
    if paise > 0:
        result += f" and {paise} Paise"

    return result + " Only"


def _build_styles() -> dict[str, ParagraphStyle]:
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="DocTitle",
            parent=styles["Title"],
            fontSize=16,
            spaceAfter=6,
            textColor=colors.HexColor("#1a1a2e"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="DocSubtitle",
            parent=styles["Normal"],
            fontSize=9,
            textColor=colors.HexColor("#555555"),
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionHead",
            parent=styles["Normal"],
            fontSize=10,
            textColor=colors.HexColor("#1a1a2e"),
            spaceBefore=8,
            spaceAfter=4,
            fontName="Helvetica-Bold",
        )
    )
    styles.add(
        ParagraphStyle(
            name="CellText",
            parent=styles["Normal"],
            fontSize=8,
            leading=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CellBold",
            parent=styles["Normal"],
            fontSize=8,
            leading=10,
            fontName="Helvetica-Bold",
        )
    )
    styles.add(
        ParagraphStyle(
            name="Footer",
            parent=styles["Normal"],
            fontSize=7,
            textColor=colors.HexColor("#888888"),
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TermsText",
            parent=styles["Normal"],
            fontSize=7,
            leading=9,
            textColor=colors.HexColor("#444444"),
        )
    )
    return styles


def _company_header_block(company: dict, styles: dict) -> list:
    elements = []
    elements.append(Paragraph(company.get("name", "Company Name"), styles["DocTitle"]))
    addr_parts = []
    if company.get("address"):
        addr_parts.append(company["address"])
    city_state = ", ".join(
        filter(
            None, [company.get("city"), company.get("state"), company.get("pincode")]
        )
    )
    if city_state:
        addr_parts.append(city_state)
    if company.get("phone"):
        addr_parts.append(f"Phone: {company['phone']}")
    if company.get("email"):
        addr_parts.append(f"Email: {company['email']}")
    if company.get("website"):
        addr_parts.append(f"Website: {company['website']}")

    if addr_parts:
        elements.append(Paragraph(" | ".join(addr_parts), styles["DocSubtitle"]))

    gst_pan = []
    if company.get("gst_number"):
        gst_pan.append(f"GSTIN: {company['gst_number']}")
    if company.get("pan_number"):
        gst_pan.append(f"PAN: {company['pan_number']}")
    if gst_pan:
        elements.append(Paragraph(" | ".join(gst_pan), styles["DocSubtitle"]))

    elements.append(
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a1a2e"))
    )
    elements.append(Spacer(1, 8))
    return elements


def _party_block(title: str, party: dict, styles: dict) -> list:
    elements = []
    elements.append(Paragraph(f"<b>{title}</b>", styles["SectionHead"]))
    lines = []
    if party.get("name"):
        lines.append(f"<b>{party['name']}</b>")
    if party.get("contact_person"):
        lines.append(f"Attn: {party['contact_person']}")
    if party.get("address"):
        lines.append(party["address"])
    city_state = ", ".join(
        filter(None, [party.get("city"), party.get("state"), party.get("pincode")])
    )
    if city_state:
        lines.append(city_state)
    if party.get("phone"):
        lines.append(f"Phone: {party['phone']}")
    if party.get("email"):
        lines.append(f"Email: {party['email']}")
    if party.get("gst_number"):
        lines.append(f"GSTIN: {party['gst_number']}")
    for line in lines:
        elements.append(Paragraph(line, styles["CellText"]))
    return elements


def _doc_info_table(info: list[tuple[str, str]], styles: dict) -> Table:
    data = [
        [
            Paragraph(f"<b>{k}</b>", styles["CellText"]),
            Paragraph(str(v), styles["CellText"]),
        ]
        for k, v in info
    ]
    t = Table(data, colWidths=[1.8 * inch, 2.5 * inch])
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
            ]
        )
    )
    return t


def _items_table(
    items: list[dict],
    styles: dict,
    show_hsn: bool = True,
    show_discount: bool = True,
) -> tuple[Table, float, float]:
    header = ["#", "Product", "HSN"] if show_hsn else ["#", "Product"]
    header += ["Qty", "Rate"]
    if show_discount:
        header.append("Disc%")
    header += ["Tax%", "Amount"]

    col_widths = [0.3 * inch]
    if show_hsn:
        col_widths += [2.5 * inch, 0.7 * inch]
    else:
        col_widths += [3.2 * inch]
    col_widths += [0.5 * inch, 0.8 * inch]
    if show_discount:
        col_widths.append(0.5 * inch)
    col_widths += [0.6 * inch, 0.9 * inch]

    header_row = [Paragraph(f"<b>{h}</b>", styles["CellBold"]) for h in header]
    data = [header_row]

    subtotal = 0.0
    total_tax = 0.0

    for idx, item in enumerate(items, 1):
        qty = _num(item.get("quantity"))
        rate = _num(item.get("unit_price"))
        disc_pct = _num(item.get("discount_percent"))
        tax_pct = _num(item.get("gst_rate"))

        line_base = qty * rate
        disc_amount = line_base * disc_pct / 100
        taxable = line_base - disc_amount
        tax_amount = taxable * tax_pct / 100
        line_total = taxable + tax_amount

        subtotal += taxable
        total_tax += tax_amount

        row = [
            str(idx),
            Paragraph(item.get("product_name", "")[:50], styles["CellText"]),
        ]
        if show_hsn:
            row.append(str(item.get("hsn_code", "")))
        row += [f"{qty:.2f}", f"{rate:.2f}"]
        if show_discount:
            row.append(f"{disc_pct:.1f}")
        row += [f"{tax_pct:.1f}", f"{(taxable + tax_amount):.2f}"]
        data.append(row)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        (
            "ROWBACKGROUNDS",
            (0, 1),
            (-1, -1),
            [colors.white, colors.HexColor("#f8f8fc")],
        ),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t, subtotal, total_tax


def _tax_breakdown_table(
    subtotal: float,
    cgst: float,
    sgst: float,
    igst: float,
    discount: float,
    round_off: float,
    grand_total: float,
    styles: dict,
) -> Table:
    data = [
        [
            Paragraph("<b>Subtotal</b>", styles["CellText"]),
            Paragraph(f"{subtotal:,.2f}", styles["CellText"]),
        ],
    ]
    if discount:
        data.append(
            [
                Paragraph("<b>Discount</b>", styles["CellText"]),
                Paragraph(f"(-) {discount:,.2f}", styles["CellText"]),
            ]
        )
    if cgst:
        data.append(
            [
                Paragraph("<b>CGST</b>", styles["CellText"]),
                Paragraph(f"{cgst:,.2f}", styles["CellText"]),
            ]
        )
    if sgst:
        data.append(
            [
                Paragraph("<b>SGST</b>", styles["CellText"]),
                Paragraph(f"{sgst:,.2f}", styles["CellText"]),
            ]
        )
    if igst:
        data.append(
            [
                Paragraph("<b>IGST</b>", styles["CellText"]),
                Paragraph(f"{igst:,.2f}", styles["CellText"]),
            ]
        )
    if round_off:
        data.append(
            [
                Paragraph("<b>Round Off</b>", styles["CellText"]),
                Paragraph(f"{round_off:,.2f}", styles["CellText"]),
            ]
        )
    data.append(
        [
            Paragraph("<b>Grand Total</b>", styles["CellBold"]),
            Paragraph(f"<b>{grand_total:,.2f}</b>", styles["CellBold"]),
        ]
    )

    t = Table(data, colWidths=[1.5 * inch, 1.2 * inch])
    t.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LINEABOVE", (0, -1), (-1, -1), 1.5, colors.HexColor("#1a1a2e")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ]
        )
    )
    return t


def _amount_in_words(grand_total: float, styles: dict) -> Paragraph:
    words = _number_to_words_indian(grand_total)
    return Paragraph(f"<b>Amount in Words:</b> {words}", styles["CellText"])


def _terms_block(terms: Optional[str], styles: dict) -> list:
    elements = []
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("<b>Terms & Conditions:</b>", styles["SectionHead"]))
    default_terms = (
        "1. Goods once sold will not be taken back or exchanged.<br/>"
        "2. Interest @ 18% p.a. will be charged on overdue payments.<br/>"
        "3. Any dispute shall be subject to local jurisdiction only.<br/>"
        "4. E. & O.E."
    )
    terms_text = terms if terms else default_terms
    terms_text = terms_text.replace("\n", "<br/>")
    elements.append(Paragraph(terms_text, styles["TermsText"]))
    return elements


def _signature_block(styles: dict) -> list:
    elements = []
    elements.append(Spacer(1, 30))
    sig_data = [
        ["", "For <b>Company</b>"],
        ["", ""],
        ["", "_______________________"],
        ["", "Authorized Signatory"],
    ]
    sig_table = Table(sig_data, colWidths=[4 * inch, 2.5 * inch])
    sig_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    elements.append(sig_table)
    return elements


def _build_pdf(elements: list) -> bytes:
    buffer = io.BytesIO()
    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )
    frame = Frame(
        MARGIN,
        MARGIN,
        PAGE_W - 2 * MARGIN,
        PAGE_H - 2 * MARGIN,
        id="main",
    )
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame])])
    doc.build(elements)
    buffer.seek(0)
    return buffer.read()


def _build_document(
    doc_type: str,
    doc_number: str,
    doc_date: Any,
    company: dict,
    party: dict,
    party_label: str,
    items: list[dict],
    subtotal: float,
    cgst: float,
    sgst: float,
    igst: float,
    discount: float,
    round_off: float,
    grand_total: float,
    extra_info: Optional[list[tuple[str, str]]] = None,
    terms: Optional[str] = None,
    notes: Optional[str] = None,
    show_hsn: bool = True,
    show_discount: bool = True,
) -> bytes:
    styles = _build_styles()
    elements: list = []

    elements.extend(_company_header_block(company, styles))
    elements.append(Paragraph(f"<b>{doc_type}</b>", styles["DocTitle"]))
    elements.append(Spacer(1, 6))

    info_lines = [
        (f"{doc_type.split()[0]} No.", doc_number),
        ("Date", _date_fmt(doc_date)),
    ]
    if extra_info:
        info_lines.extend(extra_info)
    elements.append(_doc_info_table(info_lines, styles))
    elements.append(Spacer(1, 8))

    party_elements = _party_block(party_label, party, styles)
    elements.extend(party_elements)
    elements.append(Spacer(1, 8))

    items_table, calc_subtotal, calc_tax = _items_table(
        items, styles, show_hsn, show_discount
    )
    elements.append(items_table)
    elements.append(Spacer(1, 8))

    tax_table = _tax_breakdown_table(
        subtotal or calc_subtotal,
        cgst,
        sgst,
        igst,
        discount,
        round_off,
        grand_total,
        styles,
    )
    elements.append(tax_table)
    elements.append(Spacer(1, 4))
    elements.append(_amount_in_words(grand_total, styles))

    if notes:
        elements.append(Spacer(1, 6))
        elements.append(Paragraph(f"<b>Notes:</b> {notes}", styles["CellText"]))

    elements.extend(_terms_block(terms, styles))
    elements.extend(_signature_block(styles))

    return _build_pdf(elements)


def generate_invoice_pdf(
    invoice_type: str = "sales",
    invoice_number: str = "",
    invoice_date: Any = None,
    company: Optional[dict] = None,
    party: Optional[dict] = None,
    items: Optional[list[dict]] = None,
    subtotal: float = 0,
    cgst: float = 0,
    sgst: float = 0,
    igst: float = 0,
    discount: float = 0,
    round_off: float = 0,
    grand_total: float = 0,
    paid_amount: float = 0,
    due_date: Any = None,
    terms: Optional[str] = None,
    notes: Optional[str] = None,
    order_ref: Optional[str] = None,
) -> bytes:
    company = company or {}
    party = party or {}
    items = items or []

    party_label = "Bill To (Customer)" if invoice_type == "sales" else "Vendor"
    title = "Tax Invoice" if invoice_type == "sales" else "Purchase Invoice"

    extra_info = [
        ("Invoice No.", invoice_number),
        ("Invoice Date", _date_fmt(invoice_date)),
    ]
    if due_date:
        extra_info.append(("Due Date", _date_fmt(due_date)))
    if order_ref:
        extra_info.append(("Order Ref", order_ref))
    if paid_amount:
        extra_info.append(("Paid Amount", f"Rs.{paid_amount:,.2f}"))
    balance = grand_total - paid_amount
    if balance > 0:
        extra_info.append(("Balance Due", f"Rs.{balance:,.2f}"))

    return _build_document(
        doc_type=title,
        doc_number=invoice_number,
        doc_date=invoice_date,
        company=company,
        party=party,
        party_label=party_label,
        items=items,
        subtotal=subtotal,
        cgst=cgst,
        sgst=sgst,
        igst=igst,
        discount=discount,
        round_off=round_off,
        grand_total=grand_total,
        extra_info=extra_info,
        terms=terms,
        notes=notes,
    )


def generate_quotation_pdf(
    quotation_number: str = "",
    quotation_date: Any = None,
    company: Optional[dict] = None,
    customer: Optional[dict] = None,
    items: Optional[list[dict]] = None,
    subtotal: float = 0,
    cgst: float = 0,
    sgst: float = 0,
    igst: float = 0,
    discount: float = 0,
    grand_total: float = 0,
    valid_until: Any = None,
    terms: Optional[str] = None,
    notes: Optional[str] = None,
) -> bytes:
    company = company or {}
    customer = customer or {}
    items = items or []

    extra_info = [
        ("Quotation No.", quotation_number),
        ("Date", _date_fmt(quotation_date)),
    ]
    if valid_until:
        extra_info.append(("Valid Until", _date_fmt(valid_until)))

    return _build_document(
        doc_type="Quotation",
        doc_number=quotation_number,
        doc_date=quotation_date,
        company=company,
        party=customer,
        party_label="To (Customer)",
        items=items,
        subtotal=subtotal,
        cgst=cgst,
        sgst=sgst,
        igst=igst,
        discount=discount,
        round_off=0,
        grand_total=grand_total,
        extra_info=extra_info,
        terms=terms,
        notes=notes,
    )


def generate_purchase_order_pdf(
    po_number: str = "",
    po_date: Any = None,
    company: Optional[dict] = None,
    vendor: Optional[dict] = None,
    items: Optional[list[dict]] = None,
    subtotal: float = 0,
    cgst: float = 0,
    sgst: float = 0,
    igst: float = 0,
    discount: float = 0,
    round_off: float = 0,
    grand_total: float = 0,
    expected_date: Any = None,
    payment_terms: Optional[int] = None,
    advance_amount: float = 0,
    terms: Optional[str] = None,
    notes: Optional[str] = None,
) -> bytes:
    company = company or {}
    vendor = vendor or {}
    items = items or []

    extra_info = [
        ("PO Number", po_number),
        ("PO Date", _date_fmt(po_date)),
    ]
    if expected_date:
        extra_info.append(("Expected By", _date_fmt(expected_date)))
    if payment_terms:
        extra_info.append(("Payment Terms", f"{payment_terms} days"))
    if advance_amount:
        extra_info.append(("Advance", f"Rs.{advance_amount:,.2f}"))

    return _build_document(
        doc_type="Purchase Order",
        doc_number=po_number,
        doc_date=po_date,
        company=company,
        party=vendor,
        party_label="Vendor",
        items=items,
        subtotal=subtotal,
        cgst=cgst,
        sgst=sgst,
        igst=igst,
        discount=discount,
        round_off=round_off,
        grand_total=grand_total,
        extra_info=extra_info,
        terms=terms,
        notes=notes,
    )


def generate_grn_pdf(
    grn_number: str = "",
    grn_date: Any = None,
    company: Optional[dict] = None,
    vendor: Optional[dict] = None,
    warehouse_name: str = "",
    po_number: str = "",
    items: Optional[list[dict]] = None,
    remarks: Optional[str] = None,
) -> bytes:
    styles = _build_styles()
    company = company or {}
    vendor = vendor or {}
    items = items or []

    elements: list = []
    elements.extend(_company_header_block(company, styles))
    elements.append(Paragraph("<b>Goods Received Note (GRN)</b>", styles["DocTitle"]))
    elements.append(Spacer(1, 6))

    info = [
        ("GRN No.", grn_number),
        ("GRN Date", _date_fmt(grn_date)),
        ("PO Ref", po_number),
        ("Warehouse", warehouse_name),
    ]
    elements.append(_doc_info_table(info, styles))
    elements.append(Spacer(1, 8))
    elements.extend(_party_block("Vendor", vendor, styles))
    elements.append(Spacer(1, 8))

    header = [
        "#",
        "Product",
        "Ordered",
        "Received",
        "Accepted",
        "Rejected",
        "Unit Price",
        "Amount",
    ]
    col_widths = [
        0.3 * inch,
        2.0 * inch,
        0.7 * inch,
        0.7 * inch,
        0.7 * inch,
        0.7 * inch,
        0.8 * inch,
        0.9 * inch,
    ]

    header_row = [Paragraph(f"<b>{h}</b>", styles["CellBold"]) for h in header]
    data = [header_row]

    for idx, item in enumerate(items, 1):
        ordered = _num(item.get("ordered_quantity"))
        received = _num(item.get("received_quantity"))
        accepted = _num(item.get("accepted_quantity"))
        rejected = _num(item.get("rejected_quantity"))
        price = _num(item.get("unit_price"))
        amount = accepted * price
        data.append(
            [
                str(idx),
                Paragraph(item.get("product_name", "")[:40], styles["CellText"]),
                f"{ordered:.2f}",
                f"{received:.2f}",
                f"{accepted:.2f}",
                f"{rejected:.2f}",
                f"{price:.2f}",
                f"{amount:.2f}",
            ]
        )

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [colors.white, colors.HexColor("#f8f8fc")],
                ),
            ]
        )
    )
    elements.append(t)

    if remarks:
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(f"<b>Remarks:</b> {remarks}", styles["CellText"]))

    elements.extend(_signature_block(styles))
    return _build_pdf(elements)


def generate_delivery_challan_pdf(
    challan_number: str = "",
    challan_date: Any = None,
    company: Optional[dict] = None,
    customer: Optional[dict] = None,
    order_number: str = "",
    vehicle_number: Optional[str] = None,
    transport_name: Optional[str] = None,
    items: Optional[list[dict]] = None,
    notes: Optional[str] = None,
) -> bytes:
    styles = _build_styles()
    company = company or {}
    customer = customer or {}
    items = items or []

    elements: list = []
    elements.extend(_company_header_block(company, styles))
    elements.append(Paragraph("<b>Delivery Challan</b>", styles["DocTitle"]))
    elements.append(Spacer(1, 6))

    info = [
        ("Challan No.", challan_number),
        ("Date", _date_fmt(challan_date)),
    ]
    if order_number:
        info.append(("Order Ref", order_number))
    if vehicle_number:
        info.append(("Vehicle No.", vehicle_number))
    if transport_name:
        info.append(("Transport", transport_name))
    elements.append(_doc_info_table(info, styles))
    elements.append(Spacer(1, 8))
    elements.extend(_party_block("Delivered To", customer, styles))
    elements.append(Spacer(1, 8))

    header = ["#", "Product", "HSN", "Qty", "Remarks"]
    col_widths = [0.3 * inch, 3.0 * inch, 0.8 * inch, 0.7 * inch, 2.0 * inch]
    header_row = [Paragraph(f"<b>{h}</b>", styles["CellBold"]) for h in header]
    data = [header_row]

    for idx, item in enumerate(items, 1):
        data.append(
            [
                str(idx),
                Paragraph(item.get("product_name", "")[:50], styles["CellText"]),
                str(item.get("hsn_code", "")),
                f"{_num(item.get('quantity')):.2f}",
                str(item.get("remarks", "")),
            ]
        )

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (3, 1), (3, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [colors.white, colors.HexColor("#f8f8fc")],
                ),
            ]
        )
    )
    elements.append(t)

    if notes:
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(f"<b>Notes:</b> {notes}", styles["CellText"]))

    elements.extend(_signature_block(styles))
    return _build_pdf(elements)


def generate_packing_slip_pdf(
    slip_number: str = "",
    slip_date: Any = None,
    company: Optional[dict] = None,
    customer: Optional[dict] = None,
    order_number: str = "",
    challan_number: str = "",
    items: Optional[list[dict]] = None,
    total_packages: int = 0,
    total_weight: Optional[float] = None,
    notes: Optional[str] = None,
) -> bytes:
    styles = _build_styles()
    company = company or {}
    customer = customer or {}
    items = items or []

    elements: list = []
    elements.extend(_company_header_block(company, styles))
    elements.append(Paragraph("<b>Packing Slip</b>", styles["DocTitle"]))
    elements.append(Spacer(1, 6))

    info = [
        ("Slip No.", slip_number),
        ("Date", _date_fmt(slip_date)),
    ]
    if order_number:
        info.append(("Order No.", order_number))
    if challan_number:
        info.append(("Challan No.", challan_number))
    if total_packages:
        info.append(("Total Packages", str(total_packages)))
    if total_weight is not None:
        info.append(("Total Weight", f"{total_weight:.2f} kg"))
    elements.append(_doc_info_table(info, styles))
    elements.append(Spacer(1, 8))
    elements.extend(_party_block("Ship To", customer, styles))
    elements.append(Spacer(1, 8))

    header = ["#", "Product", "SKU", "Color", "Size", "Qty", "Pkg #"]
    col_widths = [
        0.3 * inch,
        2.0 * inch,
        0.8 * inch,
        0.8 * inch,
        0.6 * inch,
        0.5 * inch,
        0.6 * inch,
    ]
    header_row = [Paragraph(f"<b>{h}</b>", styles["CellBold"]) for h in header]
    data = [header_row]

    for idx, item in enumerate(items, 1):
        data.append(
            [
                str(idx),
                Paragraph(item.get("product_name", "")[:40], styles["CellText"]),
                str(item.get("sku", "")),
                str(item.get("color", "")),
                str(item.get("size", "")),
                f"{_num(item.get('quantity')):.0f}",
                str(item.get("package_number", "")),
            ]
        )

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (4, 1), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [colors.white, colors.HexColor("#f8f8fc")],
                ),
            ]
        )
    )
    elements.append(t)

    if notes:
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(f"<b>Notes:</b> {notes}", styles["CellText"]))

    elements.extend(_signature_block(styles))
    return _build_pdf(elements)


def generate_simple_slip_pdf(
    title: str,
    doc_number: str,
    doc_date: Any,
    company: Optional[dict] = None,
    fields: Optional[list[tuple[str, str]]] = None,
    items: Optional[list[dict]] = None,
    item_headers: Optional[list[str]] = None,
    notes: Optional[str] = None,
) -> bytes:
    """One reusable template for the non-GST internal slips module 16
    asks for (Production Slip, Issue/Receive Slip, Payroll Slip,
    Attendance Slip, Quality Report) -- these all share the same shape
    (header + key/value fields + an optional plain item table), unlike
    invoices which need tax breakdown/party blocks. Reuses
    _build_styles/_company_header_block/_doc_info_table/_signature_block/
    _build_pdf rather than duplicating them; does NOT reuse
    _items_table/_tax_breakdown_table since those are GST-invoice-specific
    and would render meaningless zero-tax rows on a slip that has none.
    "Templates must be reusable" is satisfied by having ONE function for
    five document types, not five near-identical ones.
    """
    styles = _build_styles()
    company = company or {}
    fields = fields or []
    elements: list = []

    elements.extend(_company_header_block(company, styles))
    elements.append(Paragraph(f"<b>{title}</b>", styles["DocTitle"]))
    elements.append(Spacer(1, 6))

    info_lines = [(f"{title.split()[0]} No.", doc_number), ("Date", _date_fmt(doc_date))]
    info_lines.extend(fields)
    elements.append(_doc_info_table(info_lines, styles))
    elements.append(Spacer(1, 8))

    if items and item_headers:
        table_data = [item_headers] + [[str(row.get(h, "")) for h in item_headers] for row in items]
        t = Table(table_data, repeatRows=1)
        t.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f5")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ])
        )
        elements.append(t)
        elements.append(Spacer(1, 8))

    if notes:
        elements.append(Paragraph(f"<b>Notes:</b> {notes}", styles["CellText"]))
        elements.append(Spacer(1, 6))

    elements.extend(_signature_block(styles))
    return _build_pdf(elements)
