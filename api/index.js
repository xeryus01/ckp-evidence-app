console.log('[api/index.js] Loading server...');

// Setup global polyfills BEFORE importing pdfjs or canvas dependencies
if (!globalThis.DOMMatrix) {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor(init = 'none') {
      if (Array.isArray(init)) {
        [this.a = 1, this.b = 0, this.c = 0, this.d = 1, this.e = 0, this.f = 0] = init;
      } else if (init instanceof DOMMatrix) {
        Object.assign(this, init);
      } else if (typeof init === 'string') {
        const values = init.trim().replace(/matrix\(|\)/g, '').split(/,|\s+/).filter(Boolean).map(Number);
        [this.a = 1, this.b = 0, this.c = 0, this.d = 1, this.e = 0, this.f = 0] = values;
      } else {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      }
    }
    static fromFloat32Array(arr) { return new DOMMatrix(Array.from(arr)); }
    static fromFloat64Array(arr) { return new DOMMatrix(Array.from(arr)); }
    multiply(o) { return new DOMMatrix([this.a*o.a+this.b*o.c, this.a*o.b+this.b*o.d, this.c*o.a+this.d*o.c, this.c*o.b+this.d*o.d, this.e*o.a+this.f*o.c+o.e, this.e*o.b+this.f*o.d+o.f]); }
    multiplySelf(o) { Object.assign(this, this.multiply(o)); return this; }
    translateSelf(tx=0, ty=0) { this.e+=tx; this.f+=ty; return this; }
    scaleSelf(sx=1, sy=sx) { this.a*=sx; this.b*=sx; this.c*=sy; this.d*=sy; return this; }
    invertSelf() { const det=this.a*this.d-this.b*this.c; if(!det) return this; const a=this.d/det, b=-this.b/det, c=-this.c/det, d=this.a/det, e=(this.c*this.f-this.d*this.e)/det, f=(this.b*this.e-this.a*this.f)/det; return Object.assign(this, {a,b,c,d,e,f}); }
  };
}

if (!globalThis.ImageData) {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
  };
}

if (!globalThis.Path2D) {
  globalThis.Path2D = class Path2D {
    constructor(path) { this.path = path; }
    addPath() {}
  };
}

if (!globalThis.DOMPoint) {
  globalThis.DOMPoint = class DOMPoint {
    constructor(x=0, y=0, z=0, w=1) { this.x=x; this.y=y; this.z=z; this.w=w; }
  };
}

if (!globalThis.DOMRect) {
  globalThis.DOMRect = class DOMRect {
    constructor(x=0, y=0, width=0, height=0) { this.x=x; this.y=y; this.width=width; this.height=height; this.top=y; this.left=x; this.right=x+width; this.bottom=y+height; }
  };
}

try {
  // Suppress canvas-related warnings in Vercel environment
  if (process.env.VERCEL) {
    process.env.CANVAS_SKIP_INSTALL = '1';
  }
  
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
