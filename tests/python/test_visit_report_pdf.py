from io import BytesIO
from pathlib import Path
import importlib.util
import unittest
from unittest.mock import patch

from PIL import Image as PillowImage
from pypdf import PdfReader

from visit_report_pdf_renderer import render_visit_report

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("visit_report_pdf_api", ROOT / "api" / "visit_report_pdf.py")
pdf_api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pdf_api)


def report(photo_urls=None):
    photos = [{"phase": "before", "caption": "Antes de limpiar", "url": url}
              for url in (photo_urls or [])]
    return {
        "version": 1,
        "closedAt": "2026-10-23T12:00:00Z",
        "company": {"name": "Doscientos"},
        "client": {"name": "Álvaro & familia"},
        "location": {"name": "Piscina", "address": "Calle Mayor 1"},
        "asset": {"name": "Depuradora"},
        "visit": {"title": "Revisión anual", "actualStartAt": "2026-10-23T09:00:00Z",
                  "actualEndAt": "2026-10-23T11:00:00Z"},
        "report": {"notes": "Línea larga de intervención. " * 150,
                   "checklist": [{"label": "Filtro", "done": True}],
                   "recommendations": "Controlar presión.",
                   "nextActions": "Volver en un mes."},
        "measurements": [{"label": "pH", "value": 7.2, "unit": "pH", "assessment": "within"}],
        "activities": [{"kind": "labor", "description": "Limpieza", "quantity": 2, "unit": "h"}],
        "incidents": [{"title": "Válvula", "resolution": "Ajustada"}],
        "photos": photos,
        "internal_cost": "SECRETO-NO-PUBLICAR",
    }


def photo_bytes(format_name):
    image = PillowImage.new("RGB", (1000, 700), "#bdff7b")
    output = BytesIO()
    image.save(output, format=format_name)
    return output.getvalue()


class ReportPdfTests(unittest.TestCase):
    def test_long_report_and_webp_photo_paginate_without_private_fields(self):
        data = render_visit_report(report(["https://example.test/photo"]), [photo_bytes("WEBP")])
        reader = PdfReader(BytesIO(data))
        all_text = "\n".join(page.extract_text() for page in reader.pages)
        self.assertGreaterEqual(len(reader.pages), 2)
        self.assertIn("Álvaro & familia", all_text)
        self.assertIn("Antes de limpiar", all_text)
        self.assertIn("Página", all_text)
        self.assertNotIn("SECRETO-NO-PUBLICAR", all_text)

    def test_missing_photo_must_not_create_incomplete_saved_pdf(self):
        with self.assertRaises(ValueError):
            render_visit_report(report(["https://example.test/photo"]), [])

    def test_existing_version_reuses_stored_pdf(self):
        share = {"tenant_id": "11111111-1111-1111-1111-111111111111",
                 "report_version_id": "22222222-2222-2222-2222-222222222222"}
        with (patch.object(pdf_api, "_live_share", return_value=share) as live,
              patch.object(pdf_api, "_request", return_value=(200, b"")) as request,
              patch.object(pdf_api, "_sign", return_value="https://example.test/signed") as sign,
              patch.object(pdf_api, "_json_request") as projection):
            result = pdf_api.create_or_get_pdf("a" * 64, "https://example.test", "key")
        self.assertEqual(result, "https://example.test/signed")
        self.assertEqual(live.call_count, 2)
        self.assertEqual(request.call_count, 1)
        self.assertEqual(request.call_args.kwargs["method"], "HEAD")
        sign.assert_called_once()
        projection.assert_not_called()

    def test_revoked_during_generation_does_not_return_url(self):
        share = {"tenant_id": "11111111-1111-1111-1111-111111111111",
                 "report_version_id": "22222222-2222-2222-2222-222222222222"}
        with (patch.object(pdf_api, "_live_share", side_effect=[share, None]),
              patch.object(pdf_api, "_request", side_effect=[(404, b""), (200, b"")]),
              patch.object(pdf_api, "_one", return_value={"snapshot": {"photos": []}}),
              patch.object(pdf_api, "_json_request", return_value=(200, report())),
              patch.object(pdf_api, "render_visit_report", return_value=b"%PDF-test"),
              patch.object(pdf_api, "_sign") as sign):
            with self.assertRaises(pdf_api.UpstreamError) as raised:
                pdf_api.create_or_get_pdf("a" * 64, "https://example.test", "key")
        self.assertEqual(raised.exception.status, 404)
        sign.assert_called_once()


if __name__ == "__main__":
    unittest.main()
