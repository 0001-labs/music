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
exec python3 -m http.server "$PORT" --bind 127.0.0.1
