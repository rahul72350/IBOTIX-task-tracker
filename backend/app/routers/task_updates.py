import os

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from typing import Optional

from app.db import query
from app.auth import get_current_user, scope_department
from app import storage
from app.hr_sync import sync_hr_project_status

router = APIRouter(prefix="/api/task-updates", tags=["Task Updates"])

TU_SELECT = """
  select tu.id, tu.user_id, tu.project_id, tu.process_id,
         tu.entry_date, tu.duration_hours, tu.status_id, tu.remarks, tu.created_at,
         tu.attachment_file_name, tu.attachment_url, tu.attachment_size_kb, tu.attachment_type,
         tu.attachment_storage,
         json_build_object('id', p.id,  'name', p.name)  as projects,
         json_build_object('id', pr.id, 'name', pr.name, 'department', dept.name) as processes,
         json_build_object('id', u.id,  'full_name', u.full_name) as profiles,
         case when ts.id is null then null
              else json_build_object('id', ts.id, 'name', ts.name) end as task_statuses
    from task_updates tu
    join projects  p  on p.id  = tu.project_id
    join processes pr on pr.id = tu.process_id
    join users     u  on u.id  = tu.user_id
    left join task_statuses ts   on ts.id   = tu.status_id
    left join departments   dept on dept.id = pr.department_id
"""


class TaskUpdateCreateBody(BaseModel):
    project_id: int
    process_id: int
    entry_date: Optional[str] = None
    duration_hours: Optional[float] = None
    remarks: Optional[str] = None
    status_id: int


