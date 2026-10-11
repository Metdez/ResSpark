"""Extract-fixture builder: src/document_parse.py is the oracle for app/worker/src/extract/.

Imported by export_golden_fixtures.py. The OpenRouter fallback and .env loading are
replaced at import, before any parse, so an export never reads secrets or opens a
socket and a failed parse re-raises its original ValueError. Nothing under src/ is edited.
"""

from __future__ import annotations

import copy
from datetime import date
from pathlib import Path
import sys

SRC = Path(__file__).resolve().parents[1]
ROOT = SRC.parent
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

import document_parse  # noqa: E402


def _llm_disabled(*_args: object) -> dict:
    raise RuntimeError("llm_disabled")


document_parse._load_env = lambda: None
document_parse._llm_json = _llm_disabled
_URLOPEN = document_parse.urllib.request.urlopen

TRACER_PDFS = ("examples/01_marcus_delgado_CNC/01_IRS_Account_Transcript.pdf",)


def _plain(value: object) -> object:
    """Dates become ISO strings and tuples become lists, so the result is JSON."""
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    return value


def _rows(rows: dict | None) -> list:
    return [[y, [[x, text] for x, text in cells]] for y, cells in (rows or {}).items()]


def _outcome(call) -> dict:
    try:
        return {"expected": _plain(call())}
    except ValueError as error:
        return {"error": str(error)}


def pdf_case(path: Path) -> dict:
    rel = path.relative_to(ROOT).as_posix()
    texts, rows = document_parse._page_text(path.read_bytes())
    case = {"path": rel, "document_type": None, "page_text": {"texts": texts, "rows": _rows(rows)}}
    # parse_pdf(path) with a repo-relative, forward-slash label so error text is machine independent.
    case.update(_outcome(lambda: document_parse._parse_document(texts, rows, None, rel)))
    return case


def build_extract_payload() -> dict:
    pdfs = [pdf_case(ROOT / rel) for rel in TRACER_PDFS]
    return {
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "generated_by": "src/tools/export_golden_fixtures.py (src/tools/golden_extract.py)",
        "texts_cases": [],
        "merge_cases": [],
        "pdfs": pdfs,
        "packets": [],
    }
