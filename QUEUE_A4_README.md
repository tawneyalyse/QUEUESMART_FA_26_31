# QueueSmart A4 — Teammate 2 review and integration package

## Status: queue unit tests pass; final team integration is blocked

Reviewed the supplied QueueSmart_A4_Teammate2.zip independently. This package is a corrected **overlay**, not the complete repository and not a certified live-database submission. It does not overwrite auth.js, server.js, history.js, notifications.js or admin.js. The teammate schema, exact repository URL/target branch and assignment handout were not available; the requirements supplied in the request were used. No changes were pushed.

## What was actually verified

- Node 24.22.1; dependencies installed and bcrypt rebuilt successfully.
- Final queue suite: **32 tests passed**, two Jest suites. Combined queue.js/waitTime.js coverage: **98.53% statements, 89.92% branches, 100% functions, 98.40% lines**. Thresholds are 80% in all four categories. Coverage applies ONLY to these two backend modules.
- Original new test file failed during Jest transformation because its mock referenced an out-of-scope `client` variable. Original default Jest run failed all six suites; older suites use node:test rather than Jest.
- History/notification legacy tests still fail: they import removed `run`, `get`, and `bcrypt` database exports. Those teammate-owned modules/tests are unchanged.
- Service tests were separately executed: 10 passed, 5 failed with no configured MySQL database; this is not evidence of successful service/database integration.
- Changed JavaScript and the optional MySQL test passed syntax checks. Browser behavior was inspected in source, not exercised in a live browser.
- No MySQL server or team schema was available. SQL enforcement, actual locking, rollback, restart persistence and real concurrent requests remain unverified. Mock tests cannot establish those properties.

## Files to merge

Queue backend/schema: queue.js, waitTime.js (unchanged reference), queue_tables.sql, queue_schema_preflight.sql.
Tests/configuration: test/queue.test.js, test/waitTime.test.js, test/queue.mysql.cjs, jest.queue.config.cjs.
Queue frontend: queue-page.js, queue-status.js, queue_status.html, admin_queue_status.html, user_dashboard.html, join_queue.html.
Shared integration edits to review with owners: app.js (only queue rendering guards), database.js (environment configuration), package.json and package-lock.json (driver and test scripts), .env.example and .gitignore.
Documentation: this file and REVIEW_FINDINGS.md. Evidence files are supporting output, not application code.
**Delete the old test/queue-a4.test.js** from the draft when applying this overlay; it is replaced by test/queue.test.js.

Do not blindly replace newer branch files. Compare each changed file with the current target branch and merge only queue-related hunks. No git patch is supplied because a diff of the original database.js would reproduce its embedded password.

## Setup

1. Create a feature branch from the agreed current team branch. Preserve teammates' pending changes.
2. Confirm the exact team schema using queue_schema_preflight.sql. It is read-only; SHOW CREATE statements for absent tables will naturally fail. Share definitions, not passwords.
3. Require MySQL **8.0.16+**, InnoDB, signed INT parent keys, and positive integer Service.expected_duration in minutes. The SQL uses enforced CHECK constraints and generated-column unique indexes.
4. queue_tables.sql creates Queue and QueueEntry only. It assumes Service and UserCredentials already exist. **CREATE TABLE IF NOT EXISTS does not upgrade existing tables.** If tables already exist, inspect duplicates and arrange a reviewed ALTER migration against their real definitions. Do not drop or recreate teammates' data.
5. Run `npm ci`. Copy .env.example to .env and enter local settings. database.js no longer contains a password. Have the owner rotate the credential embedded in the previous draft; do not commit .env.
6. With Node 20.6+ use `node --env-file=.env server.js`, or export variables before `npm start`. The application does not automatically load .env. Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME and SESSION_SECRET.
7. Run `npm run test:queue`. `npm test` runs that suite then the known-failing legacy suites; `npm run test:services` separately runs the existing database-dependent service suite. A green queue suite is not a green project suite.

## Required teammate handoff: history and notifications

