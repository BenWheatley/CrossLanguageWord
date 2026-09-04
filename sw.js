/**
 * sw.js - makes the program work with no network, and lets it be kept on a home screen.
 *
 * Two caching strategies, because the two kinds of file want opposite things:
 *
 *   - The program itself (page, stylesheet, script) is fetched from the network first and only
 *     falls back to the cache when that fails. So a copy on a home screen picks up changes as
 *     soon as it is opened online, and - just as important - editing the source and reloading
 *     shows the edit rather than a week-old copy. A service worker that served stale code would
 *     reintroduce exactly the problem server-debug-nocache.py exists to avoid.
 *   - The word lists are read from the cache first. They are large, they almost never change,
 *     and going to the network for 180KB of German every time a puzzle is built is pure delay.
 *     A change to one arrives with the next CACHE_VERSION.
 *
 * Bump CACHE_VERSION when anything precached changes. Old caches are deleted on activation.
 */

const CACHE_VERSION = 'crossword-trainer-v1';

// Everything needed to open the program and build a puzzle with no network at all.
const PRECACHE = [
  '.',
  'index.html',
  'styles.css',
  'crossword-engine.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'german.json',
  'Deutsch-A2.json',
  'example.json',
  'deutsch-fragen-english.json'
];

const isWordList = (url) => url.pathname.endsWith('.json');

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // Individually, so one missing file cannot fail the whole install.
    await Promise.all(PRECACHE.map((path) => cache.add(path).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if(request.method !== 'GET') return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;   // fonts and anything else: leave well alone

  if(isWordList(url)){
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request){
  const cached = await caches.match(request, { ignoreSearch: true });
  if(cached) return cached;
  const response = await fetch(request);
  if(response && response.ok){
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request){
  try{
    const response = await fetch(request);
    if(response && response.ok){
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  }catch(err){
    // Offline. Any query string is part of which puzzle, not which file, so ignore it when
    // looking for a copy; a navigation to a seeded link still finds the page.
    const cached = await caches.match(request, { ignoreSearch: true });
    if(cached) return cached;
    if(request.mode === 'navigate'){
      const page = await caches.match('index.html', { ignoreSearch: true });
      if(page) return page;
    }
    throw err;
  }
}
