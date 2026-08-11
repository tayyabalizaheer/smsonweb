const pushConfig = require('../config/webPush');
const pushSubscriptionModel = require('../models/pushSubscriptionModel');
const { normalizeConversationAddress } = require('../utils/phone');

const isIncomingMessage = (message) => {
  return Boolean(message && message.direction !== 'sent');
};

const serializeSubscription = (subscription) => {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth
    }
  };
};

const truncateBody = (value, maxLength = 180) => {
  const body = String(value || '');

  return body.length > maxLength ? `${body.slice(0, maxLength - 1)}...` : body;
};

const sendPayloadToDevice = async ({ deviceCode, payload }) => {
  if (!pushConfig.enabled || !deviceCode) {
    return {
      sent: 0,
      failed: 0,
      configured: pushConfig.enabled
    };
  }

  const subscriptions = await pushSubscriptionModel.findByDeviceCode(deviceCode);
  let sent = 0;
  let failed = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await pushConfig.webPush.sendNotification(serializeSubscription(subscription), JSON.stringify(payload), {
        TTL: 60 * 60 * 24,
        urgency: 'high'
      });
      sent += 1;
    } catch (err) {
      failed += 1;

      if (err.statusCode === 404 || err.statusCode === 410) {
        await pushSubscriptionModel.deleteByEndpoint(subscription.endpoint);
        return;
      }

      console.error('Failed to send push notification:', err);
    }
  }));

  return {
    sent,
    failed,
    configured: pushConfig.enabled
  };
};

const getTitle = (messages) => {
  const message = messages[messages.length - 1] || {};

  return message.contactName || message.address || 'Unknown';
};

const notifyNewMessages = async ({ deviceCode, messages }) => {
  if (!pushConfig.enabled || !deviceCode || !Array.isArray(messages)) {
    return;
  }

  const incomingMessages = messages.filter(isIncomingMessage);

  if (incomingMessages.length === 0) {
    return;
  }

  const latest = incomingMessages[incomingMessages.length - 1];
  const conversationAddress = normalizeConversationAddress(latest.address);
  const payload = {
    title: getTitle(incomingMessages),
    body: truncateBody(latest.body),
    url: conversationAddress ? `/?address=${encodeURIComponent(conversationAddress)}&refresh=1` : '/?refresh=1',
    tag: conversationAddress || latest.address || 'sms-sync-message'
  };

  await sendPayloadToDevice({ deviceCode, payload });
};

const sendTestNotification = async (deviceCode) => {
  return sendPayloadToDevice({
    deviceCode,
    payload: {
      title: 'SMS Sync test notification',
      body: 'Background push is configured for this browser.',
      url: '/?refresh=1',
      tag: 'sms-sync-test'
    }
  });
};

module.exports = {
  notifyNewMessages,
  sendTestNotification
};