Queue writes use the same MySQL transaction as QueueEntry changes:
- History(user_id, service_id, outcome), with auto/default history_id and join time. Completion updates history_id, outcome and completed_at. Accepted outcomes must include active, left and served.
- Notification(user_id, notification_type, message, status). Accepted values must include queue_joined/almost_ready and sent; any other required columns need defaults.

In the supplied ZIP, history.js and notifications.js still serve in-memory arrays. They do not read these SQL rows. Their owner must complete the MySQL migration and align their public JSON shape with app.js before the end-to-end requirement is satisfied. Do not copy SQL events into memory as a substitute: those records disappear on restart.

The queue transaction fails and rolls back if these tables/columns are missing. Merely applying the two queue table definitions is insufficient to run the whole application.

## Queue behavior and concurrency design

One active membership globally per user, and one open queue per service. Closed queue records are historical; joining a service with no open queue creates a new open queue. There is no service shutdown feature in this module.

Each mutation acquires its Service row lock on the transaction connection before reading queue state. Joins additionally lock the UserCredentials row and read active membership with FOR UPDATE. These locks serialize same-service writes and cross-service duplicate joins; generated unique keys provide another barrier. Queue reads never create rows. All queue writers must use this locking protocol; do not close queues or edit positions concurrently through unrelated scripts.

Leaving sets canceled; serving sets served; neither deletes the entry. Remaining waiting positions are compacted in ascending order. Wait = (position - 1) × expected duration. New-arrival wait = number waiting × duration. No active service-progress timer or multiple-server model is assumed. Empty queues have a new-arrival wait of zero.

Almost-ready alerts are generated only when an entry crosses from position >2 into the first two positions. Users joining at position 1 or 2 already receive their position/wait in queue_joined; they do not get duplicate near-front messages after every action.

Session ownership follows auth.js's existing session.user.email format. Users view/join/leave only their own membership; queue rosters and serve-next require role Administrator. Queue totals are available to signed-in users. Authorization of other modules remains their owners' responsibility.

## Optional real MySQL test (NOT RUN here)

Have a database owner create a separate EMPTY database with a name such as queuesmart_a4_test_review. Configure a separate environment file for it. Never use the team or production database.

`node --env-file=.env.mysql-test test/queue.mysql.cjs`

The script refuses nonempty databases and names outside queuesmart_a4_test_*. It creates synthetic parent/history/notification fixture tables plus the actual queue DDL, then checks concurrent joins, duplicate joins across services, concurrent serving, positions, waits, SQL events and rollback on notification-write failure. It retains fixture data for inspection; reruns require another empty database. It does not validate compatibility with the team's real schema. MySQL DDL is not transactionally rolled back; a failed run can leave fixture tables behind.

## Before pushing or submission

- Obtain exact repo URL/target branch and current SHOW CREATE TABLE output; compare and merge rather than overwrite.
- Merge the teammate's database-backed history/notification implementation and repair their tests.
- Run the real MySQL test, then repeat with the team's actual schema and registered test users.
- Manually verify: login; join users A/B/C; refresh A's page; leave A; confirm B=1/0 minutes and C=2/duration; serve B as administrator; confirm history and notifications through their APIs/pages; restart the server and verify C remains queued. Check an unauthenticated caller and a Student cannot serve.
- Verify both browser dashboards and status pages against SQL, including polling after another session acts.
- Run the whole team suite and measure repository-wide coverage against the instructor's requirement. This package's 98.53% is module coverage only.
- Include Queue and QueueEntry definitions plus the contribution row below. Add actual live verification results only after executing them.

## Contribution row

| Member | Module | Contribution | Verification |
|---|---|---|---|
| Teammate 2 — [your name] | Queue & Wait Time | Prepared Queue/QueueEntry MySQL definitions; repaired transactional join, leave and serve behavior, position/wait updates, queue authorization, SQL history/notification writes and queue status views; replaced obsolete queue tests. | 32 queue/wait unit tests passed; 98.53% statement coverage for these modules. Team-schema, live MySQL and history/notification API integration pending. |
