const webPush = require('web-push');

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@sms.engrtayyabali.com';
const enabled = Boolean(publicKey && privateKey);

if (enabled) {
  webPush.setVapidDetails(subject, publicKey, privateKey);
}

module.exports = {
  enabled,
  publicKey,
  webPush
};
