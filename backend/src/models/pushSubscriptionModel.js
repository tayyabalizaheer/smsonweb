const prisma = require('../config/prisma');

const upsertSubscription = async ({ deviceCode, endpoint, p256dh, auth }) => {
  await prisma.$executeRaw`
    INSERT INTO push_subscriptions (device_code, endpoint, p256dh, auth)
    VALUES (${deviceCode}, ${endpoint}, ${p256dh}, ${auth})
    ON DUPLICATE KEY UPDATE
      device_code = VALUES(device_code),
      p256dh = VALUES(p256dh),
      auth = VALUES(auth)
  `;

  return {
    deviceCode,
    endpoint,
    p256dh,
    auth
  };
};

const findByDeviceCode = async (deviceCode) => {
  return prisma.$queryRaw`
    SELECT
      device_code AS deviceCode,
      endpoint,
      p256dh,
      auth
    FROM push_subscriptions
    WHERE device_code = ${deviceCode}
  `;
};

const countByDeviceCode = async (deviceCode) => {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS subscriptionCount
    FROM push_subscriptions
    WHERE device_code = ${deviceCode}
  `;

  return Number(rows[0]?.subscriptionCount || 0);
};

const deleteByEndpoint = async (endpoint) => {
  return prisma.$executeRaw`
    DELETE FROM push_subscriptions
    WHERE endpoint = ${endpoint}
  `;
};

module.exports = {
  upsertSubscription,
  findByDeviceCode,
  countByDeviceCode,
  deleteByEndpoint
};