@router.get("")
def list_task_updates(
    mine: Optional[str] = Query(None),
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    process_id: Optional[int] = Query(None),
    status_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    limit: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    where = []
    params = []
    dept = scope_department(current_user)

    if current_user["role"] == "user" or mine == "1":
        where.append("tu.user_id = %s")
        params.append(current_user["id"])
    elif user_id:
        where.append("tu.user_id = %s")
        params.append(user_id)

    if dept is not None:  # department_admin: only their own department's entries
        where.append("pr.department_id = %s")
        params.append(dept)
    elif current_user["role"] == "super_admin":
        # HR OPS TEAM / HR OPS aren't shown to a super admin anywhere —
        # including this feed (Recent submissions on the dashboard).
        where.append("not exists (select 1 from departments hd where hd.id = pr.department_id and hd.is_hr_workflow)")

    if from_:
        where.append("tu.entry_date >= %s")
        params.append(from_)
    if to:
        where.append("tu.entry_date <= %s")
        params.append(to)
    if project_id:
        where.append("tu.project_id = %s")
        params.append(project_id)
    if process_id:
        where.append("tu.process_id = %s")
        params.append(process_id)
    if status_id:
        where.append("tu.status_id = %s")
        params.append(status_id)

    sql = TU_SELECT + (" where " + " and ".join(where) if where else "")
    sql += " order by tu.entry_date desc, tu.created_at desc"
    if limit:
        sql += " limit %s"
        params.append(limit)

    return query(sql, params)


@router.post("", status_code=201)
def create_task_update(body: TaskUpdateCreateBody, current_user: dict = Depends(get_current_user)):
    """Logging a status here IS setting the process's status — every
    department works this way now (no more per-department split, no
    task type, no progress percentage). Completed also pins progress_pct
    to 100, mostly for older rows/charts that still read it."""
    if current_user["role"] == "user":
        owns = query("select 1 from assignments where user_id = %s and process_id = %s",
                     [current_user["id"], body.process_id])
        if not owns:
            raise HTTPException(status_code=403, detail="That process is not assigned to you.")
    else:
        from app.auth import assert_department_access
        process = query("select department_id from processes where id = %s", [body.process_id])
        if not process:
            raise HTTPException(status_code=404, detail="Process not found.")
        assert_department_access(current_user, process[0]["department_id"])

    rows = query(
        """insert into task_updates
             (user_id, project_id, process_id, entry_date, duration_hours, status_id, remarks)
           values (%s,%s,%s,coalesce(%s, current_date),%s,%s,%s)
           returning id""",
        [
            current_user["id"], body.project_id, body.process_id,
            body.entry_date, body.duration_hours,
            body.status_id, body.remarks,
        ],
    )
    new_id = rows[0]["id"]

    status_row = query("select name from task_statuses where id = %s", [body.status_id])
    status_name = status_row[0]["name"] if status_row else None

    if status_name == "Completed":
        query("update processes set status_id = %s, progress_pct = 100 where id = %s",
              [body.status_id, body.process_id])
    else:
        query("update processes set status_id = %s where id = %s", [body.status_id, body.process_id])

    sync_hr_project_status(body.project_id)

    created = query(TU_SELECT + " where tu.id = %s", [new_id])
    return created[0]


# ---------------------------------------------------------------------------
# Optional file attachment — uploaded as a second step right after creating
# the entry (keeps the main POST above as plain JSON). One file per entry.
# Goes to Cloudflare R2 when configured, local disk otherwise — see
# app/storage.py. The stored backend is remembered per-row so old local
# files keep working even after R2 gets turned on for new ones.
# ---------------------------------------------------------------------------
@router.post("/{update_id}/attachment")
def upload_attachment(update_id: int, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    owner_check = query("select user_id from task_updates where id = %s", [update_id])
    if not owner_check:
        raise HTTPException(status_code=404, detail="Entry not found.")
    if current_user["role"] == "user" and owner_check[0]["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only attach files to your own entries.")

    content = file.file.read()
    max_bytes = 15 * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail="File is too large (max 15 MB).")

    ext = os.path.splitext(file.filename)[1]
    stored = storage.upload_file(file.filename, content, file.content_type)

    query(
        """update task_updates set attachment_file_name = %s, attachment_url = %s,
                                   attachment_size_kb = %s, attachment_type = %s,
                                   attachment_storage = %s
            where id = %s""",
        [file.filename, stored["key"], max(1, len(content) // 1024), ext.replace(".", "") or "file",
         stored["storage"], update_id],
    )
    updated = query(TU_SELECT + " where tu.id = %s", [update_id])
    return updated[0]


@router.get("/{update_id}/download")
def download_attachment(update_id: int, current_user: dict = Depends(get_current_user)):
    """Single download endpoint regardless of backend — redirects to a
    signed R2 URL, or streams the local file, based on how this entry's
    attachment was stored."""
    row = query(
        "select user_id, attachment_url, attachment_storage from task_updates where id = %s",
        [update_id],
    )
    if not row or not row[0]["attachment_url"]:
        raise HTTPException(status_code=404, detail="No attachment on this entry.")

    if current_user["role"] == "user" and row[0]["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only download your own attachments.")

    if current_user["role"] == "department_admin":
        owner_dept = query(
            """select pr.department_id from task_updates tu join processes pr on pr.id = tu.process_id
                where tu.id = %s""", [update_id],
        )
        dept = scope_department(current_user)
        if not owner_dept or owner_dept[0]["department_id"] != dept:
            raise HTTPException(status_code=403, detail="That belongs to a different department.")

    return storage.get_download(row[0]["attachment_storage"] or "local", row[0]["attachment_url"])



@router.delete("/{update_id}")
def delete_task_update(update_id: int, current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "user":
        rows = query("delete from task_updates where id = %s and user_id = %s returning id",
                     [update_id, current_user["id"]])
    else:
        dept = scope_department(current_user)
        if dept is not None:
            rows = query(
                """delete from task_updates tu using processes pr
                    where tu.id = %s and tu.process_id = pr.id and pr.department_id = %s
                returning tu.id""",
                [update_id, dept],
            )
        else:
            rows = query("delete from task_updates where id = %s returning id", [update_id])
    if not rows:
        raise HTTPException(status_code=404, detail="Entry not found, or not yours to delete.")
    return {"ok": True}
