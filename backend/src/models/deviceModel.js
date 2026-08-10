const crypto = require('crypto');
const prisma = require('../config/prisma');

const SESSION_COLUMNS = ['sessionId1', 'sessionId2', 'sessionId3', 'sessionId4'];

const serializeSessions = (device) => {
  return SESSION_COLUMNS.map((column, index) => ({
    slot: index + 1,
    paired: Boolean(device[column])
  }));
};

const upsertDevice = async ({ code, name }) => {
  return prisma.device.upsert({
    where: {
      code
    },
    update: {
      name
    },
    create: {
      code,
      name
    }
  });
};

const updatePairingChallenge = async ({ code, pairingOptions, pairingAnswer }) => {
  return prisma.device.update({
    where: {
      code
    },
    data: {
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

const markPing = async (code) => {
  return prisma.device.update({
    where: {
      code
    },
    data: {
      lastPingAt: new Date()
    }
  });
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

const removeSessionSlot = async ({ code, slot }) => {
  const index = Number(slot) - 1;
  const sessionColumn = SESSION_COLUMNS[index];

  if (!sessionColumn) {
    return { error: 'Invalid session slot.' };
  }

  const device = await findByCode(code);

  if (!device) {
    return { error: 'Device not found.' };
  }

  const updatedDevice = await prisma.device.update({
    where: {
      code
    },
    data: {
      [sessionColumn]: null
    }
  });

  return {
    device: updatedDevice,
    sessions: serializeSessions(updatedDevice)
  };
};

module.exports = {
  serializeSessions,
  upsertDevice,
  updatePairingChallenge,
  findByCode,
  findBySessionId,
  createSession,
  markPing,
  removeSession,
  removeSessionSlot
};
