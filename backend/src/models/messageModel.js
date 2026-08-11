const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { normalizeConversationAddress } = require('../utils/phone');

const senderColumnSql = (alias = 'm') => Prisma.raw(`${alias}.sender`);

const compactAddressSql = (alias = 'm') => Prisma.sql`
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(TRIM(${senderColumnSql(alias)}), ' ', ''),
          '-',
          ''
        ),
        '(',
        ''
      ),
      ')',
      ''
    ),
    '.',
    ''
  )
`;

const digitsAddressSql = (alias = 'm') => Prisma.sql`
  REPLACE(${compactAddressSql(alias)}, '+', '')
`;

const conversationAddressSql = (alias = 'm') => Prisma.sql`
  CASE
    WHEN ${compactAddressSql(alias)} LIKE '+92%' AND CHAR_LENGTH(${compactAddressSql(alias)}) > 3
      THEN CONCAT('0', SUBSTRING(${compactAddressSql(alias)}, 4))
    WHEN ${digitsAddressSql(alias)} LIKE '0092%' AND CHAR_LENGTH(${digitsAddressSql(alias)}) > 4
      THEN CONCAT('0', SUBSTRING(${digitsAddressSql(alias)}, 5))
    WHEN ${digitsAddressSql(alias)} LIKE '92%' AND CHAR_LENGTH(${digitsAddressSql(alias)}) >= 11
      THEN CONCAT('0', SUBSTRING(${digitsAddressSql(alias)}, 3))
    WHEN ${digitsAddressSql(alias)} LIKE '0%'
      THEN ${digitsAddressSql(alias)}
    ELSE LOWER(TRIM(${senderColumnSql(alias)}))
  END
`;

const deviceWhereSql = (deviceCode, alias = 'm') => {
  return deviceCode ? Prisma.sql`AND ${Prisma.raw(`${alias}.device_code`)} = ${deviceCode}` : Prisma.empty;
};

const hydrateMessage = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    deviceMessageId: row.deviceMessageId,
    deviceCode: row.deviceCode,
    address: row.address,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    direction: row.direction,
    body: row.body,
    messageAt: row.messageAt,
    syncedAt: row.syncedAt
  };
};

const selectMessageFieldsSql = (alias = 'm') => Prisma.sql`
  ${Prisma.raw(`${alias}.id`)} AS id,
  ${Prisma.raw(`${alias}.device_message_id`)} AS deviceMessageId,
  ${Prisma.raw(`${alias}.device_code`)} AS deviceCode,
  ${Prisma.raw(`${alias}.sender`)} AS address,
  ${Prisma.raw(`${alias}.contact_name`)} AS contactName,
  ${Prisma.raw(`${alias}.contact_email`)} AS contactEmail,
  ${Prisma.raw(`${alias}.direction`)} AS direction,
  ${Prisma.raw(`${alias}.body`)} AS body,
  ${Prisma.raw(`${alias}.message_at`)} AS messageAt,
  ${Prisma.raw(`${alias}.received_at`)} AS syncedAt
`;

const getUniqueMessageWhere = (message) => {
  if (!message.deviceCode || !message.deviceMessageId) {
    return null;
  }

  return {
    deviceCode_deviceMessageId: {
      deviceCode: message.deviceCode,
      deviceMessageId: message.deviceMessageId
    }
  };
};

const getMessageIdentityKey = (message) => {
  if (!message.deviceCode || !message.deviceMessageId) {
    return null;
  }

  return `${message.deviceCode}:${message.deviceMessageId}`;
};

const findExistingIdentityKeys = async (messages) => {
  const keyedMessages = messages.filter((message) => getMessageIdentityKey(message));

  if (keyedMessages.length === 0) {
    return new Set();
  }

  const existing = await prisma.message.findMany({
    where: {
      OR: keyedMessages.map((message) => ({
        deviceCode: message.deviceCode,
        deviceMessageId: message.deviceMessageId
      }))
    },
    select: {
      deviceCode: true,
      deviceMessageId: true
    }
  });

  return new Set(existing.map(getMessageIdentityKey));
};

const findDeletedIdentityKeys = async (messages) => {
  const keys = Array.from(new Set(messages.map(getMessageIdentityKey).filter(Boolean)));

  if (keys.length === 0) {
    return new Set();
  }

  const rows = await prisma.$queryRaw`
    SELECT CONCAT(device_code, ':', device_message_id) AS identityKey
    FROM deleted_messages
    WHERE CONCAT(device_code, ':', device_message_id) IN (${Prisma.join(keys)})
  `;

  return new Set(rows.map((row) => row.identityKey));
};

