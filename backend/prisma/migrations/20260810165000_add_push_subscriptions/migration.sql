CREATE TABLE `push_subscriptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_code` VARCHAR(6) NOT NULL,
  `endpoint` VARCHAR(512) NOT NULL,
  `p256dh` VARCHAR(128) NOT NULL,
  `auth` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `push_subscriptions_endpoint_key`(`endpoint`),
  INDEX `push_subscriptions_device_code_idx`(`device_code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
