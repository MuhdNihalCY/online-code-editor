const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { configureSocket } = require('./socket');
const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const versionRoutes = require('./routes/versions');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Trust first proxy for rate limiter
app.set('trust proxy', 1);

// Rate limiting with custom key generator
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for'] || 'default-key';
  }
});
app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/versions', versionRoutes);

// Socket.io setup
configureSocket(io);

// MongoDB connection with enhanced retry logic and error handling
const connectMongoDB = async () => {
  const maxRetries = 5;
  let retryCount = 0;

  const tryConnect = async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 2000,
        family: 4, // Force IPv4
        maxPoolSize: 10,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000
      });
      console.log('Connected to MongoDB');
      return true;
    } catch (err) {
      console.error('MongoDB connection error:', err);
      retryCount++;
      
      if (retryCount < maxRetries) {
        const delay = Math.min(retryCount * 1000, 5000);
        console.log(`Retrying MongoDB connection in ${delay}ms... (Attempt ${retryCount} of ${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return tryConnect();
      } else {
        console.error('Max MongoDB connection retries reached');
        return false;
      }
    }
  };

  return tryConnect();
};

// Mongoose error handling
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});

// Start server only after initial connection attempts
const startServer = async () => {
  const connected = await connectMongoDB();
  
  if (!connected) {
    console.error('Failed to connect to MongoDB. Server will not start.');
    process.exit(1);
  }

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

startServer();

module.exports = { app, server };