const { appVersion } = require('../config/version');

const getVersion = (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({
    version: appVersion
  });
};

module.exports = {
  getVersion
};
