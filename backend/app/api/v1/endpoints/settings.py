import os
import json
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List

from app.api.v1.dependencies import get_current_active_user, require_role
from app.models.models import UserRole

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
PRICING_FILE = os.path.join(DATA_DIR, "pricing.json")

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

def get_pricing_data():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    
    if not os.path.exists(PRICING_FILE):
        with open(PRICING_FILE, "w") as f:
            json.dump(DEFAULT_PRICING, f, indent=4)
        return DEFAULT_PRICING
        
    try:
        with open(PRICING_FILE, "r") as f:
            return json.load(f)
    except:
        return DEFAULT_PRICING

class PricingPlanUpdate(BaseModel):
    id: str
    name: str
    price: str
    desc: str
    features: List[str]
    highlighted: bool

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
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        
    plans_dict = [plan.model_dump() for plan in payload]
    
    with open(PRICING_FILE, "w") as f:
        json.dump(plans_dict, f, indent=4)
        
    return plans_dict
