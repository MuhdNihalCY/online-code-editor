const { configureSocket } = require('./index');
const Document = require('../models/Document');
const Version = require('../models/Version');
const { backupQueue } = require('../queues/backup');
const { invalidateCache } = require('../services/redis');
const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

jest.setTimeout(10000); // Increase timeout for async operations

// Mocking the Mongoose models and other dependencies
jest.mock('../models/Document');
jest.mock('../models/Version');
jest.mock('../queues/backup', () => ({
  backupQueue: {
    add: jest.fn().mockResolvedValue(true),
  },
}));
jest.mock('../services/redis', () => ({
  cacheDocument: jest.fn().mockResolvedValue(true),
  getCachedDocument: jest.fn().mockResolvedValue(null),
  invalidateCache: jest.fn().mockResolvedValue(true),
}));
jest.mock('jsonwebtoken', () => ({
  // The actual authenticateSocket middleware uses jwt.verify(token, secret)
  // in a try/catch block, meaning it's the synchronous version.
  verify: jest.fn((token, secret) => {
    // For testing, we can assume the token is just the userId or a special value.
    if (token === 'bad-token' || !token) { // Added !token for safety
      throw new Error('jwt verify error'); // This will be caught by try/catch in authenticateSocket
    }
    // Simulate successful verification. The 'decoded.id' becomes 'socket.userId'.
    let userId = 'testUser'; // Default userId
    if (token && token.startsWith('token-for-')) {
      userId = token.split('token-for-')[1];
    }
    return { id: userId }; // Return decoded object
  }),
}));

