const prisma = require('../config/prisma');

const createMessage = async ({ sender, body }) => {
  return prisma.message.create({
    data: {
      sender,
      body
    }
  });
};

const findAllMessages = async () => {
  return prisma.message.findMany({
    orderBy: [
      { receivedAt: 'desc' },
      { id: 'desc' }
    ]
  });
};

module.exports = {
  createMessage,
  findAllMessages
};
