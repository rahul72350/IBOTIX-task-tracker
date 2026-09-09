from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.db import query
from app.auth import get_current_user, scope_department

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])

UPLOAD_SELECT = """
  select tu.id, tu.attachment_file_name as file_name, tu.attachment_size_kb as size_kb,
         tu.attachment_type as file_type, tu.created_at as uploaded_at, tu.remarks,
         json_build_object('id', u.id, 'full_name', u.full_name) as uploaded_by,
         json_build_object('id', p.id, 'name', p.name) as project,
         json_build_object('id', pr.id, 'name', pr.name, 'department', dept.name) as process
    from task_updates tu
    join users u on u.id = tu.user_id
    join projects p on p.id = tu.project_id
    join processes pr on pr.id = tu.process_id
    join departments dept on dept.id = pr.department_id
   where tu.attachment_file_name is not null
"""


@router.get("")
def list_uploads(
    user_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    limit: Optional[int] = Query(None),
    mine: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """
    A general user sees only their own uploads. A department_admin sees
    their department's latest uploads (default 10), with optional
    ?user_id= and ?search= (matches file name, remarks, or uploader name)
    — or, if they pass ?mine=1 (e.g. while using "User view" on the
    frontend), just their own, exactly like a general user would see.
    A super_admin can call this too (sees everything) but the UI never
    shows this tab to them.
    """
    where = ["tu.attachment_file_name is not null"]
    params = []

    if current_user["role"] == "user" or mine == "1":
        where.append("tu.user_id = %s")
        params.append(current_user["id"])
        default_limit = 100
    else:
        dept = scope_department(current_user)
        if dept is not None:
            where.append("pr.department_id = %s")
            params.append(dept)
            if user_id:
                owner = query("select department_id from users where id = %s", [user_id])
                if not owner or owner[0]["department_id"] != dept:
                    raise HTTPException(status_code=403, detail="That person isn't in your department.")
        if user_id:
            where.append("tu.user_id = %s")
            params.append(user_id)
        default_limit = 10

    if search:
        where.append("(tu.attachment_file_name ilike %s or tu.remarks ilike %s or u.full_name ilike %s)")
        like = f"%{search}%"
        params.extend([like, like, like])

    sql = UPLOAD_SELECT.replace("where tu.attachment_file_name is not null", "where " + " and ".join(where))
    sql += " order by tu.created_at desc limit %s"
    params.append(limit or default_limit)

    return query(sql, params)
