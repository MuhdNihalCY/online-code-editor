const express = require('express');
const Version = require('../models/Version');
const Document = require('../models/Document');
const auth = require('../middleware/auth');

const router = express.Router();

// Get version history for a document
router.get('/:docId', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.docId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check access rights
    const isOwner = document.owner.equals(req.user.id);
    const isCollaborator = document.collaborators.some(c => 
      c.user.equals(req.user.id)
    );

    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const versions = await Version.find({ documentId: req.params.docId })
      .sort({ version: -1 })
      .populate('author', 'email')
      .select('-content'); // Exclude content for performance

    res.json(versions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get specific version content
router.get('/:docId/:version', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.docId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check access rights
    const isOwner = document.owner.equals(req.user.id);
    const isCollaborator = document.collaborators.some(c => 
      c.user.equals(req.user.id)
    );

    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const version = await Version.findOne({
      documentId: req.params.docId,
      version: req.params.version
    }).populate('author', 'email');

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json(version);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Restore document to specific version
router.post('/:docId/restore/:version', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.docId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if user is owner or editor
    const isOwner = document.owner.equals(req.user.id);
    const isEditor = document.collaborators.some(c => 
      c.user.equals(req.user.id) && c.role === 'editor'
    );

    if (!isOwner && !isEditor) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const version = await Version.findOne({
      documentId: req.params.docId,
      version: req.params.version
    });

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Update document content
    document.content = version.content;
    document.version += 1;
    await document.save();

    res.json(document);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;