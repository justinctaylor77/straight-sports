#!/bin/bash
# Starts the local servers used by qa-v17.js: :8799 normal, :8798 mock CFP, :8797 stale-client sim (copy in /tmp/sim). Then runs the QA.
cd "$(dirname "$0")/.."; pkill -f "node server/index.js" 2>/dev/null; pkill -f "node /tmp/sim/server/index.js" 2>/dev/null; sleep 1
mkdir -p /tmp/sim; [ -d /tmp/sim/node_modules ] || ln -s "$PWD/node_modules" /tmp/sim/node_modules; cp package.json /tmp/sim/ 2>/dev/null; rm -rf /tmp/sim/server && cp -r server /tmp/sim/server; [ -d /tmp/sim/public ] || cp -r public /tmp/sim/public
PORT=8799 node server/index.js >/tmp/srv-8799.log 2>&1 &
PORT=8798 BRACKETS_MOCK_CFP="$PWD/tests/fixtures/mock-cfp.json" node server/index.js >/tmp/srv-8798.log 2>&1 &
(cd /tmp/sim && PORT=8797 node server/index.js >/tmp/srv-8797.log 2>&1 &)
sleep 6; node scripts/qa-v17.js
