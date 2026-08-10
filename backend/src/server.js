const app = require('./app');
const prisma = require('./config/prisma');

const port = Number(process.env.PORT || 3000);

const server = app.listen(port, () => {
  console.log(`SMS sync server listening on http://localhost:${port}`);
});

const shutdown = async (signal) => {
  console.log(`${signal} received. Closing server...`);

  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('Prisma client disconnected.');
      process.exit(0);
    } catch (err) {
      console.error('Failed to disconnect Prisma client:', err);
      process.exit(1);
    }
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
