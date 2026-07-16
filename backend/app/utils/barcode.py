import io
import enum
from typing import Optional

import barcode
from barcode.writer import ImageWriter
from PIL import Image, ImageDraw, ImageFont
import qrcode


class LabelSize(str, enum.Enum):
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"


LABEL_DIMENSIONS: dict[str, tuple[int, int]] = {
    LabelSize.SMALL: (226, 113),
    LabelSize.MEDIUM: (340, 170),
    LabelSize.LARGE: (453, 226),
}

LABEL_FONT_SIZES: dict[str, int] = {
    LabelSize.SMALL: 8,
    LabelSize.MEDIUM: 10,
    LabelSize.LARGE: 14,
}


def _mm_to_px(mm: float, dpi: int = 203) -> int:
    return int(mm * dpi / 25.4)


def generate_barcode_png(data: str, barcode_format: str = "code128") -> bytes:
    try:
        writer = ImageWriter()
        barcode_class = barcode.get_barcode_class(barcode_format)
        bc = barcode_class(data, writer=writer)
        buffer = io.BytesIO()
        bc.write(
            buffer,
            options={
                "module_height": 8.0,
                "module_width": 0.3,
                "quiet_zone": 2.0,
                "font_size": 8,
                "text_distance": 3.0,
                "write_text": True,
            },
        )
        buffer.seek(0)
        return buffer.read()
    except Exception as exc:
        raise ValueError(f"Barcode generation failed: {exc}") from exc


def generate_qr_png(data: str, box_size: int = 10, border: int = 2) -> bytes:
    try:
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=box_size,
            border=border,
        )
        qr.add_data(data)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer.read()
    except Exception as exc:
        raise ValueError(f"QR code generation failed: {exc}") from exc


def generate_product_label(
    product_name: str,
    barcode_data: str,
    sku: str,
    price: Optional[str] = None,
    size: LabelSize = LabelSize.MEDIUM,
    mrp: Optional[str] = None,
) -> bytes:
    try:
        width, height = LABEL_DIMENSIONS[size]
        font_size = LABEL_FONT_SIZES[size]

        label = Image.new("RGB", (width, height), "white")
        draw = ImageDraw.Draw(label)

        try:
            font = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size
            )
            font_small = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", max(font_size - 2, 6)
            )
        except (OSError, IOError):
            font = ImageFont.load_default()
            font_small = font

        barcode_png = generate_barcode_png(barcode_data)
        barcode_img = Image.open(io.BytesIO(barcode_png))

        barcode_area_height = int(height * 0.55)
        text_area_height = height - barcode_area_height

        max_barcode_w = width - 20
        max_barcode_h = barcode_area_height - 10
        ratio = min(
            max_barcode_w / barcode_img.width, max_barcode_h / barcode_img.height
        )
        new_bc_w = int(barcode_img.width * ratio)
        new_bc_h = int(barcode_img.height * ratio)
        barcode_img = barcode_img.resize((new_bc_w, new_bc_h), Image.LANCZOS)

        bc_x = (width - new_bc_w) // 2
        bc_y = 5
        label.paste(barcode_img, (bc_x, bc_y))

        text_y = barcode_area_height + 2
        padding = 8

        draw.text((padding, text_y), product_name[:40], fill="black", font=font)
        text_y += font_size + 4

        draw.text((padding, text_y), f"SKU: {sku}", fill="black", font=font_small)
        text_y += font_size + 2

        if mrp:
            draw.text((padding, text_y), f"MRP: Rs.{mrp}", fill="black", font=font)
            text_y += font_size + 2

        if price:
            draw.text(
                (padding, text_y), f"Price: Rs.{price}", fill="black", font=font_small
            )

        draw.rectangle([0, 0, width - 1, height - 1], outline="black", width=1)

        buffer = io.BytesIO()
        label.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer.read()
    except Exception as exc:
        raise ValueError(f"Product label generation failed: {exc}") from exc


