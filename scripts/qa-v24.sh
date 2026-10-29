#!/bin/bash
# Starts the local servers used by qa-v24.js (:8781/:8782 = High School Football against the SYNTHETIC mocks on :8770 (YouTube OK) / :8772 (YouTube API failing) with a fake key; :8785 = account sync ON against a throwaway Neon schema sync_test_<random>, removed at the end; :8783 = sync pointed at an unreachable database; needs NEON_DATABASE_URL in the env for the sync cases, never printed): :8799 normal, :8796 with NCAA.com + Road to Nationals unreachable, :8794 with the AUSL sources unreachable. Then runs the QA.
cd "$(dirname "$0")/.."; pkill -f "node server/index.js" 2>/dev/null; pkill -f "scripts/mock-hsfb.js" 2>/dev/null; sleep 1
# v1.6.0: SYNTHETIC High School Football mocks (WatchESPN + KSL RSS + YouTube Data API). The fake key below is not a real key; the real YOUTUBE_API_KEY is never used or printed here.
node scripts/mock-hsfb.js 8770 ok >/tmp/mock-8770.log 2>&1 &
node scripts/mock-hsfb.js 8772 fail >/tmp/mock-8772.log 2>&1 &
HSMOCK() { echo "HSFB_WATCH_BASE=http://127.0.0.1:$1/watch HSFB_KSL_RSS=http://127.0.0.1:$1/rss YOUTUBE_API_BASE=http://127.0.0.1:$1/youtube/v3 YOUTUBE_API_KEY=qa-fake-key-not-real"; }
export SYNC_TEST_SCHEMA="sync_test_$(od -An -N5 -tx1 /dev/urandom | tr -d ' \n')"; export SYNC_TEST_PEPPER="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
env -u NEON_DATABASE_URL -u DATABASE_URL -u YOUTUBE_API_KEY PORT=8799 LISTS_NO_WRITE=1 node server/index.js >/tmp/srv-8799.log 2>&1 &
env -u NEON_DATABASE_URL -u DATABASE_URL -u YOUTUBE_API_KEY PORT=8794 AUSL_WIKI_BASE=http://127.0.0.1:9 AUSL_MLB_BASE=http://127.0.0.1:9 LISTS_NO_WRITE=1 node server/index.js >/tmp/srv-8794.log 2>&1 &
env -u NEON_DATABASE_URL -u DATABASE_URL -u YOUTUBE_API_KEY PORT=8796 NCAA_API_BASE=http://127.0.0.1:9 RTN_API_BASE=http://127.0.0.1:9 LISTS_NO_WRITE=1 node server/index.js >/tmp/srv-8796.log 2>&1 &
env -u YOUTUBE_API_KEY PORT=8785 SYNC_PEPPER="$SYNC_TEST_PEPPER" SYNC_SCHEMA="$SYNC_TEST_SCHEMA" LISTS_NO_WRITE=1 node server/index.js >/tmp/srv-8785.log 2>&1 &
env -u DATABASE_URL -u YOUTUBE_API_KEY PORT=8783 SYNC_PEPPER="$SYNC_TEST_PEPPER" NEON_DATABASE_URL="postgresql://u:p@127.0.0.1:9/x" SYNC_SCHEMA=sync_test_unreachable LISTS_NO_WRITE=1 node server/index.js >/tmp/srv-8783.log 2>&1 &
env -u NEON_DATABASE_URL -u DATABASE_URL -u YOUTUBE_API_KEY $(HSMOCK 8770) PORT=8781 LISTS_NO_WRITE=1 node server/index.js >/tmp/srv-8781.log 2>&1 &
env -u NEON_DATABASE_URL -u DATABASE_URL -u YOUTUBE_API_KEY $(HSMOCK 8772) PORT=8782 LISTS_NO_WRITE=1 node server/index.js >/tmp/srv-8782.log 2>&1 &
sleep 7; node scripts/qa-v24.js; rc=$?
pkill -f "scripts/mock-hsfb.js" 2>/dev/null
node scripts/qa-cleanup-schema.js
exit $rc
