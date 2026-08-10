const express = require('express');
const deviceController = require('../controllers/deviceController');
const smsController = require('../controllers/smsController');
const versionController = require('../controllers/versionController');

const router = express.Router();

router.get('/version', versionController.getVersion);
router.post('/sms', smsController.storeSms);
router.post('/sms/bulk', smsController.storeSmsBatch);
router.post('/devices/register', deviceController.registerDevice);
router.get('/devices/pairing-challenge', deviceController.getPairingChallenge);
router.post('/devices/health', deviceController.healthPing);
router.get('/devices/sessions', deviceController.listSessions);
router.post('/devices/sessions/unpair', deviceController.unpairSessionSlot);
router.get('/device/status', deviceController.requireWebDevice, deviceController.webDeviceStatus);
router.get('/conversations', deviceController.requireWebDevice, smsController.listConversations);
router.get('/messages', deviceController.requireWebDevice, smsController.listMessages);
router.get('/messages/notifications', deviceController.requireWebDevice, smsController.listMessageNotifications);

module.exports = router;
