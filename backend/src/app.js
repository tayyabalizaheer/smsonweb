require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const path = require('path');

const { getAppVersion } = require('./config/version');
const apiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: '128kb' }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.locals.appVersion = getAppVersion();
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', apiRoutes);
app.use('/', webRoutes);

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page not found',
    message: 'The requested page could not be found.'
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  const message = status === 500 ? 'Something went wrong.' : err.message;

  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ error: message });
  }

  return res.status(status).render('error', {
    title: status === 500 ? 'Server error' : 'Request error',
    message
  });
});

module.exports = app;
