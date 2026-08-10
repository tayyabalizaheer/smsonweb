const express = require('express');
const smsController = require('../controllers/smsController');

const router = express.Router();

router.post('/sms', smsController.storeSms);

module.exports = router;
