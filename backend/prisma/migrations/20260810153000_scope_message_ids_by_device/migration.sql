DROP INDEX `messages_device_message_id_key` ON `messages`;

DELETE m1 FROM `messages` m1
INNER JOIN `messages` m2
  ON m1.`device_code` = m2.`device_code`
  AND m1.`device_message_id` = m2.`device_message_id`
  AND m1.`id` < m2.`id`
WHERE m1.`device_code` IS NOT NULL
  AND m1.`device_message_id` IS NOT NULL;

CREATE UNIQUE INDEX `messages_device_code_device_message_id_key`
  ON `messages`(`device_code`, `device_message_id`);
