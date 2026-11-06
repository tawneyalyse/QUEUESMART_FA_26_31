-- Read-only: run against the team's target database and share the output.
SELECT VERSION(), DATABASE(), @@transaction_isolation;
SHOW CREATE TABLE Service;
SHOW CREATE TABLE UserCredentials;
SHOW CREATE TABLE `Queue`;
SHOW CREATE TABLE QueueEntry;
SHOW CREATE TABLE History;
SHOW CREATE TABLE Notification;
-- If Queue/QueueEntry already exist, inspect BEFORE any proposed migration.
SELECT service_id, COUNT(*) AS open_queues FROM `Queue`
WHERE status='open' GROUP BY service_id HAVING COUNT(*) > 1;
SELECT user_id, COUNT(*) AS active_entries FROM QueueEntry
WHERE status='waiting' GROUP BY user_id HAVING COUNT(*) > 1;
SELECT queue_id, position, COUNT(*) AS duplicates FROM QueueEntry
WHERE status='waiting' GROUP BY queue_id, position HAVING COUNT(*) > 1;
SELECT queue_id, COUNT(*) AS waiting, MIN(position), MAX(position), COUNT(DISTINCT position)
FROM QueueEntry WHERE status='waiting' GROUP BY queue_id;
