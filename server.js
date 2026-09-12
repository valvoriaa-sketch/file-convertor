const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Parse JSON and urlencoded request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure Multer for In-Memory Storage (Zero disk writes for security and privacy)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB max buffer size
  }
});

// Lazy-load sharp if available for server-side fallback processing
let sharp = null;
try {
  sharp = require('sharp');
  console.log('[Server] Sharp image processing library loaded successfully.');
} catch (err) {
  console.warn('[Server] Sharp not detected or failed to load. Fallback API will run in passthrough mode.');
}

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

/**
 * Health check endpoint
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    mode: 'client-side-first',
    sharpAvailable: Boolean(sharp),
    timestamp: new Date().toISOString()
  });
});

/**
 * Fallback image conversion endpoint
 * POST /api/convert-fallback
 * 
 * Handles fallback conversions in-memory when client-side canvas
 * fails due to browser memory pressure, huge files, or format limits.
 * Files are never saved to disk.
 */
app.post('/api/convert-fallback', upload.single('image'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        error: 'No image file uploaded. Please provide a file with field name "image".'
      });
    }

    const targetFormat = (req.body.targetFormat || 'jpeg').toLowerCase();
    const quality = Math.min(Math.max(parseInt(req.body.quality, 10) || 90, 10), 100);
    const originalName = req.file.originalname || 'converted_image';
    const baseName = path.parse(originalName).name;

    console.log(`[Fallback API] Processing "${originalName}" -> ${targetFormat} at ${quality}% quality in-memory...`);

    if (!sharp) {
      // If sharp is not installed, return the original buffer with matching headers
      res.setHeader('Content-Type', req.file.mimetype || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.${targetFormat}"`);
      return res.status(200).send(req.file.buffer);
    }

    let pipeline = sharp(req.file.buffer);
    let outputBuffer;
    let contentType;
    let fileExtension;

    switch (targetFormat) {
      case 'jpg':
      case 'jpeg':
        pipeline = pipeline.flatten({ background: '#FFFFFF' }).jpeg({ quality });
        contentType = 'image/jpeg';
        fileExtension = 'jpg';
        break;

      case 'png':
        pipeline = pipeline.png({ compressionLevel: 8 });
        contentType = 'image/png';
        fileExtension = 'png';
        break;

      case 'webp':
        pipeline = pipeline.webp({ quality });
        contentType = 'image/webp';
        fileExtension = 'webp';
        break;

      case 'gif':
        pipeline = pipeline.gif();
        contentType = 'image/gif';
        fileExtension = 'gif';
        break;

      case 'avif':
        pipeline = pipeline.avif({ quality });
        contentType = 'image/avif';
        fileExtension = 'avif';
        break;

      case 'tiff':
        pipeline = pipeline.tiff({ quality });
        contentType = 'image/tiff';
        fileExtension = 'tiff';
        break;

      default:
        // Default to JPEG with white background
        pipeline = pipeline.flatten({ background: '#FFFFFF' }).jpeg({ quality });
        contentType = 'image/jpeg';
        fileExtension = 'jpg';
        break;
    }

    outputBuffer = await pipeline.toBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', outputBuffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}_converted.${fileExtension}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    return res.status(200).send(outputBuffer);
  } catch (error) {
    console.error('[Fallback API Error]:', error);
    return res.status(500).json({
      error: 'Failed to process image on server fallback.',
      details: error.message
    });
  }
});

// -------------------------------------------------------------
// Static Frontend Serving
// -------------------------------------------------------------

// Serve static assets from the "public" directory
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath, {
  extensions: ['html', 'htm'],
  maxAge: '1h'
}));

// Route handler for friendly URLs
app.get('/tools/jpg-to-pdf', (req, res) => {
  res.sendFile(path.join(publicPath, 'jpg-to-pdf.html'));
});

app.get('/tools/png-to-jpg', (req, res) => {
  res.sendFile(path.join(publicPath, 'png-to-jpg.html'));
});

app.get('/tools/webp-converter', (req, res) => {
  res.sendFile(path.join(publicPath, 'webp-converter.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(publicPath, 'privacy.html'));
});

app.get('/faq', (req, res) => {
  res.sendFile(path.join(publicPath, 'faq.html'));
});

// Fallback to index.html for any unhandled routes
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('[Express Error]:', err);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Uploaded file exceeds the maximum 50MB limit.' });
    }
  }
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start Express Server
app.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log('  ConvertCraft - Production Image & PDF Converter   ');
  console.log('====================================================');
  console.log(`> Server running on: http://${HOST}:${PORT}`);
  console.log(`> Mode: Client-Side First (Zero Server Storage)`);
  console.log(`> Static files served from: ${publicPath}`);
  console.log('====================================================');
});
