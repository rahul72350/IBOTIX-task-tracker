import psycopg2
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import CORS_ORIGIN
from app.db import verify_connection
from app.routers import (
    auth, masters, users, projects, processes, assignments, task_updates,
    stats, tickets, notifications, uploads, sprints, admin_tasks,
)
from app.scheduler import start_scheduler, stop_scheduler

app = FastAPI(title="Ibotix PM API (FastAPI edition)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    ok = verify_connection()
    return JSONResponse(
        status_code=200 if ok else 500,
        content={"api": "up", "database": "connected" if ok else "unavailable — check the server console for details"},
    )


app.include_router(auth.router)
app.include_router(masters.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(processes.router)
app.include_router(assignments.router)
app.include_router(task_updates.router)
app.include_router(stats.router)
app.include_router(tickets.router)
app.include_router(notifications.router)
app.include_router(uploads.router)
app.include_router(sprints.router)
app.include_router(admin_tasks.router)


@app.on_event("startup")
def _on_startup():
    start_scheduler()


@app.on_event("shutdown")
def _on_shutdown():
    stop_scheduler()


# ---------------------------------------------------------------------------
# Error handling — normalizes errors to {"error": "..."} like the Node app,
# so the existing frontend's api.js (which reads err.error) keeps working.
# ---------------------------------------------------------------------------
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"error": "Invalid request data.", "details": exc.errors()})


@app.exception_handler(psycopg2.errors.UniqueViolation)
async def unique_violation_handler(request: Request, exc):
    return JSONResponse(status_code=409, content={"error": "That record already exists (duplicate value)."})


@app.exception_handler(psycopg2.errors.ForeignKeyViolation)
async def fk_violation_handler(request: Request, exc):
    return JSONResponse(status_code=400, content={"error": "Related record not found — check the selected values."})


@app.exception_handler(psycopg2.errors.CheckViolation)
async def check_violation_handler(request: Request, exc):
    return JSONResponse(status_code=400, content={"error": "A value failed a database constraint check."})


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    print(f"API error: {exc!r}")
    return JSONResponse(status_code=500, content={"error": str(exc) or "Unexpected server error."})
