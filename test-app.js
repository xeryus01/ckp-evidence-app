const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Test app working' });
});

app.get('/api', (req, res) => {
  res.json({ message: 'API working' });
});

module.exports = app;
