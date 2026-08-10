CREATE DATABASE IF NOT EXISTS sms_sync
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sms_sync;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sender VARCHAR(64) NOT NULL,
  body TEXT NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_messages_received_at (received_at),
  INDEX idx_messages_sender (sender)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
