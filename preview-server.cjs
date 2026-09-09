const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/access-policy.mjs': ['access-policy.mjs', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/firebase-config.js': ['firebase-config.js', 'text/javascript'] };
files['/supervisor-report.mjs'] = ['supervisor-report.mjs', 'text/javascript'];
http.createServer((request, response) => {
  const entry = files[new URL(request.url, 'http://localhost').pathname];
  if (!entry) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': `${entry[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(__dirname, entry[0])).pipe(response);
}).listen(Number(process.env.PORT || 5187), '127.0.0.1');
