const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const LEADS_FILE = path.join(__dirname, 'leads.json');

function isValidLeadContact(value) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const digitsOnly = String(value || '').replace(/[\s\-().+]/g, '');
  const phonePattern = /^\d{7,15}$/;
  return emailPattern.test(value) || phonePattern.test(digitsOnly);
}

function handleEarlyAccessPost(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 16 * 1024) {
      req.destroy();
    }
  });
  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON payload.' }));
      return;
    }

    const contact = String(payload.contact || '').trim();
    if (!isValidLeadContact(contact)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Please provide a valid email or WhatsApp number.' }));
      return;
    }

    const entry = {
      contact,
      source: String(payload.source || 'early-access-hero'),
      submittedAt: payload.submittedAt || new Date().toISOString()
    };

    fs.readFile(LEADS_FILE, 'utf8', (readErr, existing) => {
      let leads = [];
      if (!readErr && existing) {
        try {
          const parsed = JSON.parse(existing);
          if (Array.isArray(parsed)) leads = parsed;
        } catch {
          leads = [];
        }
      }
      leads.push(entry);
      fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), (writeErr) => {
        if (writeErr) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Failed to save lead.' }));
          return;
        }
        console.log(`[Early Access Lead] ${entry.contact} (${entry.submittedAt})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, entry }));
      });
    });
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  const reqUrl = req.url.split('?')[0];
  if (req.method === 'POST' && reqUrl === '/api/early-access') {
    handleEarlyAccessPost(req, res);
    return;
  }

  let reqPath = decodeURI(reqUrl);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, reqPath);

  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Server running at ${url}`);
  
  // Open in user default browser on Windows
  exec(`start ${url}`, (err) => {
    if (err) {
      console.log(`Could not automatically open browser: ${err.message}`);
    } else {
      console.log(`Opened ${url} in default browser.`);
    }
  });
});
