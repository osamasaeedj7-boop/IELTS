const CACHE_NAME = "ilets-pwa-v20260407";
const CORE_ASSETS = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./assets/pwa-icon-192.png",
    "./assets/pwa-icon-512.png",
    "./assets/apple-touch-icon.png",
    "./assets/platform.css",
    "./assets/platform.js",
    "./assets/lesson.css",
    "./assets/lesson.js",
    "./assets/pwa.js",
    "./assets/site-icon.svg"
];

self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(CORE_ASSETS);
        })
    );

    self.skipWaiting();
});

self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.map(function (key) {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }

                    return Promise.resolve();
                })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

function isSameOrigin(requestUrl) {
    return new URL(requestUrl).origin === self.location.origin;
}

self.addEventListener("fetch", function (event) {
    const request = event.request;

    if (request.method !== "GET" || !isSameOrigin(request.url)) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then(function (response) {
                    const responseClone = response.clone();

                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(request, responseClone);
                    });

                    return response;
                })
                .catch(function () {
                    return caches.match(request, { ignoreSearch: true }).then(function (cachedResponse) {
                        return cachedResponse || caches.match("./index.html");
                    });
                })
        );

        return;
    }

    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then(function (cachedResponse) {
            const networkFetch = fetch(request)
                .then(function (response) {
                    const responseClone = response.clone();

                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(request, responseClone);
                    });

                    return response;
                })
                .catch(function () {
                    return cachedResponse;
                });

            return cachedResponse || networkFetch;
        })
    );
});
