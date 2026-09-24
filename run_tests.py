"""Phase-1 compile check and process_file() contract test."""

import py_compile
import sys

from processor import ALLOWED_STATUSES, process_file

test_bytes = b"supplier,product,price\nAcme,Widget,9.99"


def main() -> int:
    for path in ("processor.py", "run_demo.py"):
        py_compile.compile(path, doraise=True)
        print("compiled OK: %s" % path)

    results = process_file(test_bytes)
    assert isinstance(results, list), "process_file must return a list"
    assert results, "process_file must return a non-empty list"

    for record in results:
        assert isinstance(record, dict), "each record must be a dict"
        for key in ("title", "status", "details", "due_date"):
            assert key in record, "record missing top-level key: %s" % key
        assert isinstance(record["details"], dict), "details must be a dict"
        assert "due_date" not in record["details"], (
            "details must not contain a top-level due_date key"
        )
        assert record["status"] in ALLOWED_STATUSES, (
            "status not allowed: %s" % record["status"]
        )
        assert isinstance(record["title"], str) and record["title"].strip(), (
            "title must be a non-empty string"
        )
        assert record["due_date"] is None or isinstance(record["due_date"], str)

    print("run_tests OK: %d record(s) validated" % len(results))
    return 0


if __name__ == "__main__":
    sys.exit(main())
