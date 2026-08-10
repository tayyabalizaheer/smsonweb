const crypto = require('crypto');
const prisma = require('../config/prisma');

const SESSION_COLUMNS = ['sessionId1', 'sessionId2', 'sessionId3', 'sessionId4'];

const upsertDevice = async ({ code, name, pairingOptions, pairingAnswer }) => {
  return prisma.device.upsert({
    where: {
      code
    },
    update: {
      name,
      pairingOptions,
      pairingAnswer,
      pairingUpdatedAt: new Date()
    },
    create: {
      code,
      name,
      pairingOptions,
      pairingAnswer,
      pairingUpdatedAt: new Date()
    }
  });
};

const findByCode = async (code) => {
  return prisma.device.findUnique({
    where: {
      code
    }
  });
};

const findBySessionId = async (sessionId) => {
  if (!sessionId) {
    return null;
  }

  return prisma.device.findFirst({
    where: {
      OR: SESSION_COLUMNS.map((column) => ({ [column]: sessionId }))
    }
  });
};

const createSession = async (code) => {
  const device = await findByCode(code);

  if (!device) {
    return { error: 'Device not found.' };
  }

  const availableColumn = SESSION_COLUMNS.find((column) => !device[column]);

  if (!availableColumn) {
    return { error: 'This device already has 4 paired web sessions.' };
  }

  const sessionId = crypto.randomBytes(32).toString('hex');
  const updatedDevice = await prisma.device.update({
    where: {
      code
    },
    data: {
      [availableColumn]: sessionId
    }
  });

  return {
    device: updatedDevice,
    sessionId
  };
};

const removeSession = async (sessionId) => {
  const device = await findBySessionId(sessionId);

  if (!device) {
    return null;
  }

  const sessionColumn = SESSION_COLUMNS.find((column) => device[column] === sessionId);

  if (!sessionColumn) {
    return device;
  }

  return prisma.device.update({
    where: {
      code: device.code
    },
    data: {
      [sessionColumn]: null
    }
  });
};

module.exports = {
  upsertDevice,
  findByCode,
  findBySessionId,
  createSession,
  removeSession
};
