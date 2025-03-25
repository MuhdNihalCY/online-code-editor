const express = require('express');
const { body, validationResult } = require('express-validator');
const Document = require('../models/Document');
const auth = require('../middleware/auth');

const router = express.Router();

// Create document
router.post('/', 
  auth,
  [
    body('title').trim().notEmpty(),
    body('language').trim().notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, language } = req.body;
      const document = new Document({
        title,
        language,
        owner: req.user.id
      });

      await document.save();
      res.status(201).json(document);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get user's documents
router.get('/', auth, async (req, res) => {
  try {
    const documents = await Document.find({
      $or: [
        { owner: req.user.id },
        { 'collaborators.user': req.user.id }
      ]
    }).populate('owner', 'email');

    res.json(documents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single document
router.get('/:id', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate('owner', 'email')
      .populate('collaborators.user', 'email');

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if user has access
    const isOwner = document.owner.equals(req.user.id);
    const isCollaborator = document.collaborators.some(c => 
      c.user.equals(req.user.id)
    );

    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(document);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update document
router.put('/:id', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check permissions
    const isOwner = document.owner.equals(req.user.id);
    const isEditor = document.collaborators.some(c => 
      c.user.equals(req.user.id) && c.role === 'editor'
    );

    if (!isOwner && !isEditor) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { title, content, language } = req.body;
    if (title) document.title = title;
    if (content) document.content = content;
    if (language) document.language = language;

    await document.save();
    res.json(document);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;