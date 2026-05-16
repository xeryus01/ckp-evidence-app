#!/usr/bin/env node
// Test if all modules can be imported
console.log('Testing module imports...');

try {
  console.log('Requiring dotenv...');
  require('dotenv').config();
  console.log('✓ dotenv loaded');
  
  console.log('Requiring fs/promises...');
  require('fs/promises');
  console.log('✓ fs/promises loaded');
  
  console.log('Requiring path...');
  require('path');
  console.log('✓ path loaded');
  
  console.log('Requiring express...');
  const express = require('express');
  console.log('✓ express loaded');
  
  console.log('Requiring cors...');
  require('cors');
  console.log('✓ cors loaded');
  
  console.log('Requiring multer...');
  require('multer');
  console.log('✓ multer loaded');
  
  console.log('Requiring sharp...');
  require('sharp');
  console.log('✓ sharp loaded');
  
  console.log('Requiring uuid...');
  require('uuid');
  console.log('✓ uuid loaded');
  
  console.log('Requiring @vercel/blob...');
  const blob = require('@vercel/blob');
  console.log('✓ @vercel/blob loaded');
  console.log('  - Has get:', typeof blob.get === 'function');
  console.log('  - Has put:', typeof blob.put === 'function');
  console.log('  - Has del:', typeof blob.del === 'function');
  
  console.log('Requiring server/index.js...');
  const app = require('./server/index.js');
  console.log('✓ server/index.js loaded');
  console.log('  - app is:', typeof app);
  console.log('  - app.use is:', typeof app.use);
  
  console.log('\n✅ All modules loaded successfully!');
  
} catch (error) {
  console.error('\n❌ Error loading modules:');
  console.error('  Message:', error.message);
  console.error('  Code:', error.code);
  console.error('  Stack:', error.stack);
  process.exit(1);
}