const tombstoneMessages = async (messages) => {
  const rows = messages.filter((message) => message.deviceCode && message.deviceMessageId);

  if (rows.length === 0) {
    return;
  }

  for (let index = 0; index < rows.length; index += 500) {
    const batch = rows.slice(index, index + 500);

    await prisma.$executeRaw`
      INSERT INTO deleted_messages (device_code, device_message_id, address)
      VALUES ${Prisma.join(batch.map((message) => Prisma.sql`(${message.deviceCode}, ${message.deviceMessageId}, ${message.address})`))}
      ON DUPLICATE KEY UPDATE
        address = VALUES(address),
        deleted_at = CURRENT_TIMESTAMP(0)
    `;
  }
};

const findUnreadCounts = async ({ deviceCode, sessionId }) => {
  if (!deviceCode || !sessionId) {
    return new Map();
  }

  const rows = await prisma.$queryRaw`
    SELECT
      grouped.conversationAddress AS address,
      COUNT(*) AS unreadCount
    FROM (
      SELECT
        m.device_code,
        m.direction,
        m.message_at,
        ${conversationAddressSql('m')} AS conversationAddress
      FROM messages m
      WHERE m.device_code = ${deviceCode}
    ) grouped
    LEFT JOIN web_read_states r
      ON r.device_code = grouped.device_code
      AND r.session_id = ${sessionId}
      AND r.address = grouped.conversationAddress
    WHERE grouped.direction = 'received'
      AND (r.last_read_at IS NULL OR grouped.message_at > r.last_read_at)
    GROUP BY grouped.conversationAddress
  `;

  return new Map(rows.map((row) => [row.address, Number(row.unreadCount)]));
};

const findLastReadAt = async ({ deviceCode, sessionId, address }) => {
  const conversationAddress = normalizeConversationAddress(address);

  if (!deviceCode || !sessionId || !conversationAddress) {
    return null;
  }

  const rows = await prisma.$queryRaw`
    SELECT last_read_at AS lastReadAt
    FROM web_read_states
    WHERE device_code = ${deviceCode}
      AND session_id = ${sessionId}
      AND address = ${conversationAddress}
    LIMIT 1
  `;

  return rows[0]?.lastReadAt || null;
};

const markConversationRead = async ({ deviceCode, sessionId, address }) => {
  const conversationAddress = normalizeConversationAddress(address);

  if (!deviceCode || !sessionId || !conversationAddress) {
    return;
  }

  await prisma.$executeRaw`
    INSERT INTO web_read_states (device_code, session_id, address, last_read_at)
    SELECT ${deviceCode}, ${sessionId}, ${conversationAddress}, COALESCE(MAX(m.message_at), CURRENT_TIMESTAMP(0))
    FROM messages m
    WHERE m.device_code = ${deviceCode}
      AND ${conversationAddressSql('m')} = ${conversationAddress}
    ON DUPLICATE KEY UPDATE
      last_read_at = VALUES(last_read_at),
      updated_at = CURRENT_TIMESTAMP(0)
  `;
};

const messageExists = async (message) => {
  const uniqueWhere = getUniqueMessageWhere(message);

  if (!uniqueWhere) {
    return false;
  }

  const existing = await prisma.message.findUnique({
    where: uniqueWhere,
    select: {
      id: true
    }
  });

  return Boolean(existing);
};

const createMessage = async (message) => {
  const deletedKeys = await findDeletedIdentityKeys([message]);

  if (deletedKeys.has(getMessageIdentityKey(message))) {
    return null;
  }

  const uniqueWhere = getUniqueMessageWhere(message);

  if (uniqueWhere) {
    return prisma.message.upsert({
      where: uniqueWhere,
      update: {
        deviceCode: message.deviceCode,
        address: message.address,
        contactName: message.contactName,
        contactEmail: message.contactEmail,
        direction: message.direction,
        body: message.body,
        messageAt: message.messageAt
      },
      create: message
    });
  }

  return prisma.message.create({
    data: {
      deviceCode: message.deviceCode,
      address: message.address,
      contactName: message.contactName,
      contactEmail: message.contactEmail,
      direction: message.direction,
      body: message.body,
      messageAt: message.messageAt
    }
  });
};

