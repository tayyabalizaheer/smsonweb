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

const findAllMessages = async () => {
  return prisma.message.findMany({
    orderBy: [
      { messageAt: 'desc' },
      { id: 'desc' }
    ]
  });
};

module.exports = {
  createMessage,
  createMessages,
  findAllMessages
};
