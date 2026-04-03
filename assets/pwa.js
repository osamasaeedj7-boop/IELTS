(function () {
    if (!("serviceWorker" in navigator)) {
        return;
    }

    window.addEventListener("load", function () {
        navigator.serviceWorker.register("service-worker.js?v=20260403", {
            scope: "./"
        }).catch(function () {
            return;
        });
    });
})();
