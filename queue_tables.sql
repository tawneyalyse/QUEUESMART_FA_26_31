-- QueueSmart A4 / Teammate 2: execute AFTER Service and UserCredentials exist.
-- MySQL 8.0.16+; parent keys must be signed INT, with InnoDB tables.
-- Fresh-table definitions, NOT a migration for existing tables.
-- CHECK constraints require MySQL 8.0.16+ for enforcement.
CREATE TABLE IF NOT EXISTS `Queue` (
  queue_id INT NOT NULL AUTO_INCREMENT,
  service_id INT NOT NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  open_service_id INT GENERATED ALWAYS AS (CASE WHEN status = 'open' THEN service_id ELSE NULL END) STORED,
  PRIMARY KEY (queue_id),
  UNIQUE KEY uq_open_service (open_service_id),
  KEY idx_queue_service_status (service_id, status),
  CONSTRAINT fk_queue_service FOREIGN KEY (service_id)
    REFERENCES Service(service_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS QueueEntry (
  entry_id INT NOT NULL AUTO_INCREMENT,
  queue_id INT NOT NULL,
  user_id INT NOT NULL,
  position INT NOT NULL,
  join_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('waiting','served','canceled') NOT NULL DEFAULT 'waiting',
  waiting_user_id INT GENERATED ALWAYS AS (CASE WHEN status = 'waiting' THEN user_id ELSE NULL END) STORED,
  waiting_position INT GENERATED ALWAYS AS (CASE WHEN status = 'waiting' THEN position ELSE NULL END) STORED,
  PRIMARY KEY (entry_id),
  UNIQUE KEY uq_waiting_user (waiting_user_id),
  UNIQUE KEY uq_queue_waiting_position (queue_id, waiting_position),
  KEY idx_entry_queue_status_position (queue_id, status, position),
  KEY idx_entry_user_status (user_id, status),
  CONSTRAINT fk_entry_queue FOREIGN KEY (queue_id)
    REFERENCES `Queue`(queue_id) ON DELETE RESTRICT,
  CONSTRAINT fk_entry_user FOREIGN KEY (user_id)
    REFERENCES UserCredentials(user_id) ON DELETE RESTRICT,
  CONSTRAINT chk_queue_position CHECK (position >= 1)
) ENGINE=InnoDB;
