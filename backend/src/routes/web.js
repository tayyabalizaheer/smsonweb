const express = require('express');
const deviceController = require('../controllers/deviceController');
const smsController = require('../controllers/smsController');

const router = express.Router();

router.get('/pair', deviceController.renderPairStart);
router.post('/pair/code', deviceController.submitPairCode);
router.post('/pair/verify', deviceController.verifyPairChoice);
router.post('/logout', deviceController.logout);
router.get('/', deviceController.requireWebDevice, smsController.renderSmsFeed);

module.exports = router;
