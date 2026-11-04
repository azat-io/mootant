# Runs a command on a pseudo-terminal (so mootant sees a TTY and starts its
# spinner) and types Ctrl+C once a marker appears in a file, exactly as a user
# would: the line discipline sends SIGINT to the foreground process group.
# Usage: python3 -I ctrl-c.py <marker-file> <marker-text> <delay-s> <cmd...>
import os, pty, sys, time

marker_file, marker, delay = sys.argv[1], sys.argv[2], float(sys.argv[3])
cmd = sys.argv[4:]
pid, fd = pty.fork()
if pid == 0:
    os.execvp(cmd[0], cmd)
start = time.time()
sent = None
output = b''
while True:
    try:
        r = os.waitpid(pid, os.WNOHANG)
    except ChildProcessError:
        break
    if r[0] != 0:
        status = r[1]
        break
    try:
        import select
        ready, _, _ = select.select([fd], [], [], 0.05)
        if ready:
            output += os.read(fd, 65536)
    except OSError:
        pass
    if sent is None:
        try:
            if marker in open(marker_file).read():
                time.sleep(delay)
                os.write(fd, b'\x03')
                sent = time.time()
        except FileNotFoundError:
            pass
    if time.time() - start > 120:
        os.kill(pid, 9)
print('ctrl-c sent after %.1fs' % ((sent or 0) - start))
print('exit: code=%s signal=%s' % (os.WEXITSTATUS(status) if os.WIFEXITED(status) else None, os.WTERMSIG(status) if os.WIFSIGNALED(status) else None))
print('tail:', output[-400:].decode('utf8', 'replace').replace('\r', ''))