const createMessages = async (messages) => {
  if (messages.length === 0) {
    return { count: 0 };
  }

  const dedupedMessages = Array.from(messages.reduce((map, message) => {
    const key = message.deviceCode && message.deviceMessageId
      ? `${message.deviceCode}:${message.deviceMessageId}`
      : `${message.address}:${message.direction}:${message.messageAt.toISOString()}:${message.body}`;

    map.set(key, message);
    return map;
  }, new Map()).values());

  const deletedKeys = await findDeletedIdentityKeys(dedupedMessages);
  const syncableMessages = dedupedMessages.filter((message) => {
    const key = getMessageIdentityKey(message);

    return !key || !deletedKeys.has(key);
  });

  if (syncableMessages.length === 0) {
    return {
      count: 0,
      createdMessages: [],
      skippedDeleted: dedupedMessages.length
    };
  }

  const existingKeys = await findExistingIdentityKeys(syncableMessages);
  const operations = syncableMessages.map((message) => {
    const uniqueWhere = getUniqueMessageWhere(message);

    if (uniqueWhere) {
      return prisma.message.upsert({
        where: uniqueWhere,
        update: {
          deviceCode: message.deviceCode,
          address: message.address,
          contactName: message.contactName,
          contactEmail: message.contactEmail,
          direction: message.direction,
          body: message.body,
          messageAt: message.messageAt
        },
        create: message
      });
    }

    return prisma.message.create({
      data: message
    });
  });

  await prisma.$transaction(operations);

  return {
    count: syncableMessages.length,
    createdMessages: syncableMessages.filter((message) => {
      const key = getMessageIdentityKey(message);

      return !key || !existingKeys.has(key);
    }),
    skippedDeleted: dedupedMessages.length - syncableMessages.length
  };
};

const parseMessageId = (id) => {
  try {
    return BigInt(id);
  } catch (err) {
    return null;
  }
};

const deleteMessageById = async ({ id, deviceCode }) => {
  const messageId = parseMessageId(id);

  if (!messageId) {
    return { count: 0 };
  }

  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      ...(deviceCode ? { deviceCode } : {})
    },
    select: {
      id: true,
      deviceCode: true,
      deviceMessageId: true,
      address: true
    }
  });

  if (!message) {
    return { count: 0 };
  }

  await tombstoneMessages([message]);

  return prisma.message.deleteMany({
    where: {
      id: messageId,
      ...(deviceCode ? { deviceCode } : {})
    }
  });
};

const deleteMessagesByIds = async ({ ids, deviceCode }) => {
  const messageIds = Array.from(new Set((ids || []).map(parseMessageId).filter(Boolean)));

  if (messageIds.length === 0) {
    return { count: 0 };
  }

  const messages = await prisma.message.findMany({
    where: {
      id: {
        in: messageIds
      },
      ...(deviceCode ? { deviceCode } : {})
    },
    select: {
      id: true,
      deviceCode: true,
      deviceMessageId: true,
      address: true
    }
  });

  await tombstoneMessages(messages);

  if (messages.length === 0) {
    return { count: 0 };
  }

  return prisma.message.deleteMany({
    where: {
      id: {
        in: messages.map((message) => message.id)
      },
      ...(deviceCode ? { deviceCode } : {})
    }
  });
};

const deleteConversationByAddress = async ({ address, deviceCode }) => {
  const conversationAddress = normalizeConversationAddress(address);

  const messages = await prisma.$queryRaw`
    SELECT
      m.device_code AS deviceCode,
      m.device_message_id AS deviceMessageId,
      m.sender AS address
    FROM messages m
    WHERE ${conversationAddressSql('m')} = ${conversationAddress}
      ${deviceWhereSql(deviceCode, 'm')}
  `;

  await tombstoneMessages(messages);

  const count = await prisma.$executeRaw`
    DELETE m FROM messages m
    WHERE ${conversationAddressSql('m')} = ${conversationAddress}
      ${deviceWhereSql(deviceCode, 'm')}
  `;

  return { count };
};

