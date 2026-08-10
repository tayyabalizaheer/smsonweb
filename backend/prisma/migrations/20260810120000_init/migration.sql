CREATE TABLE `messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sender` VARCHAR(64) NOT NULL,
  `body` TEXT NOT NULL,
  `received_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `messages_received_at_idx` ON `messages`(`received_at`);
CREATE INDEX `messages_sender_idx` ON `messages`(`sender`);
