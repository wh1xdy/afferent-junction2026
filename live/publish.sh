#!/usr/bin/env bash
# Builds the GitHub Pages site for Afferent Live: the live page at the root, the game (demo/) at play/.
#
#   live/publish.sh                   build into $OUT only (default: $TMPDIR/afferent-pages); nothing leaves this Mac
#   live/publish.sh --publish         build, then force-update the gh-pages branch on origin with exactly that tree
#
# Options
#   --out DIR                 where to build
#   --endpoint URL            write endpoint.json pointing at URL (a local test, e.g. http://127.0.0.1:8787).
#                             Without it the endpoint.json now on gh-pages is kept (tunnel.sh keeps it current),
#                             or an empty one ({"live": null}: the page shows the table offline).
#   --dev-connect ORIGIN      also allow ORIGIN in the page's connect-src (local tests only; never with --publish)
#
# Only files git tracks are copied, so an untracked secret (demo/js/voice-config.js, the voice relay code) can never
# be in the build; Talk stays off in the published game, as the app does without a relay config.
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
OUT="${TMPDIR:-/tmp}/afferent-pages"
PUBLISH=0 ENDPOINT="" DEV_CONNECT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --publish) PUBLISH=1 ;;
    --out) OUT="$2"; shift ;;
    --endpoint) ENDPOINT="$2"; shift ;;
    --dev-connect) DEV_CONNECT="$2"; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
if [ "$PUBLISH" = 1 ] && { [ -n "$DEV_CONNECT" ] || [ -n "$ENDPOINT" ]; }; then
  echo "--dev-connect and --endpoint are for local tests; not with --publish" >&2; exit 2
fi

copy_tracked() {   # copy_tracked <dest> <pathspec>...: the tracked files under the pathspecs, as they are on disk
  local dest="$1"; shift
  mkdir -p "$dest"
  (cd "$ROOT" && git ls-files -z -- "$@" | tar --null -T - -cf -) | tar -xf - -C "$dest"
}

rm -rf "$OUT"
mkdir -p "$OUT"
STAGE=$(mktemp -d "${TMPDIR:-/tmp}/afferent-stage.XXXXXX")
trap 'rm -rf "$STAGE"' EXIT

# the live page at the root
copy_tracked "$STAGE" live/index.html live/live.css live/live.js live/whatif.js live/favicon.svg live/fonts
cp -R "$STAGE/live/." "$OUT/"

# the game at play/: demo/ without its tests, plus the design files `npm run design` copies into demo/design
copy_tracked "$STAGE" demo design/tokens.css design/gui-tokens.css design/fonts
rm -rf "$STAGE/demo/tests" "$STAGE/demo/design" "$STAGE/demo/js/voice-config.js"
cp -R "$STAGE/demo" "$OUT/play"
mkdir -p "$OUT/play/design"
cp -R "$STAGE/design/tokens.css" "$STAGE/design/gui-tokens.css" "$STAGE/design/fonts" "$OUT/play/design/"
cp "$ROOT/live/play/live-bridge.js" "$OUT/play/js/live-bridge.js"

python3 - "$OUT" "$DEV_CONNECT" <<'PY'
import pathlib, re, sys
out, dev = pathlib.Path(sys.argv[1]), sys.argv[2]
game = out / "play" / "index.html"
html = game.read_text(encoding="utf-8")
voice = '  <script src="js/voice-config.js"></script>\n'
main = '  <script src="js/main.js"></script>\n'
assert html.count(voice) == 1 and html.count(main) == 1, "demo/index.html changed: update publish.sh"
html = html.replace(voice, "").replace(main, '  <script src="js/live-bridge.js"></script>\n' + main)
game.write_text(html, encoding="utf-8")
if dev:
    assert re.fullmatch(r"https?://[A-Za-z0-9.-]+(:\d+)?", dev), "--dev-connect takes an origin"
    page = out / "index.html"
    text = page.read_text(encoding="utf-8")
    key = "connect-src 'self' https://*.trycloudflare.com"
    assert key in text
    page.write_text(text.replace(key, f"{key} {dev}"), encoding="utf-8")
PY

# endpoint.json: where the page finds the live server
if [ -n "$ENDPOINT" ]; then
  case "$ENDPOINT" in *trycloudflare.com*) SSE=false ;; *) SSE=true ;; esac
  printf '{"live":"%s","sse":%s,"updated_iso":"%s"}\n' "$ENDPOINT" "$SSE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT/endpoint.json"
elif git -C "$ROOT" fetch -q origin gh-pages 2>/dev/null && git -C "$ROOT" show FETCH_HEAD:endpoint.json > "$OUT/endpoint.json" 2>/dev/null; then
  echo "kept endpoint.json from gh-pages: $(cat "$OUT/endpoint.json")"
else
  printf '{"live":null,"sse":false,"updated_iso":null}\n' > "$OUT/endpoint.json"
fi
touch "$OUT/.nojekyll"

# nothing secret, nothing server-side
if find "$OUT" -name 'voice-config.js' -o -name '*.py' -o -name '*.sh' -o -name '*.token' | grep -q .; then
  echo "refusing: a server file or secret is in the build" >&2; exit 1
fi
TOKEN_FILE="${AFFERENT_HUB_TOKEN_FILE:-$HOME/.afferent/home-hub.token}"
if [ -s "$TOKEN_FILE" ] && grep -r -l -F -f "$TOKEN_FILE" "$OUT" >/dev/null 2>&1; then
  echo "refusing: the hub token appears in the build" >&2; exit 1
fi
echo "built $(du -sh "$OUT" | cut -f1) into $OUT"

[ "$PUBLISH" = 1 ] || { echo "not published (add --publish to force-update gh-pages)"; exit 0; }

REMOTE=$(git -C "$ROOT" remote get-url origin)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/afferent-gh-pages.XXXXXX")
trap 'rm -rf "$STAGE" "$WORK"' EXIT
cp -R "$OUT/." "$WORK/"
git -C "$WORK" init -q
git -C "$WORK" checkout -q -b gh-pages
git -C "$WORK" add -A
git -C "$WORK" commit -q -m "live: pages build from $(git -C "$ROOT" rev-parse --short HEAD)"
git -C "$WORK" push -q --force "$REMOTE" gh-pages:gh-pages
echo "pushed gh-pages to $REMOTE"
if command -v gh >/dev/null 2>&1; then
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
  if [ -n "$REPO" ] && ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
    gh api -X POST "repos/$REPO/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null \
      && echo "GitHub Pages switched on for $REPO (gh-pages, /)"
  fi
  [ -n "$REPO" ] && echo "site: https://${REPO%%/*}.github.io/${REPO#*/}/ (a minute or so after the push)"
fi