const findConversationSummaries = async ({ deviceCode, sessionId } = {}) => {
  const where = deviceCode ? { deviceCode } : {};
  const [totalMessages, lastSync, groupedConversations] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.aggregate({
      where,
      _max: {
        syncedAt: true
      }
    }),
    prisma.$queryRaw`
      SELECT
        grouped.conversationAddress AS address,
        COUNT(*) AS messageCount,
        SUM(CASE WHEN grouped.direction = 'sent' THEN 1 ELSE 0 END) AS sentCount,
        SUM(CASE WHEN grouped.direction = 'sent' THEN 0 ELSE 1 END) AS receivedCount,
        MAX(grouped.message_at) AS latestMessageAt
      FROM (
        SELECT
          m.direction,
          m.message_at,
          ${conversationAddressSql('m')} AS conversationAddress
        FROM messages m
        WHERE 1 = 1
          ${deviceWhereSql(deviceCode, 'm')}
      ) grouped
      GROUP BY grouped.conversationAddress
    `
  ]);

  const unreadCounts = await findUnreadCounts({ deviceCode, sessionId });

  const conversations = await Promise.all(groupedConversations.map(async (conversation) => {
    const latestRows = await prisma.$queryRaw`
      SELECT ${selectMessageFieldsSql('m')}
      FROM messages m
      WHERE ${conversationAddressSql('m')} = ${conversation.address}
        ${deviceWhereSql(deviceCode, 'm')}
      ORDER BY m.message_at DESC, m.id DESC
      LIMIT 1
    `;
    const latestMessage = hydrateMessage(latestRows[0]);

    return {
      address: conversation.address,
      displayName: latestMessage?.contactName || conversation.address,
      contactEmail: latestMessage?.contactEmail || null,
      latestMessage,
      unreadCount: unreadCounts.get(conversation.address) || 0,
      messageCount: Number(conversation.messageCount),
      sentCount: Number(conversation.sentCount),
      receivedCount: Number(conversation.receivedCount)
    };
  }));

  conversations.sort((a, b) => {
    return new Date(b.latestMessage.messageAt) - new Date(a.latestMessage.messageAt);
  });

  return {
    conversations,
    totalMessages,
    lastSyncedAt: lastSync._max.syncedAt
  };
};

const findMessagesByAddress = async ({ address, deviceCode, sessionId, limit = 100, beforeMessageAt, beforeId }) => {
  const take = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const conversationAddress = normalizeConversationAddress(address);
  let cursorSql = Prisma.empty;

  if (beforeMessageAt && beforeId) {
    const beforeDate = new Date(beforeMessageAt);

    if (!Number.isNaN(beforeDate.getTime())) {
      try {
        const beforeBigIntId = BigInt(beforeId);

        cursorSql = Prisma.sql`
          AND (
            m.message_at < ${beforeDate}
            OR (m.message_at = ${beforeDate} AND m.id < ${beforeBigIntId})
          )
        `;
      } catch (err) {
        cursorSql = Prisma.empty;
      }
    }
  }

  const rows = await prisma.$queryRaw`
    SELECT ${selectMessageFieldsSql('m')}
    FROM messages m
    WHERE ${conversationAddressSql('m')} = ${conversationAddress}
      ${deviceWhereSql(deviceCode, 'm')}
      ${cursorSql}
    ORDER BY m.message_at DESC, m.id DESC
    LIMIT ${take + 1}
  `;
  const hasMore = rows.length > take;
  const pageRows = rows.slice(0, take);
  const messages = pageRows.map(hydrateMessage).reverse();
  const oldest = pageRows[pageRows.length - 1] || null;
  const lastReadAt = await findLastReadAt({ deviceCode, sessionId, address: conversationAddress });
  const firstUnreadMessage = messages.find((message) => {
    return message.direction === 'received' && (!lastReadAt || message.messageAt > lastReadAt);
  });

  return {
    messages,
    hasMore,
    unreadStartId: firstUnreadMessage ? firstUnreadMessage.id.toString() : null,
    nextCursor: hasMore && oldest
      ? {
        beforeMessageAt: oldest.messageAt.toISOString(),
        beforeId: oldest.id.toString()
      }
      : null
  };
};

const findMessagesSyncedAfter = async ({ deviceCode, after, limit = 10 }) => {
  const afterDate = after ? new Date(after) : null;
  const take = Math.min(Math.max(Number(limit) || 10, 1), 25);
  const where = {
    ...(deviceCode ? { deviceCode } : {})
  };

  if (afterDate && !Number.isNaN(afterDate.getTime())) {
    where.syncedAt = {
      gt: afterDate
    };
  }

  const [messages, latest] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: [
        { syncedAt: 'desc' },
        { id: 'desc' }
      ],
      take
    }),
    prisma.message.aggregate({
      where: deviceCode ? { deviceCode } : {},
      _max: {
        syncedAt: true
      }
    })
  ]);

  return {
    messages: messages.reverse(),
    latestSyncedAt: latest._max.syncedAt
  };
};

module.exports = {
  messageExists,
  createMessage,
  createMessages,
  deleteMessageById,
  deleteMessagesByIds,
  deleteConversationByAddress,
  markConversationRead,
  findConversationSummaries,
  findMessagesByAddress,
  findMessagesSyncedAfter
};
