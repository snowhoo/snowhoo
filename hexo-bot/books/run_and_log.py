import sys
import subprocess


def main():
    # usage: run_and_log.py <logfile> <target.py> [args...]
    # Runs target with python, streams stdout/stderr LIVE to console AND appends
    # to <logfile>, then exits with the target's real return code.
    if len(sys.argv) < 3:
        sys.stderr.write("usage: run_and_log.py <logfile> <target.py> [args...]\n")
        sys.exit(2)
    logpath = sys.argv[1]
    target = sys.argv[2]
    args = sys.argv[3:]
    cmd = [sys.executable, target] + args
    try:
        with open(logpath, "a", encoding="utf-8") as lf:
            p = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=1,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            for line in p.stdout:
                sys.stdout.write(line)
                sys.stdout.flush()
                lf.write(line)
                lf.flush()
            rc = p.wait()
    except Exception as e:
        sys.stderr.write("run_and_log error: %s\n" % e)
        rc = 3
    sys.exit(rc)


if __name__ == "__main__":
    main()
