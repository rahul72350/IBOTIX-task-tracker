from fastapi import APIRouter, Depends

from app.db import query
from app.auth import get_current_user

router = APIRouter(prefix="/api/masters", tags=["Masters"])


@router.get("")
def get_all_masters(current_user: dict = Depends(get_current_user)):
    """Read-only master lists used for dropdowns throughout the app.
    There's no admin UI to manage these any more (Configure was removed
    along with Task Types) — these rows are fixed at the values schema.sql
    seeds, edited directly in the database if they ever need to change."""
    task_statuses = query("select * from task_statuses where is_active order by sort_order, name")
    project_statuses = query("select * from project_statuses where is_active order by sort_order, name")
    priorities = query("select * from priorities where is_active order by sort_order, name")
    departments = query("select * from departments where is_active order by sort_order, name")
    designations = query("""
        select d.id, d.name, d.is_active, d.department_id, dp.name as department_name
          from designations d
          left join departments dp on dp.id = d.department_id
         where d.is_active
         order by d.name
    """)
    return {
        "task_statuses": task_statuses,
        "project_statuses": project_statuses,
        "priorities": priorities,
        "departments": departments,
        "designations": designations,
    }
