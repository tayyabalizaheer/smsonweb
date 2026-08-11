const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

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
      m.sender AS address,
      COUNT(*) AS unreadCount
    FROM messages m
    LEFT JOIN web_read_states r
      ON r.device_code = m.device_code
      AND r.session_id = ${sessionId}
      AND r.address = m.sender
    WHERE m.device_code = ${deviceCode}
      AND m.direction = 'received'
      AND (r.last_read_at IS NULL OR m.message_at > r.last_read_at)
    GROUP BY m.sender
  `;

  return new Map(rows.map((row) => [row.address, Number(row.unreadCount)]));
};

const findLastReadAt = async ({ deviceCode, sessionId, address }) => {
  if (!deviceCode || !sessionId || !address) {
    return null;
  }

  const rows = await prisma.$queryRaw`
    SELECT last_read_at AS lastReadAt
    FROM web_read_states
    WHERE device_code = ${deviceCode}
      AND session_id = ${sessionId}
      AND address = ${address}
    LIMIT 1
  `;

  return rows[0]?.lastReadAt || null;
};

const markConversationRead = async ({ deviceCode, sessionId, address }) => {
  if (!deviceCode || !sessionId || !address) {
    return;
  }

  await prisma.$executeRaw`
    INSERT INTO web_read_states (device_code, session_id, address, last_read_at)
    SELECT ${deviceCode}, ${sessionId}, ${address}, COALESCE(MAX(message_at), CURRENT_TIMESTAMP(0))
    FROM messages
    WHERE device_code = ${deviceCode}
      AND sender = ${address}
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

const deleteConversationByAddress = async ({ address, deviceCode }) => {
  const where = {
    address,
    ...(deviceCode ? { deviceCode } : {})
  };
  const messages = await prisma.message.findMany({
    where,
    select: {
      deviceCode: true,
      deviceMessageId: true,
      address: true
    }
  });

  await tombstoneMessages(messages);

  return prisma.message.deleteMany({
    where
  });
};

const findConversationSummaries = async ({ deviceCode, sessionId } = {}) => {
  const where = deviceCode ? { deviceCode } : {};
  const [totalMessages, lastSync, groupedConversations, groupedDirections] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.aggregate({
      where,
      _max: {
        syncedAt: true
      }
    }),
    prisma.message.groupBy({
      by: ['address'],
      where,
      _count: {
        _all: true
      },
      _max: {
        messageAt: true
      }
    }),
    prisma.message.groupBy({
      by: ['address', 'direction'],
      where,
      _count: {
        _all: true
      }
    })
  ]);

  const directionCounts = new Map();
  const unreadCounts = await findUnreadCounts({ deviceCode, sessionId });

  for (const item of groupedDirections) {
    const counts = directionCounts.get(item.address) || { sent: 0, received: 0 };

    if (item.direction === 'sent') {
      counts.sent = item._count._all;
    } else {
      counts.received += item._count._all;
    }

    directionCounts.set(item.address, counts);
  }

  const conversations = await Promise.all(groupedConversations.map(async (conversation) => {
    const latestMessage = await prisma.message.findFirst({
      where: {
        address: conversation.address,
        ...(deviceCode ? { deviceCode } : {})
      },
      orderBy: [
        { messageAt: 'desc' },
        { id: 'desc' }
      ]
    });
    const counts = directionCounts.get(conversation.address) || { sent: 0, received: 0 };

    return {
      address: conversation.address,
      displayName: latestMessage?.contactName || conversation.address,
      contactEmail: latestMessage?.contactEmail || null,
      latestMessage,
      unreadCount: unreadCounts.get(conversation.address) || 0,
      messageCount: conversation._count._all,
      sentCount: counts.sent,
      receivedCount: counts.received
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
  const where = {
    address,
    ...(deviceCode ? { deviceCode } : {})
  };

  if (beforeMessageAt && beforeId) {
    const beforeDate = new Date(beforeMessageAt);

    if (!Number.isNaN(beforeDate.getTime())) {
      try {
        where.OR = [
          {
            messageAt: {
              lt: beforeDate
            }
          },
          {
            messageAt: beforeDate,
            id: {
              lt: BigInt(beforeId)
            }
          }
        ];
      } catch (err) {
        delete where.OR;
      }
    }
  }

  const rows = await prisma.message.findMany({
    where,
    orderBy: [
      { messageAt: 'desc' },
      { id: 'desc' }
    ],
    take: take + 1
  });
  const hasMore = rows.length > take;
  const pageRows = rows.slice(0, take);
  const messages = pageRows.reverse();
  const oldest = pageRows[pageRows.length - 1] || null;
  const lastReadAt = await findLastReadAt({ deviceCode, sessionId, address });
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
  deleteConversationByAddress,
  markConversationRead,
  findConversationSummaries,
  findMessagesByAddress,
  findMessagesSyncedAfter
};
