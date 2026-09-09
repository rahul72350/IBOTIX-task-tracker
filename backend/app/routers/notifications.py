from fastapi import APIRouter, Depends

from app.deadlines import check_and_send_deadline_alerts, check_and_send_overdue_alerts
from app.auth import require_admin

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.post("/check-deadlines")
def trigger_deadline_check(admin: dict = Depends(require_admin)):
    """Runs the deadline check immediately instead of waiting for the
    background schedule — handy for testing your SMTP setup."""
    return check_and_send_deadline_alerts()


@router.post("/check-overdue")
def trigger_overdue_check(admin: dict = Depends(require_admin)):
    """Runs the overdue check immediately — for processes whose due date
    has already passed, not just coming up."""
    return check_and_send_overdue_alerts()
