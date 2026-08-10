const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const createStartupVersionToken = (length = 8) => {
  let token = '';

  for (let index = 0; index < length; index += 1) {
    token += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }

  return token;
};

const startupVersionToken = createStartupVersionToken();

const getPackageVersion = () => {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    return String(packageJson.version || '1.0.0').trim();
  } catch (err) {
    return '1.0.0';
  }
};

const getAppVersion = () => {
  return `${getPackageVersion()}-${startupVersionToken}`;
};

module.exports = {
  getAppVersion,
  getPackageVersion
};
