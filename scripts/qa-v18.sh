#!/bin/bash
# Starts the local servers used by qa-v18.js: :8799 normal (writes today's list snapshots into data/lists), :8796 with NCAA.com + Road to Nationals unreachable. Then runs the QA.
cd "$(dirname "$0")/.."; pkill -f "node server/index.js" 2>/dev/null; sleep 1
PORT=8799 node server/index.js >/tmp/srv-8799.log 2>&1 &
PORT=8796 NCAA_API_BASE=http://127.0.0.1:9 RTN_API_BASE=http://127.0.0.1:9 LISTS_NO_WRITE=1 node server/index.js >/tmp/srv-8796.log 2>&1 &
sleep 6; node scripts/qa-v18.js
