import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
for (const envFile of ['.env.local', '.env']) {
  const envPath = join(__dirname, envFile);
  if (existsSync(envPath)) {
    readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    });
    break;
  }
}

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

async function handleApi(req, res, handler) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  let body = raw;
  try { body = JSON.parse(raw); } catch {}

  const mockReq = { method: req.method, body, headers: req.headers };
  const mockRes = {
    statusCode: 200,
  };
  mockRes.setHeader = (k, v) => { res.setHeader(k, v); };
  mockRes.status = (code) => { mockRes.statusCode = code; return mockRes; };
  mockRes.json = (data) => {
    res.writeHead(mockRes.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  mockRes.end = (data) => {
    res.writeHead(mockRes.statusCode);
    res.end(data || '');
  };

  await handler(mockReq, mockRes);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/plan_options') {
    const { default: handler } = await import('./api/plan_options.js');
    return handleApi(req, res, handler);
  }
  if (url.pathname === '/api/generate') {
    const { default: handler } = await import('./api/generate.js');
    return handleApi(req, res, handler);
  }
  if (url.pathname === '/api/day_detail') {
    const { default: handler } = await import('./api/day_detail.js');
    return handleApi(req, res, handler);
  }

  let filePath = join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  if (!existsSync(filePath)) filePath = join(__dirname, 'public', 'index.html');

  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
  res.end(readFileSync(filePath));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  Mappd 开发服务器已启动 → http://localhost:${PORT}\n`);
  if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'your_deepseek_api_key_here') {
    console.log('  ⚠  请在 .env.local 中配置 DEEPSEEK_API_KEY 后重启\n');
  }
});
