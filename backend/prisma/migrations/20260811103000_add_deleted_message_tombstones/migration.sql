CREATE TABLE `deleted_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_code` VARCHAR(6) NOT NULL,
  `device_message_id` VARCHAR(128) NOT NULL,
  `address` VARCHAR(64) NULL,
  `deleted_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `deleted_messages_device_message_key`(`device_code`, `device_message_id`),
  INDEX `deleted_messages_device_address_idx`(`device_code`, `address`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
