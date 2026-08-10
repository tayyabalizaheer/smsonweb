const messageModel = require('../models/messageModel');

const MAX_ADDRESS_LENGTH = 64;
const MAX_BODY_LENGTH = 65535;
const MAX_DEVICE_MESSAGE_ID_LENGTH = 128;
const MAX_CONTACT_NAME_LENGTH = 160;
const MAX_CONTACT_EMAIL_LENGTH = 254;
const VALID_DIRECTIONS = new Set(['received', 'sent']);

const normalizeSmsPayload = (payload) => {
  const address = typeof payload.address === 'string'
    ? payload.address.trim()
    : (typeof payload.sender === 'string' ? payload.sender.trim() : '');
  const body = typeof payload.body === 'string' ? payload.body : '';
  const direction = typeof payload.direction === 'string'
    ? payload.direction.trim().toLowerCase()
    : 'received';
  const deviceMessageId = typeof payload.deviceMessageId === 'string'
    ? payload.deviceMessageId.trim()
    : null;
  const contactName = typeof payload.contactName === 'string'
    ? payload.contactName.trim()
    : null;
  const contactEmail = typeof payload.contactEmail === 'string'
    ? payload.contactEmail.trim()
    : null;
  const rawMessageAt = payload.messageAt || payload.receivedAt || payload.timestamp;
  const messageAt = rawMessageAt ? new Date(rawMessageAt) : new Date();

  if (!address) {
    return { error: 'address is required.' };
  }

  if (!body.trim()) {
    return { error: 'body is required.' };
  }

  if (address.length > MAX_ADDRESS_LENGTH) {
    return { error: `address must be ${MAX_ADDRESS_LENGTH} characters or fewer.` };
  }

  if (body.length > MAX_BODY_LENGTH) {
    return { error: `body must be ${MAX_BODY_LENGTH} characters or fewer.` };
  }

  if (!VALID_DIRECTIONS.has(direction)) {
    return { error: 'direction must be either received or sent.' };
  }

  if (deviceMessageId && deviceMessageId.length > MAX_DEVICE_MESSAGE_ID_LENGTH) {
    return { error: `deviceMessageId must be ${MAX_DEVICE_MESSAGE_ID_LENGTH} characters or fewer.` };
  }

  if (contactName && contactName.length > MAX_CONTACT_NAME_LENGTH) {
    return { error: `contactName must be ${MAX_CONTACT_NAME_LENGTH} characters or fewer.` };
  }

  if (contactEmail && contactEmail.length > MAX_CONTACT_EMAIL_LENGTH) {
    return { error: `contactEmail must be ${MAX_CONTACT_EMAIL_LENGTH} characters or fewer.` };
  }

  if (Number.isNaN(messageAt.getTime())) {
    return { error: 'messageAt must be a valid date.' };
  }

  return {
    value: {
      deviceMessageId,
      address,
      contactName,
      contactEmail,
      direction,
      body,
      messageAt
    }
  };
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
      address: message.address,
      received: true
    });
  } catch (err) {
    console.error('Failed to store SMS message:', err);
    return next(err);
  }
};

const storeSmsBatch = async (req, res, next) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;

  if (!messages) {
    return res.status(400).json({ error: 'messages must be an array.' });
  }

  if (messages.length > 500) {
    return res.status(400).json({ error: 'messages cannot contain more than 500 items.' });
  }

  const normalized = [];

  for (const [index, message] of messages.entries()) {
    const { value, error } = normalizeSmsPayload(message || {});

    if (error) {
      return res.status(400).json({ error: `messages[${index}]: ${error}` });
    }

    normalized.push(value);
  }

  try {
    const result = await messageModel.createMessages(normalized);

    return res.status(201).json({
      received: true,
      inserted: result.count,
      submitted: normalized.length
    });
  } catch (err) {
    console.error('Failed to store SMS batch:', err);
    return next(err);
  }
};

const renderSmsFeed = async (req, res, next) => {
  try {
    const messages = await messageModel.findAllMessages();
    const conversationsByAddress = new Map();

    for (const message of messages) {
      const conversation = conversationsByAddress.get(message.address) || {
        address: message.address,
        displayName: message.contactName || message.address,
        contactEmail: message.contactEmail,
        messages: [],
        latestMessage: message,
        sentCount: 0,
        receivedCount: 0
      };

      conversation.messages.push(message);

      if (message.direction === 'sent') {
        conversation.sentCount += 1;
      } else {
        conversation.receivedCount += 1;
      }

      conversationsByAddress.set(message.address, conversation);
    }

    const conversations = Array.from(conversationsByAddress.values())
      .sort((a, b) => b.latestMessage.messageAt - a.latestMessage.messageAt);
    const hasExplicitSelection = typeof req.query.address === 'string' && req.query.address.trim() !== '';
    const selectedAddress = hasExplicitSelection ? req.query.address : conversations[0]?.address;
    const selectedConversation = conversations.find((conversation) => {
      return conversation.address === selectedAddress;
    }) || conversations[0] || null;
    const selectedMessages = selectedConversation
      ? [...selectedConversation.messages].sort((a, b) => a.messageAt - b.messageAt)
      : [];
    const lastSyncedAt = messages.reduce((latest, message) => {
      if (!latest || message.syncedAt > latest) {
        return message.syncedAt;
      }

      return latest;
    }, null);

    return res.render('index', {
      title: 'SMS Messenger',
      conversations,
      selectedConversation,
      selectedMessages,
      hasExplicitSelection,
      totalMessages: messages.length,
      lastSyncedAt
    });
  } catch (err) {
    console.error('Failed to load SMS feed:', err);
    return next(err);
  }
};

module.exports = {
  storeSms,
  storeSmsBatch,
  renderSmsFeed
};
