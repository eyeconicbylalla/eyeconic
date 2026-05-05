const express = require('express');
const Blog = require('../models/Blog');

const router = express.Router();

const ADMIN_EMAIL = 'admin@eyeconic1.com';
const ADMIN_PASSWORD = 'admin@eyeconic$';

const isValidAdminCredentials = (email, password) => {
  return email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
};

const getYoutubeVideoId = (url = '') => {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '').trim();
    }

    if (parsed.hostname.includes('youtube.com')) {
      const byQuery = parsed.searchParams.get('v');
      if (byQuery) return byQuery;

      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const embedIndex = pathParts.findIndex((part) => part === 'embed' || part === 'shorts');
      if (embedIndex !== -1 && pathParts[embedIndex + 1]) {
        return pathParts[embedIndex + 1];
      }
    }
  } catch (error) {
    return '';
  }

  return '';
};

router.get('/', async (_req, res) => {
  try {
    const blogs = await Blog.find({ isPublished: true }).sort({ createdAt: -1 });
    res.json({ blogs });
  } catch (error) {
    res.status(500).json({ msg: 'Failed to fetch blogs' });
  }
});

router.get('/admin', async (req, res) => {
  const { email, password } = req.query;

  if (!isValidAdminCredentials(email, password)) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }

  try {
    const blogs = await Blog.find({}).sort({ createdAt: -1 });
    res.json({ blogs });
  } catch (error) {
    res.status(500).json({ msg: 'Failed to fetch admin blogs' });
  }
});

router.post('/admin', async (req, res) => {
  const { email, password, title, description, youtubeUrl } = req.body;

  if (!isValidAdminCredentials(email, password)) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }

  const cleanedTitle = (title || '').trim();
  const cleanedDescription = (description || '').trim();
  const cleanedYoutubeUrl = (youtubeUrl || '').trim();

  if (!cleanedTitle) {
    return res.status(400).json({ msg: 'Blog title is required' });
  }

  if (!cleanedDescription) {
    return res.status(400).json({ msg: 'Blog description is required' });
  }

  const videoId = cleanedYoutubeUrl ? getYoutubeVideoId(cleanedYoutubeUrl) : '';
  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';

  try {
    const blog = await Blog.create({
      title: cleanedTitle,
      description: cleanedDescription,
      youtubeUrl: cleanedYoutubeUrl,
      thumbnailUrl,
    });

    res.status(201).json({ blog });
  } catch (error) {
    res.status(500).json({ msg: 'Failed to create blog' });
  }
});

router.delete('/admin/:id', async (req, res) => {
  const { email, password } = req.body;

  if (!isValidAdminCredentials(email, password)) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }

  try {
    const deleted = await Blog.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ msg: 'Blog not found' });
    }

    res.json({ msg: 'Blog deleted' });
  } catch (error) {
    res.status(500).json({ msg: 'Failed to delete blog' });
  }
});

module.exports = router;