"""Serve a package folder as the GalaxaHub file route serves a post with the standard content
policy (references/content-policy.md), on http://127.0.0.1:8791/.

usage: python3 serve.py <package folder>
"""
import functools
import http.server
import sys

POLICY = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
          "img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; "
          "frame-ancestors 'self'; connect-src 'self' data: blob:")


class Package(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy", POLICY)
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(
        ("127.0.0.1", 8791), functools.partial(Package, directory=sys.argv[1])).serve_forever()
