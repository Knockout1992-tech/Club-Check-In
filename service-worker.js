
const CACHE_NAME = "club-check-in-v043";

const APP_SHELL = [
    "./",
    "./manifest.json"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key =>
                        key.startsWith("club-check-in-") &&
                        key !== CACHE_NAME
                    )
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);
    const scope = new URL(self.registration.scope);

    if (
        request.method !== "GET" ||
        url.origin !== scope.origin ||
        !url.pathname.startsWith(scope.pathname)
    ) {
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok) {
                    const copy = response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(request, copy));
                }

                return response;
            })
            .catch(async () => {
                const cached = await caches.match(request);

                if (cached) return cached;

                if (request.mode === "navigate") {
                    return await caches.match("./");
                }

                return new Response(
                    "Offline — this file is not cached.",
                    { status: 503 }
                );
            })
    );
});