def generate_bundle_label(
    bundle_number: str,
    production_number: str,
    product_name: str,
    color: Optional[str] = None,
    size_label: Optional[str] = None,
    quantity: Optional[str] = None,
    stage: Optional[str] = None,
    label_size: LabelSize = LabelSize.MEDIUM,
) -> bytes:
    try:
        width, height = LABEL_DIMENSIONS[label_size]
        font_size = LABEL_FONT_SIZES[label_size]

        label = Image.new("RGB", (width, height), "white")
        draw = ImageDraw.Draw(label)

        try:
            font = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size
            )
            font_small = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", max(font_size - 2, 6)
            )
            font_bold = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size + 2
            )
        except (OSError, IOError):
            font = ImageFont.load_default()
            font_small = font
            font_bold = font

        barcode_area_height = int(height * 0.50)

        qr_png = generate_qr_png(bundle_number, box_size=6, border=1)
        qr_img = Image.open(io.BytesIO(qr_png))

        qr_size = min(barcode_area_height - 10, width - 20)
        qr_img = qr_img.resize((qr_size, qr_size), Image.LANCZOS)

        bc_png = generate_barcode_png(bundle_number)
        bc_img = Image.open(io.BytesIO(bc_png))

        bc_area_w = width - qr_size - 30
        max_bc_h = barcode_area_height - 10
        bc_ratio = min(bc_area_w / bc_img.width, max_bc_h / bc_img.height)
        new_bc_w = int(bc_img.width * bc_ratio)
        new_bc_h = int(bc_img.height * bc_ratio)
        bc_img = bc_img.resize((new_bc_w, new_bc_h), Image.LANCZOS)

        qr_x = 5
        qr_y = 5
        label.paste(qr_img, (qr_x, qr_y))

        bc_x = qr_size + 15
        bc_y = (barcode_area_height - new_bc_h) // 2
        label.paste(bc_img, (bc_x, max(bc_y, 5)))

        draw.line(
            [(0, barcode_area_height), (width, barcode_area_height)],
            fill="black",
            width=1,
        )

        text_y = barcode_area_height + 3
        padding = 8

        draw.text(
            (padding, text_y), f"Bundle: {bundle_number}", fill="black", font=font_bold
        )
        text_y += font_size + 6

        draw.text(
            (padding, text_y), f"PO: {production_number}", fill="black", font=font_small
        )
        text_y += font_size + 2

        draw.text((padding, text_y), product_name[:35], fill="black", font=font_small)
        text_y += font_size + 2

        details = []
        if color:
            details.append(f"Color: {color}")
        if size_label:
            details.append(f"Size: {size_label}")
        if quantity:
            details.append(f"Qty: {quantity}")
        if stage:
            details.append(f"Stage: {stage}")

        if details:
            draw.text(
                (padding, text_y), " | ".join(details), fill="black", font=font_small
            )

        draw.rectangle([0, 0, width - 1, height - 1], outline="black", width=1)

        buffer = io.BytesIO()
        label.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer.read()
    except Exception as exc:
        raise ValueError(f"Bundle label generation failed: {exc}") from exc


def generate_fabric_roll_label(
    roll_number: str,
    fabric_name: str,
    color: Optional[str] = None,
    shade: Optional[str] = None,
    gsm: Optional[str] = None,
    width: Optional[str] = None,
    length_meters: Optional[str] = None,
    label_size: LabelSize = LabelSize.MEDIUM,
) -> bytes:
    """Same layout as generate_bundle_label, adapted for fabric-roll fields."""
    try:
        width_px, height_px = LABEL_DIMENSIONS[label_size]
        font_size = LABEL_FONT_SIZES[label_size]

        label = Image.new("RGB", (width_px, height_px), "white")
        draw = ImageDraw.Draw(label)

        try:
            font_small = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", max(font_size - 2, 6)
            )
            font_bold = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size + 2
            )
        except (OSError, IOError):
            font_small = ImageFont.load_default()
            font_bold = font_small

        barcode_area_height = int(height_px * 0.50)

        qr_png = generate_qr_png(roll_number, box_size=6, border=1)
        qr_img = Image.open(io.BytesIO(qr_png))
        qr_size = min(barcode_area_height - 10, width_px - 20)
        qr_img = qr_img.resize((qr_size, qr_size), Image.LANCZOS)

        bc_png = generate_barcode_png(roll_number)
        bc_img = Image.open(io.BytesIO(bc_png))
        bc_area_w = width_px - qr_size - 30
        max_bc_h = barcode_area_height - 10
        bc_ratio = min(bc_area_w / bc_img.width, max_bc_h / bc_img.height)
        new_bc_w = int(bc_img.width * bc_ratio)
        new_bc_h = int(bc_img.height * bc_ratio)
        bc_img = bc_img.resize((new_bc_w, new_bc_h), Image.LANCZOS)

        label.paste(qr_img, (5, 5))
        bc_x = qr_size + 15
        bc_y = (barcode_area_height - new_bc_h) // 2
        label.paste(bc_img, (bc_x, max(bc_y, 5)))

        draw.line(
            [(0, barcode_area_height), (width_px, barcode_area_height)],
            fill="black",
            width=1,
        )

        text_y = barcode_area_height + 3
        padding = 8

        draw.text(
            (padding, text_y), f"Roll: {roll_number}", fill="black", font=font_bold
        )
        text_y += font_size + 6

        draw.text((padding, text_y), fabric_name[:35], fill="black", font=font_small)
        text_y += font_size + 2

        details = []
        if color:
            details.append(f"Color: {color}")
        if shade:
            details.append(f"Shade: {shade}")
        if gsm:
            details.append(f"GSM: {gsm}")
        if width:
            details.append(f'W: {width}"')
        if length_meters:
            details.append(f"{length_meters}m")

        if details:
            draw.text(
                (padding, text_y), " | ".join(details), fill="black", font=font_small
            )

        draw.rectangle([0, 0, width_px - 1, height_px - 1], outline="black", width=1)

        buffer = io.BytesIO()
        label.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer.read()
    except Exception as exc:
        raise ValueError(f"Fabric roll label generation failed: {exc}") from exc


