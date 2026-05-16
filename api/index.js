console.log('[api/index.js] Loading server...');
try {
  const app = require('../server/index');
  console.log('[api/index.js] Server loaded successfully');
  console.log('[api/index.js] App type:', typeof app);
  console.log('[api/index.js] App has listen:', typeof app.listen);
  console.log('[api/index.js] App has use:', typeof app.use);
  
  // Wrap the app to catch any errors during request handling
  const originalApp = app;
  const wrappedApp = (req, res, next) => {
    console.log('[api/index.js] Request:', req.method, req.url);
    try {
      return originalApp(req, res, next);
    } catch (error) {
      console.error('[api/index.js] ERROR in request handler:', {
        message: error.message,
        code: error.code,
        stack: error.stack?.slice(0, 500)
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  };
  
  // Copy all properties from original app to wrapped app
  Object.keys(originalApp).forEach(key => {
    if (key !== 'name' && key !== 'length') {
      wrappedApp[key] = originalApp[key];
    }
  });
  
  module.exports = wrappedApp;
} catch (error) {
  console.error('[api/index.js] ERROR loading server:', {
    message: error.message,
    code: error.code,
    stack: error.stack?.slice(0, 500)
  });
  throw error;
}
