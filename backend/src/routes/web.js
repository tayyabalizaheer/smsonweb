const express = require('express');
const pool = require('../config/db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [messages] = await pool.query(
      'SELECT id, sender, body, received_at FROM messages ORDER BY received_at DESC, id DESC'
    );

    return res.render('index', {
      title: 'SMS Feed',
      messages
    });
  } catch (err) {
    console.error('Failed to load SMS feed:', err);
    return next(err);
  }
});

module.exports = router;
