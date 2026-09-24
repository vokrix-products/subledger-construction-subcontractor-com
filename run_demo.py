"""Zero-argument smoke test for the SubLedger phase-1 processor."""

from processor import process_file

test_bytes = b"supplier,product,price\nAcme,Widget,9.99"


def main() -> None:
    results = process_file(test_bytes)
    assert isinstance(results, list), "process_file must return a list"
    assert results, "process_file must return a non-empty list for demo input"
    for record in results:
        print(record)
    print("run_demo OK: %d record(s)" % len(results))


if __name__ == "__main__":
    main()
