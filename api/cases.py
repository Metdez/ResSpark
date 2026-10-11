"""Vercel entry point for the ResSpark case-screening API."""

from pathlib import Path
import sys


SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from case_api import _Handler


class handler(_Handler):
    """Expose the local request handler to Vercel's Python runtime."""
