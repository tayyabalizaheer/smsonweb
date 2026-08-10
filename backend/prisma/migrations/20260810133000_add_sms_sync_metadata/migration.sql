ALTER TABLE `messages`
  ADD COLUMN `device_message_id` VARCHAR(128) NULL,
  ADD COLUMN `direction` VARCHAR(16) NOT NULL DEFAULT 'received',
  ADD COLUMN `message_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0);

CREATE UNIQUE INDEX `messages_device_message_id_key` ON `messages`(`device_message_id`);
CREATE INDEX `messages_message_at_idx` ON `messages`(`message_at`);
CREATE INDEX `messages_direction_idx` ON `messages`(`direction`);