def generate_lot_label(
    lot_number: str,
    style_name: str,
    production_number: Optional[str] = None,
    total_pieces: Optional[str] = None,
    cutting_date: Optional[str] = None,
    label_size: LabelSize = LabelSize.MEDIUM,
) -> bytes:
    """Same layout as generate_bundle_label/generate_fabric_roll_label, for
    cutting-lot labels (module 4)."""
    try:
        width_px, height_px = LABEL_DIMENSIONS[label_size]
        font_size = LABEL_FONT_SIZES[label_size]

        label = Image.new("RGB", (width_px, height_px), "white")
        draw = ImageDraw.Draw(label)

        try:
            font_small = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", max(font_size - 2, 6)
            )
            font_bold = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size + 2
            )
        except (OSError, IOError):
            font_small = ImageFont.load_default()
            font_bold = font_small

        barcode_area_height = int(height_px * 0.50)

        qr_png = generate_qr_png(lot_number, box_size=6, border=1)
        qr_img = Image.open(io.BytesIO(qr_png))
        qr_size = min(barcode_area_height - 10, width_px - 20)
        qr_img = qr_img.resize((qr_size, qr_size), Image.LANCZOS)

        bc_png = generate_barcode_png(lot_number)
        bc_img = Image.open(io.BytesIO(bc_png))
        bc_area_w = width_px - qr_size - 30
        max_bc_h = barcode_area_height - 10
        bc_ratio = min(bc_area_w / bc_img.width, max_bc_h / bc_img.height)
        new_bc_w = int(bc_img.width * bc_ratio)
        new_bc_h = int(bc_img.height * bc_ratio)
        bc_img = bc_img.resize((new_bc_w, new_bc_h), Image.LANCZOS)

        label.paste(qr_img, (5, 5))
        bc_x = qr_size + 15
        bc_y = (barcode_area_height - new_bc_h) // 2
        label.paste(bc_img, (bc_x, max(bc_y, 5)))

        draw.line(
            [(0, barcode_area_height), (width_px, barcode_area_height)],
            fill="black",
            width=1,
        )

        text_y = barcode_area_height + 3
        padding = 8

        draw.text((padding, text_y), f"Lot: {lot_number}", fill="black", font=font_bold)
        text_y += font_size + 6

        draw.text((padding, text_y), style_name[:35], fill="black", font=font_small)
        text_y += font_size + 2

        details = []
        if production_number:
            details.append(f"PO: {production_number}")
        if total_pieces:
            details.append(f"Pcs: {total_pieces}")
        if cutting_date:
            details.append(cutting_date)

        if details:
            draw.text(
                (padding, text_y), " | ".join(details), fill="black", font=font_small
            )

        draw.rectangle([0, 0, width_px - 1, height_px - 1], outline="black", width=1)

        buffer = io.BytesIO()
        label.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer.read()
    except Exception as exc:
        raise ValueError(f"Lot label generation failed: {exc}") from exc


