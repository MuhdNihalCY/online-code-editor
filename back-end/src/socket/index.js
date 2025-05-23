const jwt = require('jsonwebtoken');
const Document = require('../models/Document');
const Version = require('../models/Version'); // Import Version model
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

    socket.on('text-change', async ({ docId, content, version }) => {
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
          content,
          version
        });

        // Update document
        document.content = content;
        
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
          changes: content // Using content here, might need review
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

    // Handler for fetching document versions
    socket.on('document:getVersions', async (payload, callback) => {
      try {
        const { documentId, page: pageParam, limit: limitParam } = payload;
        
        if (!documentId) {
          return callback({ error: 'Document ID is required' });
        }

        const page = parseInt(String(pageParam), 10) || 1;
        const limit = parseInt(String(limitParam), 10) || 20;

        if (page < 1 || limit < 1) {
          return callback({ error: 'Page and limit must be positive numbers.' });
        }

        const document = await Document.findById(documentId);
        if (!document) {
          return callback({ error: 'Document not found' });
        }

        // Access Control: User must be owner or collaborator
        const isOwner = document.owner.equals(socket.userId);
        const isCollaborator = document.collaborators.some(c => c.user.equals(socket.userId));

        if (!isOwner && !isCollaborator) {
          return callback({ error: 'Access denied' });
        }

        const totalVersions = await Version.countDocuments({ documentId });
        const versions = await Version.find({ documentId })
          .sort({ version: -1 }) // Keep existing sort
          .skip((page - 1) * limit)
          .limit(limit)
          .populate('author', 'name email') // Keep existing populate
          .select('-changes'); // Keep existing select

        callback({ versions, totalVersions, currentPage: page, totalPages: Math.ceil(totalVersions / limit) });
      } catch (err) {
        console.error('Error fetching document versions:', err);
        callback({ error: 'Failed to fetch versions' });
      }
    });

    // Handler for restoring a document version
    socket.on('document:restore', async (payload) => {
      try {
        const { documentId, versionId } = payload;
        if (!documentId || !versionId) {
          socket.emit('error', { message: 'Document ID and Version ID are required' });
          return;
        }

        const document = await Document.findById(documentId);
        if (!document) {
          socket.emit('error', { message: 'Document not found' });
          return;
        }

        // Access Control: User must be owner or editor
        const isOwner = document.owner.equals(socket.userId);
        const isEditor = document.collaborators.some(
          c => c.user.equals(socket.userId) && c.role === 'editor'
        );

        if (!isOwner && !isEditor) {
          socket.emit('error', { message: 'Access denied: You do not have permission to restore this document.' });
          return;
        }

        const versionToRestore = await Version.findById(versionId);
        if (!versionToRestore) {
          socket.emit('error', { message: 'Version not found' });
          return;
        }

        // Restore document content and increment version
        document.content = versionToRestore.content;
        document.version += 1; // Increment version
        await document.save();
        
        // Invalidate cache for the updated document
        await invalidateCache(documentId);

        // Broadcast the changes to all clients in the room
        io.to(documentId).emit('text-change', {
          userId: socket.userId, // The user who initiated the restore
          content: document.content,
          version: document.version,
        });

        // Queue a new backup job for the restored state
        await backupQueue.add('create-backup', {
          documentId: documentId,
          content: document.content,
          version: document.version,
          userId: socket.userId, // User who performed the restore
          changes: `Restored from version ${versionToRestore.version}`, // Description of change
        });

        // Optionally, send a success confirmation to the client who initiated restore
        socket.emit('document:restoreSuccess', { 
          message: 'Document restored successfully',
          newVersion: document.version,
          restoredContent: document.content 
        });

      } catch (err) {
        console.error('Error restoring document version:', err);
        socket.emit('error', { message: 'Failed to restore document version' });
      }
    });

  });
};

module.exports = { configureSocket };