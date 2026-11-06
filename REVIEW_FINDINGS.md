# Independent draft review

Source: QueueSmart_A4_Teammate2.zip, SHA-256 7059a61313e95946cb3563767b8db3b49c53bf53c7b8dc6464ea85d58e250284.

| Finding | Disposition |
|---|---|
| mysql2 missing | Not true for this draft: package.json already contains mysql2. Added a lockfile for reproducibility. |
| Hardcoded password | Confirmed; replaced with environment settings. Original credential omitted from output. |
| User-status response has no usable service ID | Fixed SELECT to include q.service_id and response entry.serviceId; refresh/leave regression test added. |
| Read endpoints create queues without locks | Fixed: reads return empty state; only transactional joining creates a queue. |
| Duplicate joins and stale transaction snapshots | Service lookup/lock moved onto the transaction connection before state reads; user lock and current membership read added; unique keys specified. Actual engine concurrency still needs execution. |
| Connection acquisition occurs outside try | Fixed; pool failures now return controlled responses. Release runs even if rollback fails. |
| Duplicate near-front notifications | Fixed to notify only threshold crossings. |
| Any caller can serve or supply another user's email | Queue boundary now uses the existing session; ownership and administrator checks tested, including trailing slashes. |
| SQL lacks unique active queue/user/position constraints | Generated-column unique keys added; these require a reviewed migration on existing tables. |
| New regression test cannot load in Jest | Replaced with a 32-test queue/wait suite. |
| Old queue tests expect removed arrays | Replaced. Teammate legacy tests retained and identified as failing. |
| Queue status/dashboard use demo state | Queue portions switched to API fetches; app.js guarded against overwriting live queue views. Browser end-to-end execution pending. |
| History/notification integration complete | False in supplied draft: SQL writes and in-memory API reads are disconnected. Requires teammate MySQL modules. |
| SQL matches actual team schema | Cannot establish: full schema absent. Read-only schema preflight included. |
| Original GitHub comparison | Not performed: repo owner/URL and branch absent; public search did not resolve the exact repository. |

Read QUEUE_A4_README.md for exact setup, file list, test scope and submission gates. This is not a promise of full credit or a fully verified live deployment.
