CREATE TABLE `web_read_states` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_code` VARCHAR(6) NOT NULL,
  `session_id` VARCHAR(64) NOT NULL,
  `address` VARCHAR(64) NOT NULL,
  `last_read_at` TIMESTAMP(0) NULL,
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `web_read_states_device_session_address_key`(`device_code`, `session_id`, `address`),
  INDEX `web_read_states_device_session_idx`(`device_code`, `session_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
