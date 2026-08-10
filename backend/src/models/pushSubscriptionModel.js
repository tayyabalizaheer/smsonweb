const prisma = require('../config/prisma');

const upsertSubscription = async ({ deviceCode, endpoint, p256dh, auth }) => {
  return prisma.pushSubscription.upsert({
    where: {
      endpoint
    },
    update: {
      deviceCode,
      p256dh,
      auth
    },
    create: {
      deviceCode,
      endpoint,
      p256dh,
      auth
    }
  });
};

const findByDeviceCode = async (deviceCode) => {
  return prisma.pushSubscription.findMany({
    where: {
      deviceCode
    }
  });
};

const deleteByEndpoint = async (endpoint) => {
  return prisma.pushSubscription.deleteMany({
    where: {
      endpoint
    }
  });
};

module.exports = {
  upsertSubscription,
  findByDeviceCode,
  deleteByEndpoint
};
