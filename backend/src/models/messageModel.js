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

const createMessage = async (message) => {
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

  const operations = dedupedMessages.map((message) => {
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

  return { count: dedupedMessages.length };
};

const findConversationSummaries = async ({ deviceCode } = {}) => {
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

const findMessagesByAddress = async ({ address, deviceCode, limit = 100, beforeMessageAt, beforeId }) => {
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
  const oldest = pageRows[pageRows.length - 1] || null;

  return {
    messages: pageRows.reverse(),
    hasMore,
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
  createMessage,
  createMessages,
  findConversationSummaries,
  findMessagesByAddress,
  findMessagesSyncedAfter
};
