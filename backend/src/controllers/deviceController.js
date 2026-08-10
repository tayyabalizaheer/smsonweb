const deviceModel = require('../models/deviceModel');

const SESSION_COOKIE = 'sms_session';
const CODE_PATTERN = /^\d{6}$/;
const OFFLINE_AFTER_MS = 2 * 60 * 1000;

const parseCookies = (cookieHeader = '') => {
  return cookieHeader.split(';').reduce((cookies, part) => {
    const [key, ...valueParts] = part.trim().split('=');

    if (!key) {
      return cookies;
    }

    cookies[key] = decodeURIComponent(valueParts.join('='));
    return cookies;
  }, {});
};

const getSessionId = (req) => {
  return parseCookies(req.headers.cookie || '')[SESSION_COOKIE] || '';
};

const setSessionCookie = (res, sessionId) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`
  );
};

const clearSessionCookie = (res) => {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
};

const generatePairingChallenge = () => {
  const options = new Set();

  while (options.size < 3) {
    options.add(String(Math.floor(Math.random() * 900) + 100));
  }

  const pairingOptions = Array.from(options).sort();
  const pairingAnswer = pairingOptions[Math.floor(Math.random() * pairingOptions.length)];

  return {
    pairingOptions,
    pairingAnswer
  };
};

const isDeviceOnline = (device) => {
  if (!device?.lastPingAt) {
    return false;
  }

  return Date.now() - new Date(device.lastPingAt).getTime() <= OFFLINE_AFTER_MS;
};

const serializeDeviceStatus = (device) => {
  return {
    code: device.code,
    name: device.name,
    online: isDeviceOnline(device),
    lastPingAt: device.lastPingAt ? device.lastPingAt.toISOString() : null
  };
};

const requireWebDevice = async (req, res, next) => {
  try {
    const sessionId = getSessionId(req);
    const device = await deviceModel.findBySessionId(sessionId);

    if (!device) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ error: 'Pair this browser with an Android device first.' });
      }

      return res.redirect('/pair');
    }

    req.device = device;
    return next();
  } catch (err) {
    return next(err);
  }
};

const registerDevice = async (req, res, next) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : null;

  if (!CODE_PATTERN.test(code)) {
    return res.status(400).json({ error: 'code must be a 6 digit number.' });
  }

  try {
    await deviceModel.upsertDevice({
      code,
      name
    });

    return res.json({ registered: true });
  } catch (err) {
    console.error('Failed to register device:', err);
    return next(err);
  }
};

const renderPairStart = async (req, res, next) => {
  try {
    const device = await deviceModel.findBySessionId(getSessionId(req));

    if (device) {
      return res.redirect('/');
    }

    return res.render('pair', {
      title: 'Pair Device',
      stage: 'code',
      code: '',
      device: null,
      error: null
    });
  } catch (err) {
    return next(err);
  }
};

const submitPairCode = async (req, res, next) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';

  if (!CODE_PATTERN.test(code)) {
    return res.status(400).render('pair', {
      title: 'Pair Device',
      stage: 'code',
      code,
      device: null,
      error: 'Enter the 6 digit code shown in the Android app.'
    });
  }

  try {
    const device = await deviceModel.findByCode(code);

    if (!device) {
      return res.status(404).render('pair', {
        title: 'Pair Device',
        stage: 'code',
        code,
        device: null,
        error: 'Device not found. Open the Android app once, then try again.'
      });
    }

    const challenge = generatePairingChallenge();
    const updatedDevice = await deviceModel.updatePairingChallenge({
      code,
      pairingOptions: challenge.pairingOptions,
      pairingAnswer: challenge.pairingAnswer
    });

    return res.render('pair', {
      title: 'Pair Device',
      stage: 'verify',
      code,
      device: updatedDevice,
      error: null
    });
  } catch (err) {
    return next(err);
  }
};

const verifyPairChoice = async (req, res, next) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const choice = typeof req.body?.choice === 'string' ? req.body.choice.trim() : '';

  try {
    const device = await deviceModel.findByCode(code);

    if (!device || choice !== device.pairingAnswer) {
      return res.status(400).render('pair', {
        title: 'Pair Device',
        stage: device ? 'verify' : 'code',
        code,
        device,
        error: 'That number did not match the Android app. Try again.'
      });
    }

    const result = await deviceModel.createSession(code);

    if (result.error) {
      return res.status(409).render('pair', {
        title: 'Pair Device',
        stage: 'verify',
        code,
        device,
        error: result.error
      });
    }

    setSessionCookie(res, result.sessionId);
    return res.redirect('/');
  } catch (err) {
    return next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    await deviceModel.removeSession(getSessionId(req));
    clearSessionCookie(res);
    return res.redirect('/pair');
  } catch (err) {
    return next(err);
  }
};

const getPairingChallenge = async (req, res, next) => {
  const code = typeof req.query?.code === 'string' ? req.query.code.trim() : '';

  if (!CODE_PATTERN.test(code)) {
    return res.status(400).json({ error: 'code must be a 6 digit number.' });
  }

  try {
    const device = await deviceModel.findByCode(code);

    if (!device) {
      return res.status(404).json({ error: 'Device not found.' });
    }

    return res.json({
      code: device.code,
      answer: device.pairingAnswer,
      pairingUpdatedAt: device.pairingUpdatedAt ? device.pairingUpdatedAt.toISOString() : null
    });
  } catch (err) {
    console.error('Failed to get pairing challenge:', err);
    return next(err);
  }
};

const healthPing = async (req, res, next) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : null;

  if (!CODE_PATTERN.test(code)) {
    return res.status(400).json({ error: 'code must be a 6 digit number.' });
  }

  try {
    await deviceModel.upsertDevice({ code, name });
    const device = await deviceModel.markPing(code);

    return res.json({
      ok: true,
      device: serializeDeviceStatus(device)
    });
  } catch (err) {
    console.error('Failed to update device health:', err);
    return next(err);
  }
};

const webDeviceStatus = async (req, res) => {
  return res.json({
    device: serializeDeviceStatus(req.device)
  });
};

module.exports = {
  SESSION_COOKIE,
  OFFLINE_AFTER_MS,
  getSessionId,
  requireWebDevice,
  registerDevice,
  getPairingChallenge,
  healthPing,
  webDeviceStatus,
  renderPairStart,
  submitPairCode,
  verifyPairChoice,
  logout
};
