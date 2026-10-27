"""Vercel Python Function: create once and download a closed customer report PDF."""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from http.server import BaseHTTPRequestHandler
import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from visit_report_pdf_renderer import render_visit_report

TOKEN_RE = re.compile(r"^[0-9a-f]{64}$")
PDF_BUCKET = "visit-report-pdfs"


class UpstreamError(Exception):
    def __init__(self, status: int):
        self.status = status


def _request(url: str, key: str, method: str = "GET", data: bytes | None = None,
             content_type: str | None = None, limit: int = 11 * 1024 * 1024) -> tuple[int, bytes]:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if content_type:
        headers["Content-Type"] = content_type
    if method == "POST" and content_type == "application/pdf":
        headers["x-upsert"] = "false"
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=25) as response:
            result = response.read(limit + 1)
            if len(result) > limit:
                raise ValueError("Upstream response too large")
            return response.status, result
    except HTTPError as error:
        error.read(4096)
        return error.code, b""


def _json_request(url: str, key: str, method: str = "GET", body: dict | None = None) -> tuple[int, object]:
    payload = json.dumps(body).encode() if body is not None else None
    status, data = _request(url, key, method, payload,
                            "application/json" if payload is not None else None)
    try:
        return status, json.loads(data) if data else None
    except json.JSONDecodeError as error:
        raise UpstreamError(502) from error


def _one(url: str, key: str) -> dict | None:
    status, data = _json_request(url, key)
    if status != 200 or not isinstance(data, list):
        raise UpstreamError(502)
    return data[0] if data else None


def _live_share(base: str, key: str, digest: str) -> dict | None:
    query = urlencode({"select": "tenant_id,report_version_id,expires_at,revoked_at",
                       "token_hash": f"eq.{digest}", "limit": "1"})
    share = _one(f"{base}/rest/v1/service_visit_report_shares?{query}", key)
    if not share or share.get("revoked_at"):
        return None
    try:
        expiry = datetime.fromisoformat(share["expires_at"].replace("Z", "+00:00"))
        if expiry <= datetime.now(timezone.utc):
            return None
    except (KeyError, TypeError, ValueError):
        return None
    return share


def _sign(base: str, key: str, path: str) -> str:
    status, data = _json_request(
        f"{base}/storage/v1/object/sign/{PDF_BUCKET}/{path}", key,
        "POST", {"expiresIn": 60},
    )
    if status != 200 or not isinstance(data, dict):
        raise UpstreamError(502)
    signed = data.get("signedURL") or data.get("signedUrl")
    if not isinstance(signed, str) or not signed.startswith("/object/sign/"):
        raise UpstreamError(502)
    separator = "&" if "?" in signed else "?"
    return f"{base}/storage/v1{signed}{separator}download=parte-de-visita.pdf"


def create_or_get_pdf(token: str, base: str, key: str) -> str:
    digest = sha256(token.encode("ascii")).hexdigest()
    share = _live_share(base, key, digest)
    if not share:
        raise UpstreamError(404)
    tenant_id = share["tenant_id"]
    version_id = share["report_version_id"]
    path = f"{tenant_id}/{version_id}.pdf"
    object_url = f"{base}/storage/v1/object/{PDF_BUCKET}/{path}"

    status, _ = _request(f"{base}/storage/v1/object/info/{PDF_BUCKET}/{path}", key,
                         method="HEAD", limit=0)
    if status == 404:
        version_query = urlencode({"select": "snapshot", "id": f"eq.{version_id}",
                                   "tenant_id": f"eq.{tenant_id}", "limit": "1"})
        version = _one(f"{base}/rest/v1/service_visit_report_versions?{version_query}", key)
        if not version:
            raise UpstreamError(404)
        snapshot = version.get("snapshot") or {}
        expected_photos = snapshot.get("photos", []) if isinstance(snapshot, dict) else []
        status, projection = _json_request(
            f"{base}/functions/v1/public-visit-report", key, "POST", {"token": token},
        )
        if status == 404:
            raise UpstreamError(404)
        if status != 200 or not isinstance(projection, dict):
            raise UpstreamError(502)
        photos = projection.get("photos")
        if not isinstance(photos, list) or len(photos) != len(expected_photos):
            raise UpstreamError(502)
        images = []
        base_host = urlsplit(base).netloc
        for photo in photos:
            url = photo.get("url") if isinstance(photo, dict) else None
            parsed = urlsplit(url) if isinstance(url, str) else None
            if (not parsed or parsed.netloc != base_host or
                    parsed.scheme != urlsplit(base).scheme or
                    not parsed.path.startswith("/storage/v1/object/sign/visit-photos/")):
                raise UpstreamError(502)
            image_status, image = _request(url, key, limit=10 * 1024 * 1024)
            if image_status != 200:
                raise UpstreamError(502)
            images.append(image)
        pdf = render_visit_report(projection, images)
        if len(pdf) > 20 * 1024 * 1024:
            raise UpstreamError(502)
        upload_status, _ = _request(object_url, key, "POST", pdf, "application/pdf", limit=4096)
        if upload_status not in (200, 201, 409):
            raise UpstreamError(502)
    elif status != 200:
        raise UpstreamError(502)

    signed_url = _sign(base, key, path)
    if not _live_share(base, key, digest):
        raise UpstreamError(404)
    return signed_url


class handler(BaseHTTPRequestHandler):
    def _reply(self, status: int, body: dict):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        if self.path != "/api/visit_report_pdf":
            return self._reply(404, {"error": "not_found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 256:
                return self._reply(400, {"error": "invalid_request"})
            body = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError):
            return self._reply(400, {"error": "invalid_request"})
        token = body.get("token") if isinstance(body, dict) else None
        if not isinstance(token, str) or not TOKEN_RE.fullmatch(token):
            return self._reply(404, {"error": "not_found"})
        base = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not base or not key:
            return self._reply(503, {"error": "not_configured"})
        try:
            url = create_or_get_pdf(token, base, key)
            return self._reply(200, {"url": url})
        except UpstreamError as error:
            return self._reply(error.status, {"error": "not_found" if error.status == 404 else "unavailable"})
        except (OSError, ValueError):
            return self._reply(502, {"error": "unavailable"})
