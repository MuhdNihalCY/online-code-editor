const jwt = require('jsonwebtoken');
const Document = require('../models/Document');
const { backupQueue } = require('../queues/backup');
const { cacheDocument, getCachedDocument, invalidateCache } = require('../services/redis');

const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
};

const configureSocket = (io) => {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId}`);

    socket.on('join-document', async ({ docId }) => {
      try {
        // Check document access
        const document = await Document.findById(docId);
        if (!document) return;

        const isOwner = document.owner.equals(socket.userId);
        const isCollaborator = document.collaborators.some(c => 
          c.user.equals(socket.userId)
        );

        if (!isOwner && !isCollaborator) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        socket.join(docId);
        
        // Get document from cache or database
        const cachedDoc = await getCachedDocument(docId);
        if (cachedDoc) {
          socket.emit('document-data', cachedDoc);
        } else {
          socket.emit('document-data', document);
          await cacheDocument(docId, document);
        }

        // Notify others
        socket.to(docId).emit('user-joined', {
          userId: socket.userId,
          timestamp: new Date()
        });
      } catch (err) {
        console.error('Error joining document:', err);
        socket.emit('error', { message: 'Failed to join document' });
      }
    });

    socket.on('text-change', async ({ docId, ops, version }) => {
      try {
        const document = await Document.findById(docId);
        if (!document) return;

        // Check write permissions
        const isOwner = document.owner.equals(socket.userId);
        const isEditor = document.collaborators.some(c => 
          c.user.equals(socket.userId) && c.role === 'editor'
        );

        if (!isOwner && !isEditor) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Broadcast changes
        socket.to(docId).emit('text-change', {
          userId: socket.userId,
          ops,
          version
        });

        // Update document
        document.content = ops.reduce((content, op) => {
          // Apply operational transform
          return content; // Implement OT logic here
        }, document.content);
        
        document.version = version;
        await document.save();

        // Invalidate cache
        await invalidateCache(docId);

        // Queue backup job
        await backupQueue.add('create-backup', {
          documentId: docId,
          content: document.content,
          version: document.version,
          userId: socket.userId,
          changes: ops
        });

      } catch (err) {
        console.error('Error handling text change:', err);
        socket.emit('error', { message: 'Failed to save changes' });
      }
    });

    socket.on('cursor-move', ({ docId, position }) => {
      socket.to(docId).emit('cursor-update', {
        userId: socket.userId,
        position
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
    });
  });
};

module.exports = { configureSocket };