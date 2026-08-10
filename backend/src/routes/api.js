const express = require('express');
const smsController = require('../controllers/smsController');

const router = express.Router();

router.post('/sms', smsController.storeSms);
router.post('/sms/bulk', smsController.storeSmsBatch);

module.exports = router;
