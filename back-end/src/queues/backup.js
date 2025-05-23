const { Queue, Worker } = require('bullmq');
const Document = require('../models/Document');
const Version = require('../models/Version');
require('dotenv').config(); 

// console.log(process.env.REDIS_HOST);
// console.log(process.env.REDIS_PORT);

// Configure Redis connection with retry and error handling
const redisOptions = {
  connection: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      console.log(`Retrying Redis connection in ${delay}ms...`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: false
  }
};

// Create queue with error handling
// const backupQueue = new Queue('document-backup', redisOptions);

// backupQueue.on('error', (err) => {
//   console.error('Backup queue error:', err);
//   // Continue operation without backup functionality
// });

// Process document backups with error handling
const backupWorker = new Worker('document-backup', async (job) => {
  const { documentId, content, version, userId } = job.data;

  try {
    // Create version history
    const versionRecord = new Version({
      documentId,
      content,
      changes: job.data.changes || [],
      author: userId,
      version
    });

    await versionRecord.save();
    console.log(`Backup created for document ${documentId}, version ${version}`);
  } catch (err) {
    console.error('Backup error:', err);
    throw err;
  }
}, redisOptions);

// Add error handling for worker
backupWorker.on('error', err => {
  console.error('Backup worker error:', err);
  // Worker will automatically retry on next available connection
});

backupWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});

module.exports = {
  // backupQueue,
  backupWorker
};