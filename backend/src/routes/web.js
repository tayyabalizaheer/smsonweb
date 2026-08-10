const express = require('express');
const smsController = require('../controllers/smsController');

const router = express.Router();

router.get('/', smsController.renderSmsFeed);

module.exports = router;
