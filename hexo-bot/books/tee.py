import sys
from pathlib import Path


def main():
    # usage: python tee.py <logfile>
    # read stdin line by line, write each line to BOTH stdout (window) and <logfile> (disk)
    log_path = None
    if len(sys.argv) >= 2:
        log_path = Path(sys.argv[1])
        log_path.parent.mkdir(parents=True, exist_ok=True)

    out = None
    if log_path is not None:
        out = log_path.open("a", encoding="utf-8", errors="replace")

    try:
        for line in sys.stdin:
            sys.stdout.write(line)
            sys.stdout.flush()
            if out is not None:
                out.write(line)
                out.flush()
    finally:
        if out is not None:
            out.close()


if __name__ == "__main__":
    main()
