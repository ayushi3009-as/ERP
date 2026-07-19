import os
import json
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional

from app.api.v1.dependencies import get_current_active_user, require_role
from app.models.models import UserRole

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
PRICING_FILE = os.path.join(DATA_DIR, "pricing.json")
EMAIL_FILE = os.path.join(DATA_DIR, "email_settings.json")
WHATSAPP_FILE = os.path.join(DATA_DIR, "whatsapp_settings.json")
PRINTERS_FILE = os.path.join(DATA_DIR, "printers_settings.json")

DEFAULT_PRICING = [
    {
        "id": "trial",
        "name": "Trial",
        "price": "Free",
        "desc": "7 Days",
        "features": ["Up to 5 Employees", "Basic Lot Tracking", "Standard Reports"],
        "highlighted": False
    },
    {
        "id": "basic",
        "name": "Basic",
        "price": "₹999",
        "desc": "Per Month",
        "features": ["Up to 20 Employees", "QR Code Generation", "Payroll Management"],
        "highlighted": True
    },
    {
        "id": "premium",
        "name": "Premium",
        "price": "₹2499",
        "desc": "Per Month",
        "features": ["Unlimited Employees", "Advanced Multi-stage Lots", "Priority Support"],
        "highlighted": False
    },
    {
        "id": "enterprise",
        "name": "Enterprise",
        "price": "Custom",
        "desc": "Contact Us",
        "features": ["Custom Workflows", "Dedicated Server", "On-site Training"],
        "highlighted": False
    }
]

DEFAULT_EMAIL = {
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_username": "",
    "smtp_password": "",
    "from_email": "",
    "from_name": ""
}

DEFAULT_WHATSAPP = {
    "api_key": "",
    "phone_number_id": "",
    "webhook_url": ""
}

DEFAULT_PRINTERS = []

def _ensure_data_dir():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)

def _read_json(filepath, default):
    _ensure_data_dir()
    if not os.path.exists(filepath):
        with open(filepath, "w") as f:
            json.dump(default, f, indent=4)
        return default
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except:
        return default

def _write_json(filepath, data):
    _ensure_data_dir()
    with open(filepath, "w") as f:
        json.dump(data, f, indent=4)

def get_pricing_data():
    return _read_json(PRICING_FILE, DEFAULT_PRICING)

class PricingPlanUpdate(BaseModel):
    id: str
    name: str
    price: str
    desc: str
    features: List[str]
    highlighted: bool

class EmailSettings(BaseModel):
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    from_email: str = ""
    from_name: str = ""

class WhatsAppSettings(BaseModel):
    api_key: str = ""
    phone_number_id: str = ""
    webhook_url: str = ""

class PrinterSettings(BaseModel):
    name: str
    paper_size: str = "A4"
    is_default: bool = False

@router.get("/pricing", response_model=List[PricingPlanUpdate])
def get_pricing_public():
    """Public endpoint to fetch current pricing plans for the landing page."""
    return get_pricing_data()

@router.post("/pricing", response_model=List[PricingPlanUpdate])
def update_pricing_admin(
    payload: List[PricingPlanUpdate],
    current_user=Depends(require_role([UserRole.SUPER_ADMIN])),
):
    """Admin endpoint to completely overwrite the pricing plans."""
    plans_dict = [plan.model_dump() for plan in payload]
    _write_json(PRICING_FILE, plans_dict)
    return plans_dict

# Email Settings
@router.get("/email", response_model=EmailSettings)
def get_email_settings(current_user=Depends(get_current_active_user)):
    return _read_json(EMAIL_FILE, DEFAULT_EMAIL)

@router.put("/email", response_model=EmailSettings)
def update_email_settings(
    payload: EmailSettings,
    current_user=Depends(get_current_active_user),
):
    data = payload.model_dump()
    _write_json(EMAIL_FILE, data)
    return data

# WhatsApp Settings
@router.get("/whatsapp", response_model=WhatsAppSettings)
def get_whatsapp_settings(current_user=Depends(get_current_active_user)):
    return _read_json(WHATSAPP_FILE, DEFAULT_WHATSAPP)

@router.put("/whatsapp", response_model=WhatsAppSettings)
def update_whatsapp_settings(
    payload: WhatsAppSettings,
    current_user=Depends(get_current_active_user),
):
    data = payload.model_dump()
    _write_json(WHATSAPP_FILE, data)
    return data

# Printer Settings
@router.get("/printers", response_model=List[PrinterSettings])
def get_printer_settings(current_user=Depends(get_current_active_user)):
    return _read_json(PRINTERS_FILE, DEFAULT_PRINTERS)

@router.put("/printers", response_model=List[PrinterSettings])
def update_printer_settings(
    payload: List[PrinterSettings],
    current_user=Depends(get_current_active_user),
):
    data = [p.model_dump() for p in payload]
    _write_json(PRINTERS_FILE, data)
    return data
