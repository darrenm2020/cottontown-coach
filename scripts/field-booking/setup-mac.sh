#!/bin/bash
# One-time setup on the Mac that books the field. Run from the repo folder:
#   bash scripts/field-booking/setup-mac.sh
# Installs Playwright and its Chromium into ~/.field-booking, opens a window for you to sign in to Rec1 yourself
# (the password is never saved), and schedules the booking with launchd. Run it again to change the schedule.
set -euo pipefail

# --- the schedule: book DAYS_AHEAD days out, starting just before midnight on these nights ---
RUN_NIGHTS="1 3"            # launchd weekdays (0=Sun ... 6=Sat). Mon + Wed nights book the Tue + Thu a week out.
RUN_AT="23:55"              # Central time; the job keeps checking until the date opens (WAIT_MINUTES)
WAIT_MINUTES=30
DAYS_AHEAD=7
FROM="5pm"
TO="7pm"
FIELD="Soccer Field #1 (practice field)"
TEAM="Cottontown Girls 2014/2015"
SIGNATURE="${FIELD_BOOKING_SIGNATURE:-}"

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HOME_DIR="$HOME/.field-booking"
RUNTIME="$HOME_DIR/runtime"
PLIST="$HOME/Library/LaunchAgents/com.cottontown.field-booking.plist"
NODE="$(command -v node || true)"

[ -n "$NODE" ] || { echo "Install Node.js first (https://nodejs.org, the LTS version), then run this again."; exit 1; }
if [ -z "$SIGNATURE" ]; then read -r -p "Name to type on the waiver: " SIGNATURE; fi
[ -n "$SIGNATURE" ] || { echo "The waiver signature is required."; exit 1; }

echo "Installing Playwright into $RUNTIME ..."
mkdir -p "$RUNTIME" "$HOME_DIR/logs"
(cd "$RUNTIME" && [ -f package.json ] || echo '{"private":true}' > package.json)
(cd "$RUNTIME" && npm install --silent playwright@1.63.0 && npx --yes playwright install chromium)

echo "A browser window will open. Sign in to Rec1 (copy the password from the LastPass app; the extension isn't in this window). It closes by itself once you're signed in."
NODE_PATH="$RUNTIME/node_modules" "$NODE" "$REPO/scripts/field-booking/book-field.mjs" --login

HOUR="${RUN_AT%%:*}"; MIN="${RUN_AT##*:}"
INTERVALS=""
for d in $RUN_NIGHTS; do
  INTERVALS="$INTERVALS<dict><key>Weekday</key><integer>$d</integer><key>Hour</key><integer>$((10#$HOUR))</integer><key>Minute</key><integer>$((10#$MIN))</integer></dict>"
done
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.cottontown.field-booking</string>
  <key>ProgramArguments</key><array>
    <string>$(xml "$NODE")</string>
    <string>$(xml "$REPO/scripts/field-booking/book-field.mjs")</string>
    <string>--in-days</string><string>$DAYS_AHEAD</string>
    <string>--from</string><string>$FROM</string>
    <string>--to</string><string>$TO</string>
    <string>--field</string><string>$(xml "$FIELD")</string>
    <string>--team</string><string>$(xml "$TEAM")</string>
    <string>--wait</string><string>$WAIT_MINUTES</string>
    <string>--out</string><string>$(xml "$HOME_DIR/runs/latest")</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>NODE_PATH</key><string>$(xml "$RUNTIME/node_modules")</string>
    <key>FIELD_BOOKING_SIGNATURE</key><string>$(xml "$SIGNATURE")</string>
    <key>TZ</key><string>America/Chicago</string>
  </dict>
  <key>StartCalendarInterval</key><array>$INTERVALS</array>
  <key>StandardOutPath</key><string>$(xml "$HOME_DIR/logs/runs.log")</string>
  <key>StandardErrorPath</key><string>$(xml "$HOME_DIR/logs/errors.log")</string>
</dict></plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

cat <<EOF

Done. Scheduled: weekdays [$RUN_NIGHTS] (0=Sun) at $RUN_AT, booking $FIELD $FROM-$TO, $DAYS_AHEAD days out.
- Results: $HOME_DIR/logs/runs.log (one JSON line per run); screenshots of the last run: $HOME_DIR/runs/latest
- Keep the Mac awake before midnight:  sudo pmset repeat wakeorpoweron MTWRFSU 23:45:00
- When a run says "signed-out", sign in again:  NODE_PATH="$RUNTIME/node_modules" node "$REPO/scripts/field-booking/book-field.mjs" --login
- Stop the schedule:  launchctl unload "$PLIST"
EOF
