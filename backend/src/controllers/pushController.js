const pushConfig = require('../config/webPush');
const pushSubscriptionModel = require('../models/pushSubscriptionModel');

const getPublicKey = (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json({
    enabled: pushConfig.enabled,
    publicKey: pushConfig.enabled ? pushConfig.publicKey : null
  });
};

const subscribe = async (req, res, next) => {
  const subscription = req.body?.subscription || req.body || {};
  const endpoint = typeof subscription.endpoint === 'string' ? subscription.endpoint.trim() : '';
  const p256dh = typeof subscription.keys?.p256dh === 'string' ? subscription.keys.p256dh.trim() : '';
  const auth = typeof subscription.keys?.auth === 'string' ? subscription.keys.auth.trim() : '';

  if (!pushConfig.enabled) {
    return res.status(503).json({ error: 'Push notifications are not configured on this server.' });
  }

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'A valid push subscription is required.' });
  }

  try {
    await pushSubscriptionModel.upsertSubscription({
      deviceCode: req.device.code,
      endpoint,
      p256dh,
      auth
    });

    return res.status(201).json({ subscribed: true });
  } catch (err) {
    console.error('Failed to save push subscription:', err);
    return next(err);
  }
};

const unsubscribe = async (req, res, next) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';

  if (!endpoint) {
    return res.status(400).json({ error: 'endpoint is required.' });
  }

  try {
    await pushSubscriptionModel.deleteByEndpoint(endpoint);
    return res.json({ unsubscribed: true });
  } catch (err) {
    console.error('Failed to remove push subscription:', err);
    return next(err);
  }
};

module.exports = {
  getPublicKey,
  subscribe,
  unsubscribe
};
