// Server statico minimo per lo sviluppo, senza dipendenze.
// Serve: i moduli ES non si caricano aprendo index.html con doppio clic (file://).
// Ascolta su tutte le interfacce, così l'app si apre anche dal telefono sulla stessa Wi-Fi.
//
//   node server.js            (porta 8080)
//   PORT=3000 node server.js

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORT) || 8080;

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = http.createServer(async (req, res) => {
  try {
    let percorso = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (percorso.endsWith('/')) percorso += 'index.html';
    // Niente file nascosti (.git, .claude…) e niente uscite dalla cartella.
    if (percorso.split('/').some((parte) => parte.startsWith('.'))) throw new Error('nascosto');
    const file = path.join(RADICE, path.normalize(percorso));
    if (!file.startsWith(RADICE + path.sep)) throw new Error('fuori radice');

    const contenuto = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TIPI[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(contenuto);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Non trovato');
  }
});

server.listen(PORTA, '0.0.0.0', () => {
  console.log(`\nApp studio in esecuzione.\n`);
  console.log(`  Su questo PC:      http://localhost:${PORTA}`);
  for (const indirizzi of Object.values(networkInterfaces())) {
    for (const i of indirizzi ?? []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  Dal telefono:      http://${i.address}:${PORTA}`);
    }
  }
  console.log(`\nCtrl+C per fermare.\n`);
});
