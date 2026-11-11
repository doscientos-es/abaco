"""Explicit customer projection from an immutable closed visit snapshot."""

from __future__ import annotations


def _record(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _rows(value: object) -> list[dict]:
    return [_record(item) for item in value] if isinstance(value, list) else []


def _text(value: object) -> str:
    return value if isinstance(value, str) else ""


def _number(value: object) -> int | float | None:
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def project_closed_visit_report(version: dict) -> tuple[dict, list[str]]:
    """Return only customer-safe fields and ordered private photo paths."""
    snapshot = _record(version.get("snapshot"))
    company = _record(snapshot.get("company"))
    client = _record(snapshot.get("client"))
    location = _record(snapshot.get("location"))
    asset = _record(snapshot.get("asset"))
    visit = _record(snapshot.get("visit"))
    data = _record(_record(snapshot.get("report")).get("data"))
    photo_rows = _rows(snapshot.get("photos"))
    if len(photo_rows) > 20:
        raise ValueError("Too many report photos")
    photo_paths = [_text(photo.get("storage_path")) for photo in photo_rows]
    if any(not path for path in photo_paths):
        raise ValueError("Missing report photo path")
    return {
        "version": version.get("version"),
        "closedAt": _text(version.get("closed_at")),
        "company": {"name": _text(company.get("name"))},
        "client": {"name": _text(client.get("name"))},
        "location": {"name": _text(location.get("name")),
                     "address": _text(location.get("address"))} if snapshot.get("location") else None,
        "asset": {"name": _text(asset.get("name"))} if snapshot.get("asset") else None,
        "visit": {"title": _text(visit.get("title")),
                  "actualStartAt": _text(visit.get("actual_start_at")),
                  "actualEndAt": _text(visit.get("actual_end_at"))},
        "report": {
            "notes": _text(data.get("notes")),
            "checklist": [{"label": _text(item.get("label")), "done": item.get("done") is True}
                          for item in _rows(data.get("checklist"))],
            "recommendations": _text(data.get("recommendations")),
            "nextActions": _text(data.get("next_actions")),
        },
        "measurements": [{"label": _text(item.get("label")),
                          "value": _number(item.get("value")),
                          "unit": _text(item.get("unit")),
                          "assessment": _text(item.get("assessment"))}
                         for item in _rows(snapshot.get("measurements"))],
        "activities": [{"kind": _text(item.get("kind")),
                        "description": _text(item.get("description")),
                        "quantity": _number(item.get("quantity")),
                        "unit": _text(item.get("unit"))}
                       for item in _rows(snapshot.get("activities"))],
        "incidents": [{"title": _text(item.get("title")),
                       "resolution": _text(item.get("resolution"))}
                      for item in _rows(snapshot.get("incidents"))],
        "photos": [{"phase": _text(item.get("phase")),
                    "caption": _text(item.get("caption"))} for item in photo_rows],
    }, photo_paths
