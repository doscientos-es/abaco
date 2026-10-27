"""Create retained report PDFs from durable jobs after visit closure."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler
import hmac
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import quote, urlencode

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from visit_report_pdf_projection import project_closed_visit_report
from visit_report_pdf_renderer import render_visit_report

from visit_report_pdf import PDF_BUCKET, UpstreamError, _json_request, _one, _request

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _rpc(base: str, key: str, name: str, body: dict) -> object:
    status, result = _json_request(f"{base}/rest/v1/rpc/{name}", key, "POST", body)
    if status != 200:
        raise UpstreamError(502)
    return result


def render_pdf_job(base: str, key: str, job: dict) -> None:
    """Store the exact closed version, or accept an object stored by another worker."""
    tenant_id = job.get("tenant_id")
    version_id = job.get("report_version_id")
    if not isinstance(tenant_id, str) or not UUID_RE.fullmatch(tenant_id):
        raise ValueError("Invalid tenant id")
    if not isinstance(version_id, str) or not UUID_RE.fullmatch(version_id):
        raise ValueError("Invalid version id")
    path = f"{tenant_id}/{version_id}.pdf"
    object_url = f"{base}/storage/v1/object/{PDF_BUCKET}/{path}"
    status, _ = _request(f"{base}/storage/v1/object/info/{PDF_BUCKET}/{path}",
                         key, method="HEAD", limit=0)
    if status == 200:
        return
    if status != 404:
        raise UpstreamError(502)

    query = urlencode({"select": "snapshot,version,closed_at",
                       "id": f"eq.{version_id}", "tenant_id": f"eq.{tenant_id}",
                       "limit": "1"})
    version = _one(f"{base}/rest/v1/service_visit_report_versions?{query}", key)
    if not version:
        raise UpstreamError(404)
    projection, photo_paths = project_closed_visit_report(version)
    visit_id = version.get("snapshot", {}).get("visit", {}).get("id")
    if not isinstance(visit_id, str) or not UUID_RE.fullmatch(visit_id):
        raise ValueError("Invalid visit id")
    if any(not path.startswith(f"{tenant_id}/{visit_id}/") or ".." in path
           for path in photo_paths):
        raise ValueError("Photo does not belong to this visit")

    def download_photo(photo_path: str) -> bytes:
        url = f"{base}/storage/v1/object/authenticated/visit-photos/{quote(photo_path, safe='/')}"
        image_status, image = _request(url, key, limit=10 * 1024 * 1024)
        if image_status != 200:
            raise UpstreamError(502)
        return image

    with ThreadPoolExecutor(max_workers=4) as pool:
        images = list(pool.map(download_photo, photo_paths))
    pdf = render_visit_report(projection, images)
    if len(pdf) > 20 * 1024 * 1024:
        raise ValueError("PDF exceeds bucket limit")
    upload_status, _ = _request(object_url, key, "POST", pdf, "application/pdf", limit=4096)
    if upload_status not in (200, 201, 409):
        raise UpstreamError(502)


def process_one_pdf_job(base: str, key: str) -> str:
    claimed = _rpc(base, key, "claim_service_visit_report_pdf_job", {})
    if not isinstance(claimed, list) or not claimed:
        return "idle"
    job = claimed[0]
    if not isinstance(job, dict):
        raise UpstreamError(502)
    try:
        render_pdf_job(base, key, job)
    except Exception as error:
        print(f"PDF job {job.get('report_version_id')} failed: {type(error).__name__}",
              file=sys.stderr)
        code = "source_unavailable" if isinstance(error, UpstreamError) else "render_failed"
        finished = _rpc(base, key, "finish_service_visit_report_pdf_job", {
            "p_report_version_id": job["report_version_id"],
            "p_lease_token": job["lease_token"],
            "p_ready": False,
            "p_error_code": code,
        })
        if finished is not True:
            raise UpstreamError(502) from error
        return "retry"
    finished = _rpc(base, key, "finish_service_visit_report_pdf_job", {
        "p_report_version_id": job["report_version_id"],
        "p_lease_token": job["lease_token"],
        "p_ready": True,
        "p_error_code": None,
    })
    if finished is not True:
        raise UpstreamError(502)
    return "ready"


class handler(BaseHTTPRequestHandler):
    def _reply(self, status: int, state: str):
        payload = json.dumps({"status": state}).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        if self.path != "/api/visit_report_pdf_worker":
            return self._reply(404, "not_found")
        secret = os.environ.get("CRON_SECRET", "")
        authorization = self.headers.get("Authorization", "")
        if not secret or not hmac.compare_digest(authorization, f"Bearer {secret}"):
            return self._reply(401, "unauthorized")
        base = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not base or not key:
            return self._reply(503, "not_configured")
        try:
            return self._reply(200, process_one_pdf_job(base, key))
        except Exception:
            return self._reply(502, "unavailable")
