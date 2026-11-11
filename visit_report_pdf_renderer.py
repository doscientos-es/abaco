"""Render the customer projection of a closed visit report as a PDF."""

from __future__ import annotations

from datetime import datetime
from html import escape
from io import BytesIO
from typing import Mapping

import reportlab
from PIL import Image as PillowImage, ImageOps
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

FONT_PATH = reportlab.__path__[0] + "/fonts/Vera.ttf"
FONT_NAME = "VisitReportSans"
if FONT_NAME not in pdfmetrics.getRegisteredFontNames():
    pdfmetrics.registerFont(TTFont(FONT_NAME, FONT_PATH))

PRIMARY = colors.HexColor("#2a4227")
FOREGROUND = colors.HexColor("#171717")
MUTED = colors.HexColor("#626862")
RULE = colors.HexColor("#dfe4dc")
ASSESSMENT_LABELS = {
    "below": "Por debajo del rango", "within": "Dentro del rango",
    "above": "Por encima del rango", "unconfigured": "Sin rango configurado",
}
ACTIVITY_LABELS = {
    "labor": "Tiempo", "travel": "Desplazamiento", "material": "Material",
    "spare": "Repuesto", "product": "Producto",
    "corrective_action": "Acción correctora",
}
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 43
CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2


def _text(value: object) -> str:
    return value if isinstance(value, str) else ""


def _number(value: object) -> str:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f"{value:g}"
    return "-"


