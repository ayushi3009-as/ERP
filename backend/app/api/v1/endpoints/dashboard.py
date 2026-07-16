from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Any
from datetime import datetime

from app.core.database import get_db
from app.models.models import Lot, User, ProductionStage
from app.schemas.schemas import DashboardStats
from app.api.deps import get_current_active_user

router = APIRouter()

@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_active_user)
) -> Any:
    """
    Get dashboard statistics for manufacturing.
    """
    today = datetime.now().date()
    
    # Completed lots (in FINISHED or DISPATCH stage)
    completed_stages = [ProductionStage.FINISHED.value, ProductionStage.DISPATCH.value]
    completed_lots = db.query(Lot).filter(
        Lot.is_deleted == False,
        Lot.current_process.in_(completed_stages)
    ).count()
    
    # Pending lots (not finished/dispatch)
    pending_lots = db.query(Lot).filter(
        Lot.is_deleted == False,
        ~Lot.current_process.in_(completed_stages)
    ).count()
    
    # Today's production (lots created today)
    today_production = db.query(Lot).filter(
        Lot.is_deleted == False,
        func.date(Lot.created_at) == today
    ).count()
    
    # Active employees
    active_employees = db.query(User).filter(
        User.is_active == True,
        User.is_deleted == False
    ).count()
    
    return DashboardStats(
        today_production=today_production,
        pending_lots=pending_lots,
        completed_lots=completed_lots,
        active_employees=active_employees
    )
