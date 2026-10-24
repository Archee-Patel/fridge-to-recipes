import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironment } from './lib/environment.js';
import { generateRecipes, RecipeServiceError } from './lib/recipes.js';

const root = fileURLToPath(new URL('.', import.meta.url));
await loadEnvironment(new URL('.env', import.meta.url));
const publicRoot = resolve(root, 'public');
const port = Number(process.env.PORT || 3000);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

async function respondJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20_000) throw new RecipeServiceError('Request is too large.', 413);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new RecipeServiceError('Request body must be valid JSON.', 400);
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'POST' && url.pathname === '/api/recipes') {
    try {
      const input = await readRequestBody(request);
      const result = await generateRecipes(input);
      await respondJson(response, 200, result);
    } catch (error) {
      if (error instanceof RecipeServiceError) {
        await respondJson(response, error.status, { error: error.message });
      } else {
        console.error('Unexpected recipe request failure:', error);
        await respondJson(response, 500, { error: 'Something went wrong while making your recipes.' });
      }
    }
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    await respondJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  let requestedPath;
  try {
    requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Invalid path');
    return;
  }
  const filePath = resolve(publicRoot, `.${requestedPath}`);
  if (!filePath.startsWith(`${publicRoot}${sep}`)) {
    response.writeHead(403);
    response.end();
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    console.error('Static file request failed:', error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Unable to serve this page.');
  }
});

server.listen(port, () => {
  console.log(`Fridge-to-Recipes is ready at http://localhost:${port}`);
});