def _record(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _rows(value: object) -> list[dict]:
    return [_record(item) for item in value] if isinstance(value, list) else []


def _date(value: object) -> str:
    raw = _text(value)
    if not raw:
        return ""
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return ""


def _markup(value: object) -> str:
    return escape(_text(value)).replace("\n", "<br/>")


def _photo(data: bytes) -> BytesIO:
    if len(data) > 10 * 1024 * 1024:
        raise ValueError("Photo exceeds the allowed size")
    with PillowImage.open(BytesIO(data)) as source:
        if source.width * source.height > 40_000_000:
            raise ValueError("Photo dimensions exceed the allowed size")
        source.verify()
    with PillowImage.open(BytesIO(data)) as source:
        oriented = ImageOps.exif_transpose(source)
        converted = oriented.convert("RGB")
        for edge in (1400, 1200, 1000, 850, 700):
            resized = converted.copy()
            resized.thumbnail((edge, edge), PillowImage.Resampling.LANCZOS)
            for quality in (78, 68, 58):
                output = BytesIO()
                resized.save(output, format="JPEG", quality=quality, optimize=True)
                if output.tell() <= 800_000:
                    output.seek(0)
                    return output
    raise ValueError("Photo could not be prepared for the PDF")


def render_visit_report(report: Mapping[str, object], photo_bytes: list[bytes]) -> bytes:
    """Return a stable document for one immutable report version.

    The caller supplies only the public customer projection and photo bytes in the
    same order as its photo list. Missing photos fail the render instead of quietly
    changing the saved version.
    """
    photos = _rows(report.get("photos"))
    if len(photos) != len(photo_bytes) or len(photos) > 20:
        raise ValueError("Photo count does not match report")

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="HeroVisit", fontName=FONT_NAME, fontSize=22, leading=29,
                              textColor=PRIMARY, spaceAfter=9, splitLongWords=1))
    styles.add(ParagraphStyle(name="SectionVisit", fontName=FONT_NAME, fontSize=12.5, leading=17,
                              textColor=PRIMARY, spaceBefore=16, spaceAfter=8,
                              keepWithNext=True, splitLongWords=1))
    styles.add(ParagraphStyle(name="BodyVisit", fontName=FONT_NAME, fontSize=8.7, leading=13.5,
                              textColor=FOREGROUND, spaceAfter=5, splitLongWords=1))
    styles.add(ParagraphStyle(name="SmallVisit", fontName=FONT_NAME, fontSize=7.4, leading=11,
                              textColor=MUTED, spaceAfter=4, splitLongWords=1))
    styles.add(ParagraphStyle(name="CellVisit", fontName=FONT_NAME, fontSize=8, leading=12,
                              textColor=FOREGROUND, splitLongWords=1))
    styles.add(ParagraphStyle(name="PhotoVisit", fontName=FONT_NAME, fontSize=8, leading=12,
                              textColor=FOREGROUND, alignment=TA_CENTER, splitLongWords=1))

    company = _record(report.get("company"))
    client = _record(report.get("client"))
    location = _record(report.get("location"))
    asset = _record(report.get("asset"))
    visit = _record(report.get("visit"))
    detail = _record(report.get("report"))

    story = [
        Paragraph(_markup(company.get("name")) or "Empresa", styles["SmallVisit"]),
        Paragraph("Parte de visita", styles["HeroVisit"]),
        Paragraph(f"Versión {report.get('version', 1)} · Cerrado el {_date(report.get('closedAt'))}",
                  styles["SmallVisit"]),
        Spacer(1, 8),
    ]

    facts = [
        ("Cliente", client.get("name")),
        ("Intervención", visit.get("title")),
        ("Ubicación", " · ".join(filter(None, [_text(location.get("name")), _text(location.get("address"))]))),
        ("Instalación", asset.get("name")),
        ("Inicio", _date(visit.get("actualStartAt"))),
        ("Fin", _date(visit.get("actualEndAt"))),
    ]
    fact_rows = []
    for label, value in facts:
        if value:
            fact_rows.append([
                Paragraph(escape(label), styles["SmallVisit"]),
                Paragraph(_markup(value), styles["CellVisit"]),
            ])
    table = Table(fact_rows, colWidths=[98, CONTENT_WIDTH - 98], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f2f5ef")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(table)

    def section(title: str, body: object) -> None:
        if not body:
            return
        story.append(Paragraph(escape(title), styles["SectionVisit"]))
        story.append(Paragraph(_markup(body), styles["BodyVisit"]))

    section("Resumen", detail.get("notes") or "Sin notas de intervención.")
    checklist = _rows(detail.get("checklist"))
    if checklist:
        story.append(Paragraph("Comprobaciones", styles["SectionVisit"]))
        for item in checklist:
            prefix = "Hecha" if item.get("done") is True else "Pendiente"
            story.append(Paragraph(f"{prefix} · {_markup(item.get('label'))}", styles["BodyVisit"]))

    measurements = _rows(report.get("measurements"))
    if measurements:
        story.append(Paragraph("Mediciones", styles["SectionVisit"]))
        for item in measurements:
            line = f"{_markup(item.get('label'))}: {_number(item.get('value'))} {_markup(item.get('unit'))}"
            if item.get("assessment"):
                assessment = ASSESSMENT_LABELS.get(item.get("assessment"), item.get("assessment"))
                line += f" · {_markup(assessment)}"
            story.append(Paragraph(line, styles["BodyVisit"]))

    activities = _rows(report.get("activities"))
    if activities:
        story.append(Paragraph("Trabajos realizados", styles["SectionVisit"]))
        for item in activities:
            kind = ACTIVITY_LABELS.get(item.get("kind"), item.get("kind"))
            line = f"{_markup(kind)}: {_markup(item.get('description'))}"
            if item.get("quantity") is not None:
                line += f" · {_number(item.get('quantity'))} {_markup(item.get('unit'))}"
            story.append(Paragraph(line, styles["BodyVisit"]))

    incidents = _rows(report.get("incidents"))
    if incidents:
        story.append(Paragraph("Incidencias", styles["SectionVisit"]))
        for item in incidents:
            line = _markup(item.get("title"))
            if item.get("resolution"):
                line += f" · {_markup(item.get('resolution'))}"
            story.append(Paragraph(line, styles["BodyVisit"]))

    if photos:
        story.append(Paragraph("Fotografías", styles["SectionVisit"]))
        labels = {"before": "Antes", "after": "Después", "other": "Evidencia"}
        for item, raw in zip(photos, photo_bytes):
            data = _photo(raw)
            width, height = ImageReader(data).getSize()
            max_width, max_height = CONTENT_WIDTH, 300
            scale = min(max_width / width, max_height / height)
            image = Image(data, width=width * scale, height=height * scale, hAlign="CENTER")
            caption = f"{labels.get(item.get('phase'), 'Evidencia')} · {_markup(item.get('caption'))}"
            story.append(KeepTogether([image, Spacer(1, 5),
                                       Paragraph(caption, styles["PhotoVisit"]), Spacer(1, 10)]))

    section("Recomendaciones", detail.get("recommendations"))
    section("Próximas actuaciones", detail.get("nextActions"))
    story.append(Spacer(1, 16))
    story.append(Paragraph(
        f"Informe de la visita cerrada. Para aclaraciones, contacta con {_markup(company.get('name'))}.",
        styles["SmallVisit"],
    ))

    output = BytesIO()
    document = BaseDocTemplate(output, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                               topMargin=52, bottomMargin=51, title="Parte de visita",
                               author=_text(company.get("name")))
    frame = Frame(MARGIN, 51, CONTENT_WIDTH, PAGE_HEIGHT - 103, leftPadding=0,
                  rightPadding=0, topPadding=0, bottomPadding=0)

    def decorate(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(PRIMARY)
        canvas.rect(0, PAGE_HEIGHT - 9, PAGE_WIDTH, 9, fill=1, stroke=0)
        canvas.setStrokeColor(RULE)
        canvas.line(MARGIN, 38, PAGE_WIDTH - MARGIN, 38)
        canvas.setFont(FONT_NAME, 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, 26, "Parte de visita · Versión cerrada")
        canvas.drawRightString(PAGE_WIDTH - MARGIN, 26, f"Página {doc.page}")
        canvas.restoreState()

    document.addPageTemplates(PageTemplate(id="report", frames=[frame], onPage=decorate))
    document.build(story)
    return output.getvalue()
