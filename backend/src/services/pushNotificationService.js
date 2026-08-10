const pushConfig = require('../config/webPush');
const pushSubscriptionModel = require('../models/pushSubscriptionModel');

const RECENT_MESSAGE_WINDOW_MS = 15 * 60 * 1000;

const isRecentIncomingMessage = (message) => {
  if (!message || message.direction === 'sent') {
    return false;
  }

  const messageAt = new Date(message.messageAt).getTime();

  return Number.isFinite(messageAt) && Date.now() - messageAt <= RECENT_MESSAGE_WINDOW_MS;
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

const getTitle = (messages) => {
  if (messages.length > 1) {
    return `${messages.length} new SMS messages`;
  }

  const message = messages[0];
  return `New SMS from ${message.contactName || message.address || 'Unknown'}`;
};

const notifyNewMessages = async ({ deviceCode, messages }) => {
  if (!pushConfig.enabled || !deviceCode || !Array.isArray(messages)) {
    return;
  }

  const incomingMessages = messages.filter(isRecentIncomingMessage);

  if (incomingMessages.length === 0) {
    return;
  }

  const latest = incomingMessages[incomingMessages.length - 1];
  const subscriptions = await pushSubscriptionModel.findByDeviceCode(deviceCode);
  const payload = JSON.stringify({
    title: getTitle(incomingMessages),
    body: latest.body,
    url: latest.address ? `/?address=${encodeURIComponent(latest.address)}&refresh=1` : '/?refresh=1',
    tag: latest.address || 'sms-sync-message'
  });

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await pushConfig.webPush.sendNotification(serializeSubscription(subscription), payload);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await pushSubscriptionModel.deleteByEndpoint(subscription.endpoint);
        return;
      }

      console.error('Failed to send push notification:', err);
    }
  }));
};

module.exports = {
  notifyNewMessages
};