def _generic_two_field_label(
    code_value: str,
    title: str,
    line1: str = "",
    line2: str = "",
    label_size: LabelSize = LabelSize.MEDIUM,
) -> bytes:
    """Shared rendering body for the module-16 label types below --
    employee ID card, machine/warehouse/carton/finished-goods labels all
    have the same visual shape (QR + barcode + a title + up to two detail
    lines) as generate_bundle_label/generate_fabric_roll_label/
    generate_lot_label. Extracted here once these hit a fourth near-
    identical copy, rather than pasting the same ~50 lines a fourth time."""
    try:
        width_px, height_px = LABEL_DIMENSIONS[label_size]
        font_size = LABEL_FONT_SIZES[label_size]

        label = Image.new("RGB", (width_px, height_px), "white")
        draw = ImageDraw.Draw(label)

        try:
            font_small = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", max(font_size - 2, 6)
            )
            font_bold = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size + 2
            )
        except (OSError, IOError):
            font_small = ImageFont.load_default()
            font_bold = font_small

        barcode_area_height = int(height_px * 0.50)

        qr_png = generate_qr_png(code_value, box_size=6, border=1)
        qr_img = Image.open(io.BytesIO(qr_png))
        qr_size = min(barcode_area_height - 10, width_px - 20)
        qr_img = qr_img.resize((qr_size, qr_size), Image.LANCZOS)

        bc_png = generate_barcode_png(code_value)
        bc_img = Image.open(io.BytesIO(bc_png))
        bc_area_w = width_px - qr_size - 30
        max_bc_h = barcode_area_height - 10
        bc_ratio = min(bc_area_w / bc_img.width, max_bc_h / bc_img.height)
        new_bc_w = int(bc_img.width * bc_ratio)
        new_bc_h = int(bc_img.height * bc_ratio)
        bc_img = bc_img.resize((new_bc_w, new_bc_h), Image.LANCZOS)

        label.paste(qr_img, (5, 5))
        bc_x = qr_size + 15
        bc_y = (barcode_area_height - new_bc_h) // 2
        label.paste(bc_img, (bc_x, max(bc_y, 5)))

        draw.line([(0, barcode_area_height), (width_px, barcode_area_height)], fill="black", width=1)

        text_y = barcode_area_height + 3
        padding = 8
        draw.text((padding, text_y), title[:35], fill="black", font=font_bold)
        text_y += font_size + 6
        if line1:
            draw.text((padding, text_y), line1[:35], fill="black", font=font_small)
            text_y += font_size + 2
        if line2:
            draw.text((padding, text_y), line2[:35], fill="black", font=font_small)

        draw.rectangle([0, 0, width_px - 1, height_px - 1], outline="black", width=1)

        buffer = io.BytesIO()
        label.save(buffer, format="PNG")
        buffer.seek(0)
        return buffer.read()
    except Exception as exc:
        raise ValueError(f"Label generation failed: {exc}") from exc


def generate_employee_id_card(employee_code: str, full_name: str, department: str = "", designation: str = "", label_size: LabelSize = LabelSize.MEDIUM) -> bytes:
    return _generic_two_field_label(employee_code, f"ID: {employee_code}", full_name, department, label_size)


def generate_machine_label(machine_code: str, machine_name: str, machine_type: str = "", label_size: LabelSize = LabelSize.MEDIUM) -> bytes:
    return _generic_two_field_label(machine_code, f"Machine: {machine_code}", machine_name, machine_type, label_size)


def generate_warehouse_label(warehouse_code: str, warehouse_name: str, warehouse_type: str = "", label_size: LabelSize = LabelSize.MEDIUM) -> bytes:
    return _generic_two_field_label(warehouse_code, f"Warehouse: {warehouse_code}", warehouse_name, warehouse_type, label_size)


def generate_rack_label(location_code: str, warehouse_name: str = "", label_size: LabelSize = LabelSize.SMALL) -> bytes:
    """Rack/Shelf label -- this schema has no separate Rack/Shelf master
    (FabricRoll.rack_location is a free-text field, module 3); this
    renders a location code as a printable sticker without inventing a
    new Rack/Shelf entity hierarchy that nothing else in the ERP uses."""
    return _generic_two_field_label(location_code, f"Location: {location_code}", warehouse_name, "", label_size)


def generate_carton_label(carton_barcode: str, carton_number: str, packing_number: str = "", label_size: LabelSize = LabelSize.MEDIUM) -> bytes:
    return _generic_two_field_label(carton_barcode, f"Carton: {carton_number}", f"Packing: {packing_number}" if packing_number else "", "", label_size)


def generate_finished_goods_label(product_sku: str, product_name: str, color: str = "", size: str = "", label_size: LabelSize = LabelSize.MEDIUM) -> bytes:
    detail = " / ".join(x for x in [color, size] if x)
    return _generic_two_field_label(product_sku, product_name, detail, "", label_size)
