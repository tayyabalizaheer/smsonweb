const packageJson = require('../../package.json');
const fs = require('fs');
const path = require('path');

const versionedFiles = [
  'public/css/styles.css',
  'public/js/app.js',
  'public/js/pair.js',
  'public/sw.js',
  'public/manifest.webmanifest'
];

const getBuildStamp = () => {
  const newestMtime = versionedFiles.reduce((latest, relativePath) => {
    try {
      const absolutePath = path.join(__dirname, '..', '..', relativePath);
      const mtimeMs = fs.statSync(absolutePath).mtimeMs;

      return Math.max(latest, mtimeMs);
    } catch (err) {
      return latest;
    }
  }, 0);

  return newestMtime ? Math.floor(newestMtime).toString(36) : 'dev';
};

const appVersion = String(
  process.env.APP_VERSION || `${packageJson.version || '1.0.0'}-${getBuildStamp()}`
).trim();

module.exports = {
  appVersion
};
