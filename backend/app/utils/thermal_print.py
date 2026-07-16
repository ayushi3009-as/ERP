import enum
from typing import Any, Optional


class ThermalPrinterSize(str, enum.Enum):
    MM_80 = "80mm"
    MM_58 = "58mm"


PAPER_WIDTHS: dict[str, int] = {
    ThermalPrinterSize.MM_80: 48,
    ThermalPrinterSize.MM_58: 32,
}


def _esc(cmd: bytes) -> bytes:
    return b"\x1b" + cmd


def _gs(cmd: bytes) -> bytes:
    return b"\x1d" + cmd


def _init_printer() -> bytes:
    return _esc(b"@")


def _align_center() -> bytes:
    return _esc(b"a\x01")


def _align_left() -> bytes:
    return _esc(b"a\x00")


def _align_right() -> bytes:
    return _esc(b"a\x02")


def _bold_on() -> bytes:
    return _esc(b"E\x01")


def _bold_off() -> bytes:
    return _esc(b"E\x00")


def _underline_on() -> bytes:
    return _esc(b"-\x01")


def _underline_off() -> bytes:
    return _esc(b"-\x00")


def _double_height_on() -> bytes:
    return _gs(b"!\x11")


def _double_height_off() -> bytes:
    return _gs(b"!\x00")


def _set_font_size(normal: bool = True) -> bytes:
    if normal:
        return _gs(b"!\x00")
    return _gs(b"!\x11")


def _feed_lines(n: int = 3) -> bytes:
    return _esc(b"d") + bytes([n]) + b"\n"


def _cut_paper(mode: int = 0) -> bytes:
    return _gs(b"V") + bytes([mode])


def _text_line(text: str, encoding: str = "cp437") -> bytes:
    return text.encode(encoding, errors="replace") + b"\n"


def _hr_line(width: int = 48) -> bytes:
    return b"-" * width + b"\n"


def _center_text(text: str, width: int = 48) -> bytes:
    return _align_center() + _text_line(text.center(width))


def _left_right_text(left: str, right: str, width: int = 48) -> bytes:
    combined = f"{left:<{width - len(right)}}{right}"
    return _align_left() + _text_line(combined[:width])


def _double_height_text(text: str) -> bytes:
    return (
        _double_height_on() + _align_center() + _text_line(text) + _double_height_off()
    )


def _barcode_code128(data: str) -> bytes:
    cmd = _gs(b"k")
    cmd += bytes([73])
    cmd += bytes([len(data)])
    cmd += data.encode("ascii", errors="replace")
    return cmd


def _qr_code(data: str) -> bytes:
    encoded = data.encode("utf-8", errors="replace")
    store_cmd = _gs(b"(k")
    plen = len(encoded) + 3
    store_cmd += plen.to_bytes(2, "little")
    store_cmd += b"\x31\x30"
    store_cmd += encoded

    size_cmd = _gs(b"(k")
    size_cmd += b"\x03\x00\x31\x43\x08"

    print_cmd = _gs(b"(k")
    print_cmd += b"\x03\x00\x31\x51\x30"

    return store_cmd + size_cmd + print_cmd


def generate_thermal_receipt(
    lines: list[dict],
    printer_size: ThermalPrinterSize = ThermalPrinterSize.MM_80,
) -> bytes:
    width = PAPER_WIDTHS[printer_size]
    output = _init_printer()

    for line in lines:
        line_type = line.get("type", "text")
        text = line.get("text", "")

        if line_type == "center":
            output += _center_text(text, width)
        elif line_type == "bold_center":
            output += _bold_on() + _center_text(text, width) + _bold_off()
        elif line_type == "double":
            output += _double_height_text(text)
        elif line_type == "left_right":
            output += _left_right_text(text, line.get("right", ""), width)
        elif line_type == "bold":
            output += _bold_on() + _text_line(text) + _bold_off()
        elif line_type == "underline":
            output += _underline_on() + _text_line(text) + _underline_off()
        elif line_type == "separator":
            output += _hr_line(width)
        elif line_type == "barcode":
            output += _align_center() + _barcode_code128(text) + b"\n"
        elif line_type == "qr":
            output += _align_center() + _qr_code(text) + b"\n"
        elif line_type == "feed":
            output += b"\n" * line.get("count", 1)
        else:
            output += _align_left() + _text_line(text)

    output += _feed_lines(4)
    output += _cut_paper()
    return output


