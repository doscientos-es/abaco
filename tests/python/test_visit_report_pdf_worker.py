"""Durable PDF worker keeps closed evidence and a customer-safe projection."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))
spec = importlib.util.spec_from_file_location("visit_report_pdf_worker", ROOT / "api" / "visit_report_pdf_worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

TENANT = "5c000000-0000-4000-8000-000000000001"
VERSION = "5c000000-0000-4000-8000-000000000002"
VISIT = "5c000000-0000-4000-8000-000000000003"
LEASE = "5c000000-0000-4000-8000-000000000004"


def version(photo_path: str | None = None) -> dict:
    return {
        "version": 1, "closed_at": "2026-10-25T09:00:00Z",
        "snapshot": {
            "company": {"name": "Empresa", "internal_cost": 900},
            "client": {"name": "Cliente", "email": "private@example.test"},
            "visit": {"id": VISIT, "title": "Piscina", "actual_start_at": "", "actual_end_at": ""},
            "report": {"data": {"notes": "Hecho", "checklist": [],
                                "recommendations": "Revisar", "next_actions": ""}},
            "measurements": [], "activities": [], "incidents": [],
            "photos": [{"phase": "before", "caption": "Antes", "storage_path": photo_path}]
            if photo_path else [],
        },
    }


class PdfWorkerTests(unittest.TestCase):
    def test_projection_excludes_internal_data_and_preserves_photo_order(self):
        path = f"{TENANT}/{VISIT}/image.jpg"
        projected, paths = worker.project_closed_visit_report(version(path))
        self.assertEqual(paths, [path])
        self.assertEqual(projected["photos"], [{"phase": "before", "caption": "Antes"}])
        self.assertEqual(projected["report"]["notes"], "Hecho")
        self.assertNotIn("internal_cost", str(projected))
        self.assertNotIn("private@example.test", str(projected))
        self.assertNotIn("storage_path", str(projected))

    def test_render_rejects_cross_visit_photo(self):
        job = {"tenant_id": TENANT, "report_version_id": VERSION}
        with patch.object(worker, "_request", return_value=(404, b"")), \
                patch.object(worker, "_one", return_value=version(f"{TENANT}/another-visit/image.jpg")):
            with self.assertRaises(ValueError):
                worker.render_pdf_job("https://example.supabase.co", "key", job)

    def test_existing_pdf_finishes_without_rendering(self):
        job = {"tenant_id": TENANT, "report_version_id": VERSION,
               "lease_token": LEASE}
        with patch.object(worker, "_rpc", side_effect=[[job], True]) as rpc, \
                patch.object(worker, "_request", return_value=(200, b"")) as request, \
                patch.object(worker, "_one") as version_lookup:
            self.assertEqual(worker.process_one_pdf_job("https://example.supabase.co", "key"), "ready")
            self.assertEqual(rpc.call_count, 2)
            self.assertEqual(rpc.call_args.args[2], "finish_service_visit_report_pdf_job")
            self.assertTrue(rpc.call_args.args[3]["p_ready"])
            self.assertEqual(request.call_count, 1)
            version_lookup.assert_not_called()

    def test_missing_pdf_renders_and_stores_customer_projection(self):
        job = {"tenant_id": TENANT, "report_version_id": VERSION}
        with patch.object(worker, "_request", side_effect=[(404, b""), (201, b"")]) as request, \
                patch.object(worker, "_one", return_value=version()) as version_lookup, \
                patch.object(worker, "render_visit_report", return_value=b"%PDF-test") as render:
            worker.render_pdf_job("https://example.supabase.co", "key", job)
            self.assertEqual(version_lookup.call_count, 1)
            self.assertEqual(render.call_args.args[1], [])
            self.assertEqual(render.call_args.args[0]["client"]["name"], "Cliente")
            self.assertEqual(request.call_args.args[2], "POST")
            self.assertEqual(request.call_args.args[3], b"%PDF-test")

    def test_missing_photo_retries_durable_job(self):
        job = {"tenant_id": TENANT, "report_version_id": VERSION,
               "lease_token": LEASE}
        with patch.object(worker, "_rpc", side_effect=[[job], True]) as rpc, \
                patch.object(worker, "_request", side_effect=[(404, b""), (404, b"")]), \
                patch.object(worker, "_one", return_value=version(f"{TENANT}/{VISIT}/image.jpg")):
            self.assertEqual(worker.process_one_pdf_job("https://example.supabase.co", "key"), "retry")
            self.assertFalse(rpc.call_args.args[3]["p_ready"])
            self.assertEqual(rpc.call_args.args[3]["p_error_code"], "source_unavailable")


if __name__ == "__main__":
    unittest.main()
