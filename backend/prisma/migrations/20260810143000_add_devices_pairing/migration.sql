CREATE TABLE `devices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(6) NOT NULL,
  `name` VARCHAR(120) NULL,
  `pairing_options` JSON NULL,
  `pairing_answer` VARCHAR(8) NULL,
  `pairing_updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `session_id_1` VARCHAR(64) NULL,
  `session_id_2` VARCHAR(64) NULL,
  `session_id_3` VARCHAR(64) NULL,
  `session_id_4` VARCHAR(64) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `devices_code_key`(`code`),
  UNIQUE INDEX `devices_session_id_1_key`(`session_id_1`),
  UNIQUE INDEX `devices_session_id_2_key`(`session_id_2`),
  UNIQUE INDEX `devices_session_id_3_key`(`session_id_3`),
  UNIQUE INDEX `devices_session_id_4_key`(`session_id_4`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `messages`
  ADD COLUMN `device_code` VARCHAR(6) NULL;

CREATE INDEX `messages_device_code_idx` ON `messages`(`device_code`);