def generate_thermal_invoice(
    invoice_number: str = "",
    invoice_date: str = "",
    company: Optional[dict] = None,
    customer: Optional[dict] = None,
    items: Optional[list[dict]] = None,
    subtotal: float = 0,
    cgst: float = 0,
    sgst: float = 0,
    igst: float = 0,
    discount: float = 0,
    grand_total: float = 0,
    paid_amount: float = 0,
    printer_size: ThermalPrinterSize = ThermalPrinterSize.MM_80,
) -> bytes:
    width = PAPER_WIDTHS[printer_size]
    company = company or {}
    customer = customer or {}
    items = items or []

    lines: list[dict] = []

    lines.append({"type": "bold_center", "text": company.get("name", "COMPANY NAME")})
    if company.get("address"):
        lines.append({"type": "center", "text": company["address"][:width]})
    city_line = ", ".join(
        filter(
            None, [company.get("city"), company.get("state"), company.get("pincode")]
        )
    )
    if city_line:
        lines.append({"type": "center", "text": city_line[:width]})
    if company.get("phone"):
        lines.append({"type": "center", "text": f"Ph: {company['phone']}"})
    if company.get("gst_number"):
        lines.append({"type": "center", "text": f"GSTIN: {company['gst_number']}"})

    lines.append({"type": "separator"})
    lines.append({"type": "bold_center", "text": "TAX INVOICE"})
    lines.append({"type": "separator"})

    lines.append({"type": "left_right", "text": "Inv No:", "right": invoice_number})
    lines.append({"type": "left_right", "text": "Date:", "right": invoice_date})

    lines.append({"type": "separator"})
    lines.append({"type": "bold", "text": "Bill To:"})
    if customer.get("name"):
        lines.append({"type": "text", "text": customer["name"]})
    if customer.get("address"):
        lines.append({"type": "text", "text": customer["address"][:width]})
    if customer.get("phone"):
        lines.append({"type": "text", "text": f"Ph: {customer['phone']}"})
    if customer.get("gst_number"):
        lines.append({"type": "text", "text": f"GSTIN: {customer['gst_number']}"})

    lines.append({"type": "separator"})

    col_w = {
        ThermalPrinterSize.MM_80: {"item": 22, "qty": 5, "rate": 9, "amt": 10},
        ThermalPrinterSize.MM_58: {"item": 14, "qty": 4, "rate": 7, "amt": 7},
    }[printer_size]

    hdr = f"{'Item':<{col_w['item']}}{'Qty':>{col_w['qty']}}{'Rate':>{col_w['rate']}}{'Amount':>{col_w['amt']}}"
    lines.append({"type": "bold", "text": hdr})
    lines.append({"type": "separator"})

    for item in items:
        name = item.get("product_name", "")[: col_w["item"]]
        qty = item.get("quantity", 0)
        rate = float(item.get("unit_price", 0))
        amt = float(item.get("amount", qty * rate))
        lines.append(
            {
                "type": "text",
                "text": f"{name:<{col_w['item']}}{qty:>{col_w['qty']}.1f}{rate:>{col_w['rate']}.2f}{amt:>{col_w['amt']}.2f}",
            }
        )

    lines.append({"type": "separator"})

    lines.append(
        {"type": "left_right", "text": "Subtotal:", "right": f"{subtotal:.2f}"}
    )
    if discount:
        lines.append(
            {"type": "left_right", "text": "Discount:", "right": f"-{discount:.2f}"}
        )
    if cgst:
        lines.append({"type": "left_right", "text": "CGST:", "right": f"{cgst:.2f}"})
    if sgst:
        lines.append({"type": "left_right", "text": "SGST:", "right": f"{sgst:.2f}"})
    if igst:
        lines.append({"type": "left_right", "text": "IGST:", "right": f"{igst:.2f}"})

    lines.append({"type": "separator"})
    lines.append(
        {
            "type": "bold",
            "text": f"{'GRAND TOTAL:':<{width - 12}}{'Rs.{:.2f}'.format(grand_total):>12}",
        }
    )
    lines.append({"type": "separator"})

    if paid_amount:
        lines.append(
            {"type": "left_right", "text": "Paid:", "right": f"{paid_amount:.2f}"}
        )
        balance = grand_total - paid_amount
        if balance > 0:
            lines.append(
                {"type": "left_right", "text": "Balance:", "right": f"{balance:.2f}"}
            )

    lines.append({"type": "separator"})
    lines.append({"type": "center", "text": "Thank you for your business!"})
    lines.append({"type": "center", "text": "***"})

    lines.append({"type": "feed", "count": 2})

    return generate_thermal_receipt(lines, printer_size)


