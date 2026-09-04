#!/usr/bin/env python3
"""server-debug-nocache.py - a static file server for development that forbids caching.

The program itself only needs any static server; python3 -m http.server does fine for playing.
It is less fine for *working on* the program, because it sends no Cache-Control header at all -
only Last-Modified - which leaves the browser free to decide for itself how long a file stays
good. Safari on iOS is particularly willing, and the symptom is the worst kind: an edit that
appears not to have worked, on a device where there is no obvious way to clear the cache and
no easy way to tell a stale file from a broken change.

This sends no-store on everything, so every reload fetches. Use it while editing; anything will
do for actually solving crosswords.

    python3 server-debug-nocache.py          # port 8050
    python3 server-debug-nocache.py 8080     # or wherever

Serves the directory it is run from, so run it from the folder holding index.html.
"""

import http.server
import sys

DEFAULT_PORT = 8050


class NoCacheRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Adds the headers that tell every browser not to keep a copy of anything."""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')      # for anything still speaking HTTP/1.0
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # The default logs every request to stderr, which buries anything worth reading.
        # Keep failures, drop the rest.
        status = args[1] if len(args) > 1 else ''
        if not str(status).startswith('2'):
            super().log_message(fmt, *args)


def main(argv):
    if len(argv) > 1 and argv[1] in ('-h', '--help'):
        print(__doc__)
        return 0

    port = DEFAULT_PORT
    if len(argv) > 1:
        try:
            port = int(argv[1])
        except ValueError:
            print(f'Not a port number: {argv[1]}', file=sys.stderr)
            return 2
        if not 1 <= port <= 65535:
            print(f'Port out of range: {port}', file=sys.stderr)
            return 2

    print(f'Serving this folder on http://localhost:{port}/ with caching switched off.')
    print('Press Control-C to stop.')
    try:
        http.server.test(HandlerClass=NoCacheRequestHandler, port=port)
    except KeyboardInterrupt:
        print()
        return 0
    except OSError as err:
        print(f'Could not listen on port {port}: {err}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
