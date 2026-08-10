const express = require('express');
const smsController = require('../controllers/smsController');

const router = express.Router();

router.post('/sms', smsController.storeSms);
router.post('/sms/bulk', smsController.storeSmsBatch);
router.get('/conversations', smsController.listConversations);
router.get('/messages', smsController.listMessages);

module.exports = router;
