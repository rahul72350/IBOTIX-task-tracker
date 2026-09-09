import os
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "ibotix_pm")

PORT = int(os.getenv("PORT", "8000"))
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "http://localhost:5173")

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-insecure-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 12

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@ibotix.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ADMIN_NAME = os.getenv("ADMIN_NAME", "Admin User")

# ---- File uploads (task-update attachments) ----
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---- Email (deadline alerts) ----
# Leave SMTP_HOST blank to disable real sending — emails are printed to the
# console instead, so you can see exactly what would be sent while testing.
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "Ibotix PM <no-reply@ibotix.com>")
# Who gets the deadline-alert emails. Falls back to ADMIN_EMAIL if unset.
ADMIN_NOTIFY_EMAIL = os.getenv("ADMIN_NOTIFY_EMAIL", "") or ADMIN_EMAIL
# How many days out counts as "deadline coming up".
DEADLINE_WARNING_DAYS = int(os.getenv("DEADLINE_WARNING_DAYS", "2"))
# How often the background check runs, in minutes.
DEADLINE_CHECK_INTERVAL_MINUTES = int(os.getenv("DEADLINE_CHECK_INTERVAL_MINUTES", "60"))

# ---- Cloudflare R2 (object storage for attachments) ----
# Leave any of these blank to fall back to local disk storage automatically
# — nothing else needs to change; uploads just keep working either way.
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.getenv("R2_BUCKET", "")
# How long a generated download link stays valid, in seconds.
R2_SIGNED_URL_EXPIRY = int(os.getenv("R2_SIGNED_URL_EXPIRY", "300"))

# ---- AWS S3 (object storage for attachments) ----
# A second, genuine-AWS option alongside R2 above — same fallback rule:
# leave any of these blank and storage.py falls back to R2, then to local
# disk. Checked ahead of R2 when both happen to be configured.
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = os.getenv("AWS_REGION", "")
S3_BUCKET = os.getenv("S3_BUCKET", "")
# Optional — every object key gets this prefix, so one bucket can be
# shared safely with other apps/projects.
S3_PREFIX = os.getenv("S3_PREFIX", "").strip("/")
S3_SIGNED_URL_EXPIRY = int(os.getenv("S3_SIGNED_URL_EXPIRY", "300"))

# ---- Password reset (self-service, via email) ----
# Used to build the link inside the reset email — must point at wherever
# the frontend is actually served from.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
PASSWORD_RESET_EXPIRY_MINUTES = int(os.getenv("PASSWORD_RESET_EXPIRY_MINUTES", "30"))
# Shared by password-reset and email-verification OTPs — a short numeric
# code, not the long link from before.
OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", "10"))
