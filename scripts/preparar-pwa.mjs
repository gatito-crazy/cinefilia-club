import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const directorio = 'dist/proyecto-cine/browser';
const archivos = readdirSync(directorio).filter((n) => /\.(js|css)$/.test(n) && n !== 'cine-sw.js');
const version = createHash('sha256');
for (const nombre of archivos.sort()) {
    version.update(readFileSync(join(directorio, nombre)));
}
const cache = 'cine-shell-' + version.digest('hex').slice(0, 16);
const recursos = [
    '/index.html',
    '/manifest.webmanifest',
    '/cinefilia-club-logo.png',
    '/cinefili-club-icono.png',
    ...archivos.map((n) => '/' + n),
];
const worker = `
const CACHE = ${JSON.stringify(cache)};
const ASSETS = ${JSON.stringify(recursos)};
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('cine-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) { return; }
    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(c => c.match('/index.html'))));
    } else if (ASSETS.includes(url.pathname)) {
        event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(request)));
    }
});
`;
writeFileSync(join(directorio, 'cine-sw.js'), worker);
console.log(
    'PWA: shell y recursos estáticos preparados. Las operaciones de Supabase necesitan conexión.',
);
