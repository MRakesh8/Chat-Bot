import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8080;

const server = http.createServer((req, res) => {
  const filePath = req.url === '/' ? '/index.html' : req.url;
  const ext = path.extname(filePath);
  
  let contentType = 'text/html';
  if (ext === '.js') contentType = 'application/javascript';
  else if (ext === '.css') contentType = 'text/css';
  
  const fullPath = path.join(__dirname, '..', 'fixtures', filePath);
  
  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Test server running at http://127.0.0.1:${PORT}/`);
});