describe('Socket Handlers', () => {
  let io, clientSocket, httpServer; // serverSocket removed as it was not used and potentially problematic

  beforeAll((done) => {
    httpServer = http.createServer();
    io = new Server(httpServer);
    
    // configureSocket(io) will attach the actual authenticateSocket middleware,
    // which in turn uses our mocked jwt.verify.
    configureSocket(io); 
    
    httpServer.listen(() => {
      const port = httpServer.address().port;
      // For the main clientSocket, use a token that our mock jwt.verify will parse to 'testUser'
      clientSocket = Client(`http://localhost:${port}`, {
        auth: { token: 'token-for-testUser' } 
      });
      clientSocket.on('connect', () => {
        done(); 
      });
      clientSocket.on('connect_error', (err) => {
        console.error('Client connection error in beforeAll:', err);
        done(err); 
      });
    });
  });

  afterAll((done) => {
    io.close(() => { // Ensure server is closed before calling done
        clientSocket.close();
        httpServer.close(done); // Ensure http server is closed
    });
  });

  afterEach(() => {
    // Clear mocks after each test
    jest.clearAllMocks();
  });

  describe('document:getVersions', () => {
    const mockDocumentId = 'mockDocId';

    it('should return versions for an authorized user (owner)', (done) => {
      const mockVersions = [{ id: 'v1', content: 'V1', author: { name: 'Test User' }, createdAt: new Date().toISOString() }];
      const mockDoc = {
        _id: mockDocumentId,
        owner: { equals: (id) => id === 'testUser' }, // Mock ObjectId.equals
        collaborators: { some: () => false }, // Mock Array.some for collaborators
      };
      Document.findById.mockResolvedValue(mockDoc);
      Version.countDocuments.mockResolvedValue(mockVersions.length); // Assume total is same as returned for non-paginated original test

      const skipMock = jest.fn().mockReturnThis();
      const limitMock = jest.fn().mockReturnThis();
      Version.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: skipMock,
        limit: limitMock,
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockVersions),
      });

      clientSocket.emit('document:getVersions', { documentId: mockDocumentId }, (response) => {
        expect(Document.findById).toHaveBeenCalledWith(mockDocumentId);
        expect(Version.find).toHaveBeenCalledWith({ documentId: mockDocumentId });
        // Default pagination means page 1, limit 20
        expect(skipMock).toHaveBeenCalledWith(0);
        expect(limitMock).toHaveBeenCalledWith(20);
        expect(response.versions).toEqual(mockVersions);
        expect(response.totalVersions).toBe(mockVersions.length);
        expect(response.currentPage).toBe(1);
        expect(response.totalPages).toBe(Math.ceil(mockVersions.length / 20));
        done();
      });
    });
    
    it('should return versions for an authorized user (collaborator)', (done) => {
      const mockVersions = [{ id: 'v1', content: 'V1', author: { name: 'Test User' }, createdAt: new Date().toISOString() }];
      const mockDoc = {
        _id: mockDocumentId,
        owner: { equals: (id) => id === 'anotherUser' },
        collaborators: { 
          some: (predicate) => predicate({ user: { equals: (id) => id === 'testUser' }}) 
        },
      };
      Document.findById.mockResolvedValue(mockDoc);
      Version.countDocuments.mockResolvedValue(mockVersions.length);

      const skipMock = jest.fn().mockReturnThis();
      const limitMock = jest.fn().mockReturnThis();
      Version.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: skipMock,
        limit: limitMock,
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockVersions),
      });

      clientSocket.emit('document:getVersions', { documentId: mockDocumentId }, (response) => {
        expect(skipMock).toHaveBeenCalledWith(0);
        expect(limitMock).toHaveBeenCalledWith(20);
        expect(response.versions).toEqual(mockVersions);
        expect(response.totalVersions).toBe(mockVersions.length);
        expect(response.currentPage).toBe(1);
        expect(response.totalPages).toBe(Math.ceil(mockVersions.length / 20));
        done();
      });
    });

    it('should return an error if document not found', (done) => {
      Document.findById.mockResolvedValue(null);
      clientSocket.emit('document:getVersions', { documentId: 'nonExistentDoc' }, (response) => {
        expect(response.error).toBe('Document not found');
        done();
      });
    });

    it('should return an error for an unauthorized user', (done) => {
      const mockDoc = {
        _id: mockDocumentId,
        owner: { equals: (id) => id === 'anotherUser' }, // Owner is not 'unauthorizedUser'
        collaborators: { some: () => false }, // No collaborators match 'unauthorizedUser'
      };
      Document.findById.mockResolvedValue(mockDoc);
      
      // For this test, we need a client whose token will be resolved to 'unauthorizedUser'
      const unauthorizedSocket = Client(`http://localhost:${httpServer.address().port}`, {
        auth: { token: 'token-for-unauthorizedUser' }, // This token will yield 'unauthorizedUser' via mock
        forceNew: true, 
      });

      unauthorizedSocket.on('connect', () => {
        unauthorizedSocket.emit('document:getVersions', { documentId: mockDocumentId }, (response) => {
          expect(Document.findById).toHaveBeenCalledWith(mockDocumentId);
          // The actual error from authenticateSocket is "Authentication error" if jwt.verify fails,
          // or the handler itself might deny access if userId doesn't match.
          // Given our jwt mock, it should connect, then the handler logic should deny.
          expect(response.error).toBe('Access denied');
          unauthorizedSocket.close();
          done();
        });
      });
      unauthorizedSocket.on('connect_error', (err) => {
        console.error('Unauthorized client connection error:', err);
        unauthorizedSocket.close();
        done(err);
      });
    });
    
    it('should handle authentication failure for getVersions if token is bad', (done) => {
      const badAuthClient = Client(`http://localhost:${httpServer.address().port}`, {
        auth: { token: 'bad-token' }, // This will cause jwt.verify mock to call callback with error
        forceNew: true,
      });
      
      // The 'connect_error' event should be emitted by the client if authentication fails at connection time.
      // The server-side 'authenticateSocket' calls next(new Error('Authentication error'))
      badAuthClient.on('connect_error', (err) => {
        // err from client side is an object, err.message is the string from server
        expect(err.message).toContain('Authentication error'); // Or more specific if server sends richer error
        badAuthClient.close();
        done();
      });

      // This test primarily expects 'connect_error'. If it connects, it's a failure of the auth mechanism.
      badAuthClient.on('connect', () => {
        badAuthClient.close();
        done(new Error('Connected with bad token, which was not expected. Authentication should fail at connection.'));
      });
    });

    it('should return empty array if no versions exist', (done) => {
      const mockDoc = {
        _id: mockDocumentId,
        owner: { equals: (id) => id === 'testUser' },
        collaborators: { some: () => false },
      };
      Document.findById.mockResolvedValue(mockDoc);
      Version.countDocuments.mockResolvedValue(0); // No versions exist

      const skipMock = jest.fn().mockReturnThis();
      const limitMock = jest.fn().mockReturnThis();
      Version.find.mockReturnValue({ // Ensure this structure is used for all tests
        sort: jest.fn().mockReturnThis(),
        skip: skipMock,
        limit: limitMock,
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]),
      });
      
      clientSocket.emit('document:getVersions', { documentId: mockDocumentId }, (response) => {
        expect(skipMock).toHaveBeenCalledWith(0); // Default skip
        expect(limitMock).toHaveBeenCalledWith(20); // Default limit
        expect(response.versions).toEqual([]);
        expect(response.totalVersions).toBe(0);
        expect(response.currentPage).toBe(1); 
        expect(response.totalPages).toBe(0); 
        done();
      });
    });

    // New tests for pagination (these should already be using the correct mock structure)
    it('should use default pagination (page=1, limit=20) if no params provided', (done) => {
      const mockDoc = { _id: mockDocumentId, owner: { equals: () => true }, collaborators: { some: () => false } };
      Document.findById.mockResolvedValue(mockDoc);
      Version.countDocuments.mockResolvedValue(30); // Example total
      const mockReturnedVersions = Array(20).fill({ id: 'vDefault' });

      const skipMock = jest.fn().mockReturnThis();
      const limitMock = jest.fn().mockReturnThis();
      Version.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: skipMock,
        limit: limitMock,
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockReturnedVersions),
      });

      clientSocket.emit('document:getVersions', { documentId: mockDocumentId }, (response) => {
        expect(skipMock).toHaveBeenCalledWith(0); // (1-1)*20
        expect(limitMock).toHaveBeenCalledWith(20); // Default limit
        expect(response.versions).toEqual(mockReturnedVersions);
        expect(response.totalVersions).toBe(30);
        expect(response.currentPage).toBe(1);
        expect(response.totalPages).toBe(2); // Math.ceil(30/20)
        done();
      });
    });

    it('should use provided page and limit parameters', (done) => {
      const mockDoc = { _id: mockDocumentId, owner: { equals: () => true }, collaborators: { some: () => false } };
      Document.findById.mockResolvedValue(mockDoc);
      Version.countDocuments.mockResolvedValue(100);
      const page = 2;
      const limit = 10;
      const mockReturnedVersionsPage2 = Array(limit).fill({ id: 'vPage2' });

      const skipMock = jest.fn().mockReturnThis();
      const limitMock = jest.fn().mockReturnThis();
      Version.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: skipMock,
        limit: limitMock,
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue(mockReturnedVersionsPage2),
      });

      clientSocket.emit('document:getVersions', { documentId: mockDocumentId, page, limit }, (response) => {
        expect(skipMock).toHaveBeenCalledWith((page - 1) * limit);
        expect(limitMock).toHaveBeenCalledWith(limit);
        expect(response.versions).toEqual(mockReturnedVersionsPage2);
        expect(response.totalVersions).toBe(100);
        expect(response.currentPage).toBe(page);
        expect(response.totalPages).toBe(10); // 100/10
        done();
      });
    });

    it('should return empty versions array if page is beyond totalPages', (done) => {
      const mockDoc = { _id: mockDocumentId, owner: { equals: () => true }, collaborators: { some: () => false } };
      Document.findById.mockResolvedValue(mockDoc);
      Version.countDocuments.mockResolvedValue(25); // Total 25 items
      const page = 4; // Total pages is 3 if limit is 10 (25/10 = 2.5 -> 3)
      const limit = 10;

      const skipMock = jest.fn().mockReturnThis();
      const limitMock = jest.fn().mockReturnThis();
      Version.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: skipMock,
        limit: limitMock,
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]), // Should return empty for out-of-bounds page
      });
      
      clientSocket.emit('document:getVersions', { documentId: mockDocumentId, page, limit }, (response) => {
        expect(skipMock).toHaveBeenCalledWith((page - 1) * limit); // 30
        expect(limitMock).toHaveBeenCalledWith(limit); // 10
        expect(response.versions).toEqual([]);
        expect(response.totalVersions).toBe(25);
        expect(response.currentPage).toBe(page);
        expect(response.totalPages).toBe(3); // Math.ceil(25/10)
        done();
      });
    });

    it('should return error for invalid page or limit (e.g., negative values)', (done) => {
      const mockDoc = { _id: mockDocumentId, owner: { equals: () => true }, collaborators: { some: () => false } };
      // Document.findById might not even be called if validation fails early, but it's fine to have it here.
      Document.findById.mockResolvedValue(mockDoc); 
      // No need to mock Version.find or Version.countDocuments as the handler should return early.

      clientSocket.emit('document:getVersions', { documentId: mockDocumentId, page: -1, limit: 10 }, (response) => {
        expect(response.error).toBe('Page and limit must be positive numbers.');
        
        clientSocket.emit('document:getVersions', { documentId: mockDocumentId, page: 1, limit: -1 }, (response2) => {
          expect(response2.error).toBe('Page and limit must be positive numbers.');
          done();
        });
      });
    });

    it('should handle page=0 or limit=0 by defaulting them (not erroring)', (done) => {
      const mockDoc = { _id: mockDocumentId, owner: { equals: () => true }, collaborators: { some: () => false } };
      Document.findById.mockResolvedValue(mockDoc);
      Version.countDocuments.mockResolvedValue(5); // Provide a count
      
      const skipMock = jest.fn().mockReturnThis();
      const limitMock = jest.fn().mockReturnThis();
      Version.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: skipMock,
        limit: limitMock,
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([{id: 'v1'}]), // Return some data
      });

      // Test with page: 0
      clientSocket.emit('document:getVersions', { documentId: mockDocumentId, page: 0, limit: 10 }, (response) => {
        expect(response.error).toBeUndefined(); // Should not error
        expect(response.currentPage).toBe(1); // Defaulted from 0
        expect(skipMock).toHaveBeenCalledWith(0); // (1-1)*10
        expect(limitMock).toHaveBeenCalledWith(10);

        // Test with limit: 0
        clientSocket.emit('document:getVersions', { documentId: mockDocumentId, page: 1, limit: 0 }, (response2) => {
          expect(response2.error).toBeUndefined(); // Should not error
          expect(response2.currentPage).toBe(1);
          // limit will be defaulted to 20 by `const limit = parseInt(String(limitParam), 10) || 20;`
          // if limitParam is 0, parseInt("0",10) is 0. Then 0 || 20 is 20.
          expect(skipMock).toHaveBeenCalledWith(0); // (1-1)*20
          expect(limitMock).toHaveBeenCalledWith(20); // Defaulted from 0
          done();
        });
      });
    });

  });

  describe('document:restore', () => {
    const mockDocumentId = 'docToRestore';
    const mockVersionId = 'verToRestore';
    const mockUserId = 'testUser'; // This user is owner/editor

    // Define this more robustly for reuse
    const createMockDoc = (ownerId, collaboratorsList) => ({
      _id: mockDocumentId,
      owner: { equals: (id) => id === ownerId },
      collaborators: { 
        some: (predicate) => collaboratorsList.some(c => predicate({ user: { equals: (id) => id === c.user }, role: c.role }))
      },
      content: 'Old content',
      version: 1,
      save: jest.fn().mockResolvedValue(true), // Individual save mock for each instance
    });
    
    let mockDocumentInstance; // To hold the specific instance for a test

    const mockVersion = {
      _id: mockVersionId,
      documentId: mockDocumentId,
      content: 'Restored content',
      version: 0, // The version number of the historical record
    };

    beforeEach(() => {
      // Reset mocks that might be modified within tests if they are instance methods
      // For Document.findById etc., they are reset globally by jest.clearAllMocks() in afterEach
      // but if we are modifying properties of mockDocumentInstance, reset them.
      if (mockDocumentInstance && mockDocumentInstance.save) {
        mockDocumentInstance.save.mockClear();
      }
      // Re-create a fresh instance for relevant tests to avoid state leakage if needed
      mockDocumentInstance = createMockDoc(mockUserId, [{ user: mockUserId, role: 'editor' }]);


      // Mock io.to(...).emit(...)
      // Mock io.to(docId).emit(...)
      // The 'io' instance is the server itself.
      // configureSocket(io) was called in beforeAll.
      // So we mock the 'to' method on our 'io' instance.
      io.to = jest.fn((roomId) => {
        return {
          emit: jest.fn((event, data) => {
            // Store or assert roomId, event, data as needed
            // console.log(`Mocked io.to(${roomId}).emit(${event}, ${JSON.stringify(data)})`);
          })
        };
      });
    });
    
    it('should allow owner to restore a version', (done) => {
      // Use the fresh mockDocumentInstance for this test
      Document.findById.mockResolvedValue(mockDocumentInstance);
      Version.findById.mockResolvedValue(mockVersion);
      
      clientSocket.emit('document:restore', { documentId: mockDocumentId, versionId: mockVersionId });

      clientSocket.once('document:restoreSuccess', (data) => {
        expect(Document.findById).toHaveBeenCalledWith(mockDocumentId);
        expect(Version.findById).toHaveBeenCalledWith(mockVersionId);
        // Check properties of the specific instance that was resolved
        expect(mockDocumentInstance.content).toBe(mockVersion.content);
        expect(mockDocumentInstance.version).toBe(2);
        expect(mockDocumentInstance.save).toHaveBeenCalled();
        expect(invalidateCache).toHaveBeenCalledWith(mockDocumentId);
        
        expect(io.to).toHaveBeenCalledWith(mockDocumentId);
        // This assumes io.to(mockDocumentId) returns an object with an emit mock
        const roomEmitMock = io.to.mock.results[0].value.emit;
        expect(roomEmitMock).toHaveBeenCalledWith('text-change', {
          userId: mockUserId, // testUser is the one making the call
          content: mockVersion.content,
          version: 2,
        });
        
        expect(backupQueue.add).toHaveBeenCalledWith('create-backup', expect.objectContaining({
          documentId: mockDocumentId,
          content: mockVersion.content,
          version: 2,
          userId: mockUserId,
        }));
        expect(data.message).toBe('Document restored successfully');
        done();
      });
    });

    it('should deny access if user is not owner or editor', (done) => {
      // Create a doc where 'testUser' (our clientSocket's user) is neither owner nor editor
      const docInstanceForDeny = createMockDoc('anotherOwner', [{ user: 'collaborator1', role: 'viewer' }]);
      Document.findById.mockResolvedValue(docInstanceForDeny);
      Version.findById.mockResolvedValue(mockVersion);

      clientSocket.emit('document:restore', { documentId: mockDocumentId, versionId: mockVersionId });
      
      clientSocket.once('error', (response) => {
          expect(Document.findById).toHaveBeenCalledWith(mockDocumentId);
          expect(response.message).toBe('Access denied: You do not have permission to restore this document.');
          done();
        });
    });
    
    it('should handle authentication failure for restore if token is bad', (done) => {
      const badAuthClient = Client(`http://localhost:${httpServer.address().port}`, {
        auth: { token: 'bad-token' },
        forceNew: true,
      });
      
      badAuthClient.on('connect_error', (err) => {
        expect(err.message).toContain('Authentication error');
        badAuthClient.close();
        done();
      });
      badAuthClient.on('connect', () => {
        badAuthClient.close();
        done(new Error('Connected with bad token for restore, not expected. Authentication should fail at connection.'));
      });
    });

    it('should emit error if document not found', (done) => {
      Document.findById.mockResolvedValue(null); // Document not found
      Version.findById.mockResolvedValue(mockVersion); // Version exists, but doc doesn't

      clientSocket.emit('document:restore', { documentId: 'nonExistentDoc', versionId: mockVersionId });
      
      clientSocket.once('error', (data) => {
        expect(data.message).toBe('Document not found');
        done();
      });
    });

    it('should emit error if version to restore not found', (done) => {
      // Use the standard mockDocumentInstance which 'testUser' can edit
      Document.findById.mockResolvedValue(mockDocumentInstance);
      Version.findById.mockResolvedValue(null); // Version not found
      
      clientSocket.emit('document:restore', { documentId: mockDocumentId, versionId: 'nonExistentVersion' });
      
      clientSocket.once('error', (data) => {
        expect(data.message).toBe('Version not found');
        done();
      });
    });
  });
});

// Enhanced mock for Version.find to allow spying on chained methods like skip, limit
// This will be set up per test or in a beforeEach if a common structure is needed.
// For now, individual tests will define their Version.find mock structure.
Version.find = jest.fn(); // Reset to a simple jest.fn()
Version.countDocuments = jest.fn(); // Add mock for countDocuments

// Default mock for Document.findById - can be overridden in tests
Document.findById = jest.fn().mockResolvedValue(null); 
// Default mock for Version.findById - can be overridden in tests
Version.findById = jest.fn().mockResolvedValue(null);

// No need for Document.prototype mocks if we are creating plain objects for resolved values.
// Ensure Document.findById and Version.findById are reset if necessary, or use jest.clearAllMocks().
