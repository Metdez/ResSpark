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
import unittest

SRC = Path(__file__).resolve().parents[1]
ROOT = SRC.parent
for _path in (SRC / "tests", SRC):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

import document_parse  # noqa: E402


def _llm_disabled(*_args: object) -> dict:
    raise RuntimeError("llm_disabled")


document_parse._load_env = lambda: None
document_parse._llm_json = _llm_disabled
_URLOPEN = document_parse.urllib.request.urlopen

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


def _test_calls() -> tuple[list, list]:
    """Run test_document_parse and record every parse_texts / merge_documents input it passes.

    A call made while urlopen is patched belongs to a mocked-model test and is skipped.
    Outputs are not taken from the tests: the oracle recomputes them below with the LLM off.
    """
    import test_document_parse as tests

    texts_calls: list = []
    merge_calls: list = []
    current = {"name": "", "count": 0}
    real_parse, real_merge = tests.parse_texts, tests.merge_documents

    def name() -> str:
        current["count"] += 1
        return f"{current['name']}#{current['count']}"

    def parse_texts(texts, rows=None, document_type=None):
        if document_parse.urllib.request.urlopen is _URLOPEN:
            texts_calls.append((name(), list(texts), copy.deepcopy(rows), document_type))
        return real_parse(texts, rows, document_type)

    def merge_documents(parts):
        merge_calls.append((name(), copy.deepcopy(parts)))
        return real_merge(parts)

    tests.parse_texts, tests.merge_documents = parse_texts, merge_documents
    try:
        for case in sorted(_flatten(unittest.defaultTestLoader.loadTestsFromModule(tests)), key=lambda t: t.id()):
            current.update(name=case.id().split(".")[-1], count=0)
            case.run(unittest.TestResult())
    finally:
        tests.parse_texts, tests.merge_documents = real_parse, real_merge
    return texts_calls, merge_calls


def _flatten(suite) -> list:
    return [leaf for item in suite for leaf in (_flatten(item) if isinstance(item, unittest.TestSuite) else [item])]


def texts_cases(calls: list) -> list[dict]:
    cases = []
    for name, texts, rows, document_type in calls:
        case = {"name": name, "texts": texts, "rows": _rows(rows), "document_type": document_type}
        case.update(_outcome(lambda: document_parse.parse_texts(list(texts), copy.deepcopy(rows), document_type)))
        cases.append(case)
    return cases


def build_extract_payload() -> dict:
    text_calls, _merge_calls = _test_calls()
    pdfs = [pdf_case(path) for path in sorted((ROOT / "examples").glob("*/*.pdf"))]
    return {
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "generated_by": "src/tools/export_golden_fixtures.py (src/tools/golden_extract.py)",
        "texts_cases": texts_cases(text_calls),
        "merge_cases": [],
        "pdfs": pdfs,
        "packets": [],
    }
