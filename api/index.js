console.log('[api/index.js] Loading server...');
try {
  const app = require('../server/index');
  console.log('[api/index.js] Server loaded successfully');
  console.log('[api/index.js] App type:', typeof app);
  
  module.exports = app;
} catch (error) {
  console.error('[api/index.js] ERROR loading server:', {
    message: error.message,
    code: error.code,
    stack: error.stack?.slice(0, 500)
  });
  // If server fails to load, export a fallback error app
  const express = require('express');
  const fallbackApp = express();
  fallbackApp.use((req, res) => {
    res.status(500).json({ 
      error: 'Failed to load main app',
      details: error.message 
    });
  });
  module.exports = fallbackApp;
}
