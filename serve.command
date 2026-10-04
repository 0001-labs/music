#!/bin/bash
# Double-click to run Music: serves the app on this Mac and opens it in Safari. Close this window to stop.
# (Safari will not load the audio when index.html is opened straight from the disk, so it has to be served.)
cd "$(dirname "$0")/dist" || exit 1
PORT=8000
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done
URL="http://localhost:$PORT/"
echo "Music is running at $URL"
echo "Close this window or press Control-C to stop."
( sleep 1; open -a Safari "$URL" ) &
# Python's plain http.server queues only five connections; a browser loading the app opens more, and the rest get reset.
exec python3 - "$PORT" <<'PY'
import http.server, sys
class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128
http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler, ServerClass=Server, port=int(sys.argv[1]), bind="127.0.0.1")
PY
