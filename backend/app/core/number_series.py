from sqlalchemy.orm import Session

from app.models.models import NumberSeries


MODULE_PREFIXES = {
    "purchase_order": "PO",
    "sales_order": "SO",
    "quotation": "QT",
    "invoice": "INV",
    "grn": "GRN",
    "delivery_challan": "DC",
    "purchase_invoice": "PINV",
    "payment": "PAY",
    "receipt": "RCPT",
    "journal_entry": "JV",
    "production_order": "PROD",
    "bom": "BOM",
    "quality_check": "QC",
    "job_work_order": "JWO",
    "stock_transfer": "ST",
    "stock_adjustment": "SA",
    "employee": "EMP",
    "customer": "CUST",
    "vendor": "VEND",
    "product": "PRD",
}


def generate_number(db: Session, module: str) -> str:
    prefix = MODULE_PREFIXES.get(module, module.upper()[:3])

    series = db.query(NumberSeries).filter(NumberSeries.module == module).first()

    if not series:
        series = NumberSeries(
            series_name=f"{module.replace('_', ' ').title()} Series",
            prefix=prefix,
            current_number=0,
            pad_length=5,
            module=module,
        )
        db.add(series)
        db.flush()

    series.current_number += 1
    db.flush()

    padded = str(series.current_number).zfill(series.pad_length)
    number = f"{series.prefix}-{padded}"

    if series.suffix:
        number = f"{number}-{series.suffix}"

    return number
