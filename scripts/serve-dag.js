#!/usr/bin/env node
/**
 * DAG Viewer Local Server & API
 *
 * Serves the dag-viewer.html and dag.json from the project root.
 * Handles API POST requests to update task status (e.g., set to Blocked, Needs Human, Unblock).
 *
 * Usage:
 *   node scripts/serve-dag.js [port]
 *
 * Default port: 3100
 * Opens: http://localhost:3100/dag-viewer.html
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = parseInt(process.argv[2]) || 3100;
const ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const cleanUrl = req.url.split('?')[0];

  // Handle API Endpoint to update node status
  if (req.method === 'POST' && (cleanUrl === '/api/node-status' || cleanUrl === '/api/node-status/')) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { nodeId, action, reason, question } = payload;

        if (!nodeId || !action) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'nodeId and action are required' }));
          return;
        }

        let cmd = '';
        const safeReason = (reason || 'Blocked via DAG Viewer UI').replace(/"/g, '\\"');
        const safeQuestion = (question || 'Flagged via DAG Viewer UI').replace(/"/g, '\\"');

        if (action === 'blocked' || action === 'fail') {
          cmd = `node scripts/dag-update.js fail ${nodeId} "${safeReason}"`;
        } else if (action === 'needs-human') {
          cmd = `node scripts/dag-update.js needs-human ${nodeId} "${safeQuestion}"`;
        } else if (action === 'unblock' || action === 'answer') {
          cmd = `node scripts/dag-update.js answer ${nodeId}`;
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
          return;
        }

        console.log(`Executing UI command: ${cmd}`);
        execSync(cmd, { cwd: ROOT, stdio: 'inherit' });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, nodeId, action }));
      } catch (err) {
        console.error('Error handling /api/node-status:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Handle API 404 fallthrough
  if (cleanUrl.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `API endpoint not found: ${cleanUrl}` }));
    return;
  }

  // Static file serving
  let filePath = path.join(ROOT, cleanUrl);
  if (filePath === ROOT + '/' || filePath === ROOT + '\\') {
    filePath = path.join(ROOT, 'dag-viewer.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + req.url);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  DAG Viewer running at:`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  Watching: ${path.join(ROOT, 'dag.json')}`);
  console.log(`  Polling interval: 2 seconds\n`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
