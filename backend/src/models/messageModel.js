const prisma = require('../config/prisma');

const createMessage = async (message) => {
  if (message.deviceMessageId) {
    return prisma.message.upsert({
      where: {
        deviceMessageId: message.deviceMessageId
      },
      update: {
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

  return prisma.message.createMany({
    data: messages,
    skipDuplicates: true
  });
};

const findConversationSummaries = async () => {
  const [totalMessages, lastSync, groupedConversations, groupedDirections] = await Promise.all([
    prisma.message.count(),
    prisma.message.aggregate({
      _max: {
        syncedAt: true
      }
    }),
    prisma.message.groupBy({
      by: ['address'],
      _count: {
        _all: true
      },
      _max: {
        messageAt: true
      }
    }),
    prisma.message.groupBy({
      by: ['address', 'direction'],
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
        address: conversation.address
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

const findMessagesByAddress = async ({ address, limit = 100, beforeMessageAt, beforeId }) => {
  const take = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const where = {
    address
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

module.exports = {
  createMessage,
  createMessages,
  findConversationSummaries,
  findMessagesByAddress
};
