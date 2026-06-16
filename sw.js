// tw-web service worker — minimal shell cache for PWA installability
// API calls always go to network; only app shell assets are cached.

const CACHE = 'tw-web-v60';
const SHELL = [
    '/', '/index.html', '/styles.css',
    '/nav.js', '/main.js', '/task-card.js', '/task-editor.js', '/task-editor-templates.html',
    '/agenda.html', '/agenda.js',
    '/calendar-planner.html', '/calendar-planner.js', '/calendar-planner.css',
    '/fullcalendar.min.js', '/fullcalendar.min.css',
    '/fullcalendar-daygrid.min.js',
    '/fullcalendar-timegrid.min.js',
    '/fullcalendar-interaction.min.js',
    '/kanban.html', '/add.html', '/about.html',
    '/manifest.json', '/logo.svg', '/logo-192.png', '/logo-512.png',
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    // Delete stale caches. No clients.claim() — avoids invalidating in-flight
    // fetch Responses on the current page when the SW activates after --clean.
    // New SW takes effect on next navigation.
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    );
});

self.addEventListener('fetch', e => {
    // API calls (including SSE): always go direct to network.
    // Do NOT call e.respondWith() — bare return is correct here.
    // clients.claim() has been removed so there is no SW-activation race
    // that would invalidate in-flight responses.
    if (e.request.url.includes('/api/')) return;

    // App shell: cache-first, network fallback
    e.respondWith(
        caches.match(e.request)
            .then(cached => cached || fetch(e.request))
            .catch(() => fetch(e.request))
    );
});
