const express = require('express');
const pool = require('../config/db');

const router = express.Router();

const MAX_SENDER_LENGTH = 64;
const MAX_BODY_LENGTH = 65535;

const normalizeSmsPayload = (payload) => {
  const sender = typeof payload.sender === 'string' ? payload.sender.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body : '';

  if (!sender) {
    return { error: 'sender is required.' };
  }

  if (!body.trim()) {
    return { error: 'body is required.' };
  }

  if (sender.length > MAX_SENDER_LENGTH) {
    return { error: `sender must be ${MAX_SENDER_LENGTH} characters or fewer.` };
  }

  if (body.length > MAX_BODY_LENGTH) {
    return { error: `body must be ${MAX_BODY_LENGTH} characters or fewer.` };
  }

  return { value: { sender, body } };
};

router.post('/sms', async (req, res, next) => {
  const { value, error } = normalizeSmsPayload(req.body || {});

  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO messages (sender, body) VALUES (:sender, :body)',
      value
    );

    return res.status(201).json({
      id: result.insertId,
      sender: value.sender,
      received: true
    });
  } catch (err) {
    console.error('Failed to insert SMS message:', err);
    return next(err);
  }
});

module.exports = router;
