const messageModel = require('../models/messageModel');

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

const storeSms = async (req, res, next) => {
  const { value, error } = normalizeSmsPayload(req.body || {});

  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const message = await messageModel.createMessage(value);

    return res.status(201).json({
      id: message.id.toString(),
      sender: message.sender,
      received: true
    });
  } catch (err) {
    console.error('Failed to store SMS message:', err);
    return next(err);
  }
};

const renderSmsFeed = async (req, res, next) => {
  try {
    const messages = await messageModel.findAllMessages();

    return res.render('index', {
      title: 'SMS Feed',
      messages
    });
  } catch (err) {
    console.error('Failed to load SMS feed:', err);
    return next(err);
  }
};

module.exports = {
  storeSms,
  renderSmsFeed
};
