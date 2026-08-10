const deviceModel = require('../models/deviceModel');

const SESSION_COOKIE = 'sms_session';
const CODE_PATTERN = /^\d{6}$/;
const OPTION_PATTERN = /^\d{3}$/;

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

const normalizeOptions = (options) => {
  if (!Array.isArray(options) || options.length !== 3) {
    return null;
  }

  const normalized = options.map((option) => String(option).trim());

  if (!normalized.every((option) => OPTION_PATTERN.test(option))) {
    return null;
  }

  if (new Set(normalized).size !== normalized.length) {
    return null;
  }

  return normalized;
};

const requireWebDevice = async (req, res, next) => {
  try {
    const sessionId = getSessionId(req);
    const device = await deviceModel.findBySessionId(sessionId);

    if (!device) {
      if (req.path.startsWith('/api/')) {
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
  const pairingOptions = normalizeOptions(req.body?.pairingOptions);
  const pairingAnswer = typeof req.body?.pairingAnswer === 'string'
    ? req.body.pairingAnswer.trim()
    : '';

  if (!CODE_PATTERN.test(code)) {
    return res.status(400).json({ error: 'code must be a 6 digit number.' });
  }

  if (!pairingOptions) {
    return res.status(400).json({ error: 'pairingOptions must contain 3 unique three digit numbers.' });
  }

  if (!pairingOptions.includes(pairingAnswer)) {
    return res.status(400).json({ error: 'pairingAnswer must be one of the pairingOptions.' });
  }

  try {
    await deviceModel.upsertDevice({
      code,
      name,
      pairingOptions,
      pairingAnswer
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

    if (!device || !Array.isArray(device.pairingOptions)) {
      return res.status(404).render('pair', {
        title: 'Pair Device',
        stage: 'code',
        code,
        device: null,
        error: 'Device not found. Open the Android app once, then try again.'
      });
    }

    return res.render('pair', {
      title: 'Pair Device',
      stage: 'verify',
      code,
      device,
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

module.exports = {
  SESSION_COOKIE,
  getSessionId,
  requireWebDevice,
  registerDevice,
  renderPairStart,
  submitPairCode,
  verifyPairChoice,
  logout
};