def generate_thermal_barcode_label(
    barcode_data: str,
    product_name: str = "",
    price: str = "",
    sku: str = "",
    printer_size: ThermalPrinterSize = ThermalPrinterSize.MM_80,
) -> bytes:
    width = PAPER_WIDTHS[printer_size]
    lines: list[dict] = []

    if product_name:
        lines.append({"type": "bold_center", "text": product_name[:width]})
    if sku:
        lines.append({"type": "center", "text": f"SKU: {sku}"})

    lines.append({"type": "barcode", "text": barcode_data})
    lines.append({"type": "center", "text": barcode_data})

    if price:
        lines.append({"type": "double", "text": f"Rs. {price}"})

    lines.append({"type": "feed", "count": 1})

    return generate_thermal_receipt(lines, printer_size)


def generate_thermal_packing_slip(
    slip_number: str = "",
    slip_date: str = "",
    company: Optional[dict] = None,
    customer: Optional[dict] = None,
    order_number: str = "",
    items: Optional[list[dict]] = None,
    total_qty: int = 0,
    total_packages: int = 0,
    printer_size: ThermalPrinterSize = ThermalPrinterSize.MM_80,
) -> bytes:
    width = PAPER_WIDTHS[printer_size]
    company = company or {}
    customer = customer or {}
    items = items or []

    lines: list[dict] = []

    lines.append({"type": "bold_center", "text": company.get("name", "COMPANY NAME")})
    if company.get("phone"):
        lines.append({"type": "center", "text": f"Ph: {company['phone']}"})

    lines.append({"type": "separator"})
    lines.append({"type": "bold_center", "text": "PACKING SLIP"})
    lines.append({"type": "separator"})

    lines.append({"type": "left_right", "text": "Slip No:", "right": slip_number})
    lines.append({"type": "left_right", "text": "Date:", "right": slip_date})
    if order_number:
        lines.append({"type": "left_right", "text": "Order:", "right": order_number})

    lines.append({"type": "separator"})
    lines.append({"type": "bold", "text": "Ship To:"})
    if customer.get("name"):
        lines.append({"type": "text", "text": customer["name"]})
    if customer.get("address"):
        lines.append({"type": "text", "text": customer["address"][:width]})
    if customer.get("phone"):
        lines.append({"type": "text", "text": f"Ph: {customer['phone']}"})

    lines.append({"type": "separator"})

    col_w = {
        ThermalPrinterSize.MM_80: {"item": 26, "qty": 6, "color": 8, "size": 6},
        ThermalPrinterSize.MM_58: {"item": 16, "qty": 4, "color": 6, "size": 4},
    }[printer_size]

    hdr = f"{'Item':<{col_w['item']}}{'Qty':>{col_w['qty']}}{'Color':<{col_w['color']}}{'Size':<{col_w['size']}}"
    lines.append({"type": "bold", "text": hdr})
    lines.append({"type": "separator"})

    for item in items:
        name = item.get("product_name", "")[: col_w["item"]]
        qty = item.get("quantity", 0)
        color = str(item.get("color", ""))[: col_w["color"]]
        size = str(item.get("size", ""))[: col_w["size"]]
        lines.append(
            {
                "type": "text",
                "text": f"{name:<{col_w['item']}}{qty:>{col_w['qty']}.0f}{color:<{col_w['color']}}{size:<{col_w['size']}}",
            }
        )

    lines.append({"type": "separator"})
    lines.append({"type": "left_right", "text": "Total Qty:", "right": str(total_qty)})
    if total_packages:
        lines.append(
            {"type": "left_right", "text": "Packages:", "right": str(total_packages)}
        )

    lines.append({"type": "separator"})
    lines.append({"type": "center", "text": "Please verify contents before opening"})
    lines.append({"type": "feed", "count": 2})

    return generate_thermal_receipt(lines, printer_size)
