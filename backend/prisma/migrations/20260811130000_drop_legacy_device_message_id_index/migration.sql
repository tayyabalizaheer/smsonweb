SET @index_exists = (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'messages'
    AND index_name = 'messages_device_message_id_key'
);

SET @drop_index_sql = IF(
  @index_exists > 0,
  'DROP INDEX `messages_device_message_id_key` ON `messages`',
  'SELECT 1'
);

PREPARE drop_index_stmt FROM @drop_index_sql;
EXECUTE drop_index_stmt;
DEALLOCATE PREPARE drop_index_stmt;
