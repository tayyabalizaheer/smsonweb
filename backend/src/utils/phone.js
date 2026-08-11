const normalizeConversationAddress = (address) => {
  const raw = String(address || '').trim();

  if (!raw) {
    return '';
  }

  const compact = raw.replace(/[\s().-]/g, '');
  const digits = raw.replace(/\D/g, '');

  if (compact.startsWith('+92') && compact.length > 3) {
    return `0${compact.slice(3).replace(/\D/g, '')}`;
  }

  if (digits.startsWith('0092') && digits.length > 4) {
    return `0${digits.slice(4)}`;
  }

  if (digits.startsWith('92') && digits.length >= 11) {
    return `0${digits.slice(2)}`;
  }

  if (digits.startsWith('0')) {
    return digits;
  }

  return raw.toLowerCase();
};

module.exports = {
  normalizeConversationAddress
};
