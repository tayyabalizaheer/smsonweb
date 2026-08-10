const express = require('express');
const deviceController = require('../controllers/deviceController');
const smsController = require('../controllers/smsController');

const router = express.Router();

router.post('/sms', smsController.storeSms);
router.post('/sms/bulk', smsController.storeSmsBatch);
router.post('/devices/register', deviceController.registerDevice);
router.get('/conversations', deviceController.requireWebDevice, smsController.listConversations);
router.get('/messages', deviceController.requireWebDevice, smsController.listMessages);

module.exports = router;
