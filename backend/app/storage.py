"""
Attachment storage — AWS S3, Cloudflare R2, or local disk, whichever is
configured (checked in that order). Nothing else in the app needs to know
or care which one is active: every caller goes through upload_file() /
get_download() / delete_file() and gets back the same shapes either way.
Fill in the AWS_*/S3_* or R2_* values in .env to switch a fresh upload
over to object storage; existing local-disk attachments keep working
exactly as before (each row remembers which backend it was stored with).
"""
import logging
import os
import uuid

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException
from fastapi.responses import FileResponse, RedirectResponse

from app.config import (
    UPLOAD_DIR,
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET, S3_PREFIX, S3_SIGNED_URL_EXPIRY,
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_SIGNED_URL_EXPIRY,
)

logger = logging.getLogger(__name__)

_s3_client = None
_r2_client = None


def s3_configured() -> bool:
    return bool(AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY and AWS_REGION and S3_BUCKET)


def r2_configured() -> bool:
    return bool(R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET)


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION,
            config=BotoConfig(signature_version="s3v4"),
        )
    return _s3_client


def _get_r2_client():
    global _r2_client
    if _r2_client is None:
        _r2_client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
            config=BotoConfig(signature_version="s3v4"),
        )
    return _r2_client


def _s3_key(key: str) -> str:
    """S3_PREFIX namespaces every object under one shared bucket — never
    used for R2, which already gets its own dedicated bucket."""
    return f"{S3_PREFIX}/{key}" if S3_PREFIX else key


def upload_file(original_filename: str, content: bytes, content_type: str) -> dict:
    """
    Stores the file and returns the bits a caller needs to save in the
    database: {storage: 's3'|'r2'|'local', key: <str>}. 'key' is an
    opaque reference — pass it straight to get_download() later, don't
    try to build a path/URL from it yourself.
    """
    ext = os.path.splitext(original_filename)[1]
    key = f"task-updates/{uuid.uuid4()}{ext}"

    try:
        if s3_configured():
            _get_s3_client().put_object(
                Bucket=S3_BUCKET, Key=_s3_key(key), Body=content,
                ContentType=content_type or "application/octet-stream",
            )
            return {"storage": "s3", "key": key}

        if r2_configured():
            _get_r2_client().put_object(
                Bucket=R2_BUCKET, Key=key, Body=content,
                ContentType=content_type or "application/octet-stream",
            )
            return {"storage": "r2", "key": key}
    except (BotoCoreError, ClientError):
        logger.exception("Object storage upload failed, falling back to local disk")
        # Fall through to local disk below rather than losing the upload
        # entirely — better a working attachment on the wrong backend
        # than a 500 for something as routine as a file upload.

    try:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        local_name = key.replace("task-updates/", "")
        with open(os.path.join(UPLOAD_DIR, local_name), "wb") as f:
            f.write(content)
        return {"storage": "local", "key": local_name}
    except OSError:
        logger.exception("Local disk upload failed")
        raise HTTPException(status_code=500, detail="Could not save the attachment. Please try again.")


def get_download(storage: str, key: str):
    """
    Returns a Starlette response that serves the file: a redirect to a
    time-limited signed URL for S3/R2, or the file itself for local
    storage.
    """
    try:
        if storage == "s3":
            url = _get_s3_client().generate_presigned_url(
                "get_object",
                Params={"Bucket": S3_BUCKET, "Key": _s3_key(key)},
                ExpiresIn=S3_SIGNED_URL_EXPIRY,
            )
            return RedirectResponse(url, status_code=307)

        if storage == "r2":
            url = _get_r2_client().generate_presigned_url(
                "get_object",
                Params={"Bucket": R2_BUCKET, "Key": key},
                ExpiresIn=R2_SIGNED_URL_EXPIRY,
            )
            return RedirectResponse(url, status_code=307)
    except (BotoCoreError, ClientError):
        logger.exception("Could not generate a signed download URL")
        raise HTTPException(status_code=502, detail="Could not reach file storage — try again in a moment.")

    path = os.path.join(UPLOAD_DIR, key)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="That file is no longer available.")
    return FileResponse(path)


def delete_file(storage: str, key: str):
    try:
        if storage == "s3":
            _get_s3_client().delete_object(Bucket=S3_BUCKET, Key=_s3_key(key))
        elif storage == "r2":
            _get_r2_client().delete_object(Bucket=R2_BUCKET, Key=key)
        else:
            path = os.path.join(UPLOAD_DIR, key)
            if os.path.exists(path):
                os.remove(path)
    except (BotoCoreError, ClientError, OSError):
        # Best-effort cleanup — the record referencing this file is
        # usually being deleted regardless, so a failed delete here
        # shouldn't block that. Just leaves an orphaned object/file.
        logger.exception("Could not delete attachment %s from %s storage", key, storage)
