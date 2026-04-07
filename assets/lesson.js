(function () {
    const body = document.body;
    const slides = Array.from(document.querySelectorAll(".slide"));

    if (!slides.length) {
        return;
    }

    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    const counter = document.getElementById("slide-counter");
    const progressBar = document.getElementById("progress-bar");
    const touchArea = document.getElementById("touch-area");
    const downloadBtn = document.getElementById("download-btn");
    const statusText = document.getElementById("lesson-status");

    const lessonId =
        body.dataset.lessonId ||
        document.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const totalSlides = slides.length;
    const lastSlideIndex = totalSlides - 1;
    const completionKey = "ilets:" + lessonId + ":completed";
    const lastSlideKey = "ilets:" + lessonId + ":last-slide";
    const TRANSLATION_CACHE_KEY = "ilets_lesson_tr_cache_v1";
    const translationCache = new Map();
    const translationRequests = new Map();
    const prefetchedTranslationKeys = new Set();

    let touchStartX = 0;
    let touchStartY = 0;
    let currentSlide = getInitialSlide();
    let isComplete = readStorage(completionKey) === "true";

    function readStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            return;
        }
    }

    function normalizeWhitespace(text) {
        return String(text || "").replace(/\s+/g, " ").trim();
    }

    function normalizeTranslationKey(text) {
        return normalizeWhitespace(text).replace(/[’]/g, "'").toLowerCase();
    }

    function cleanupTranslation(text) {
        return normalizeWhitespace(text)
            .replace(/\s+([?.!,;:])/g, "$1")
            .replace(/,\s*\./g, ".");
    }

    function restoreTranslationCache() {
        try {
            const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);

            if (!raw) {
                return;
            }

            const parsed = JSON.parse(raw);
            Object.entries(parsed).forEach(function (entry) {
                const key = entry[0];
                const value = entry[1];

                if (value && typeof value.text === "string") {
                    translationCache.set(key, value);
                }
            });
        } catch (error) {
            return;
        }
    }

    function persistTranslationCache() {
        try {
            localStorage.setItem(
                TRANSLATION_CACHE_KEY,
                JSON.stringify(Object.fromEntries(translationCache))
            );
        } catch (error) {
            return;
        }
    }

    function setTranslationEntry(source, translated, sourceType) {
        const key = normalizeTranslationKey(source);
        const cleanText = cleanupTranslation(translated);

        if (!key || !cleanText) {
            return cleanText;
        }

        translationCache.set(key, {
            text: cleanText,
            source: sourceType || "local",
        });
        persistTranslationCache();
        return cleanText;
    }

    function getTranslationEntry(source) {
        return translationCache.get(normalizeTranslationKey(source));
    }

    [
        ["IELTS Speaking", "IELTS Konuşma"],
        ["Course Home", "Kurs Ana Sayfası"],
        ["Example:", "Örnek:"],
        ["Examples:", "Örnekler:"],
        ["Good phrases:", "İyi ifadeler:"],
        ["Weak Answer", "Zayıf Cevap"],
        ["Better Answer", "Daha İyi Cevap"],
        ["Review", "Tekrar"],
        ["Review: The 5 Rules", "Tekrar: 5 Kural"],
        ["Main Goals", "Ana Hedefler"],
        ["Say:", "Şöyle deyin:"]
    ].forEach(function (entry) {
        setTranslationEntry(entry[0], entry[1], "provided");
    });

    function getImmediateTranslation(text) {
        const cached = getTranslationEntry(text);

        if (cached && cached.text) {
            return cached.text;
        }

        const normalized = normalizeWhitespace(text);

        if (!normalized) {
            return "";
        }

        const patterns = [
            [
                /^Lesson\s+(\d+)\s*:\s*(.+)$/i,
                function (match, number, rest) {
                    return "Ders " + number + ": " + rest;
                },
            ],
            [
                /^Lesson\s+(\d+)$/i,
                function (match, number) {
                    return "Ders " + number;
                },
            ],
            [
                /^Rule\s+(\d+)\s*:\s*(.+)$/i,
                function (match, number, rest) {
                    return "Kural " + number + ": " + rest;
                },
            ],
        ];

        for (let index = 0; index < patterns.length; index += 1) {
            const pattern = patterns[index][0];
            const handler = patterns[index][1];

            if (pattern.test(normalized)) {
                return setTranslationEntry(
                    normalized,
                    handler.apply(null, normalized.match(pattern)),
                    "local"
                );
            }
        }

        return setTranslationEntry(normalized, normalized, "local");
    }

    async function fetchGoogleTranslation(text, signal) {
        const url =
            "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=" +
            encodeURIComponent(text);
        const response = await fetch(url, { signal: signal });

        if (!response.ok) {
            throw new Error("Google Translate failed with " + String(response.status));
        }

        const payload = await response.json();
        const translated = Array.isArray(payload && payload[0])
            ? payload[0]
                  .map(function (chunk) {
                      return Array.isArray(chunk) ? chunk[0] : "";
                  })
                  .join("")
            : "";

        return cleanupTranslation(translated);
    }

    async function fetchMyMemoryTranslation(text, signal) {
        const url =
            "https://api.mymemory.translated.net/get?q=" +
            encodeURIComponent(text) +
            "&langpair=en|tr";
        const response = await fetch(url, { signal: signal });

        if (!response.ok) {
            throw new Error("MyMemory failed with " + String(response.status));
        }

        const payload = await response.json();
        const translated = payload && payload.responseData
            ? payload.responseData.translatedText || ""
            : "";

        return cleanupTranslation(
            translated.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        );
    }

    async function requestLiveTranslation(text) {
        const normalized = normalizeWhitespace(text);

        if (!normalized) {
            return "";
        }

        const cached = getTranslationEntry(normalized);

        if (cached && cached.source !== "local") {
            return cached.text;
        }

        if (translationRequests.has(normalized)) {
            return translationRequests.get(normalized);
        }

        const requestPromise = (async function () {
            const providers = [fetchGoogleTranslation, fetchMyMemoryTranslation];

            for (let index = 0; index < providers.length; index += 1) {
                const controller = new AbortController();
                const timeoutId = window.setTimeout(function () {
                    controller.abort();
                }, 6000);

                try {
                    const translated = await providers[index](
                        normalized,
                        controller.signal
                    );
                    window.clearTimeout(timeoutId);

                    if (
                        translated &&
                        normalizeTranslationKey(translated) !==
                            normalizeTranslationKey(normalized)
                    ) {
                        return setTranslationEntry(normalized, translated, "remote");
                    }
                } catch (error) {
                    window.clearTimeout(timeoutId);
                }
            }

            return getImmediateTranslation(normalized);
        })().finally(function () {
            translationRequests.delete(normalized);
        });

        translationRequests.set(normalized, requestPromise);
        return requestPromise;
    }

    function shouldTranslateText(text) {
        const normalized = normalizeWhitespace(text);

        if (!normalized) {
            return false;
        }

        if (!/[A-Za-z]/.test(normalized)) {
            return false;
        }

        if (/^\d+(?:\s*\/\s*\d+)?$/.test(normalized)) {
            return false;
        }

        if (/^T\.?\s*Osama Saeed$/i.test(normalized)) {
            return false;
        }

        return true;
    }

    function formatTranslatedText(originalText, translatedText) {
        const leadingWhitespace = (originalText.match(/^\s*/) || [""])[0];
        const trailingWhitespace = (originalText.match(/\s*$/) || [""])[0];

        return leadingWhitespace + cleanupTranslation(translatedText) + trailingWhitespace;
    }

    function showTranslatedText(node, translatedText) {
        if (!translatedText) {
            return;
        }

        node.textContent = formatTranslatedText(
            node.dataset.translateOriginal || "",
            translatedText
        );
        node.classList.add("is-translated");
    }

    function restoreOriginalText(node) {
        node.textContent = node.dataset.translateOriginal || "";
        node.classList.remove("is-translated");
    }

    function isTouchTranslationMode() {
        return window.matchMedia("(hover: none), (pointer: coarse)").matches;
    }

    function clearActiveTranslations(exceptNode) {
        document.querySelectorAll(".lesson-hover-translate.is-translated").forEach(function (activeNode) {
            if (activeNode !== exceptNode) {
                restoreOriginalText(activeNode);
                activeNode.dataset.translateHover = "false";
            }
        });
    }

    function bindTranslationNode(node) {
        if (!node || node.dataset.translationBound === "true") {
            return;
        }

        node.dataset.translationBound = "true";

        node.addEventListener("mouseenter", function () {
            const source = node.dataset.translateSource || "";

            node.dataset.translateHover = "true";
            const cached = getTranslationEntry(source);

            if (cached && cached.text) {
                showTranslatedText(node, cached.text);
            }

            requestLiveTranslation(source).then(function (translated) {
                if (node.dataset.translateHover !== "true") {
                    return;
                }

                showTranslatedText(node, translated);
            });
        });

        node.addEventListener("mouseleave", function () {
            node.dataset.translateHover = "false";
            restoreOriginalText(node);
        });

        node.addEventListener("click", function (event) {
            const source = node.dataset.translateSource || "";

            if (!isTouchTranslationMode()) {
                return;
            }

            const shouldActivate = !node.classList.contains("is-translated");
            clearActiveTranslations(node);

            if (!shouldActivate) {
                node.dataset.translateHover = "false";
                restoreOriginalText(node);
                event.preventDefault();
                return;
            }

            node.dataset.translateHover = "true";
            const cached = getTranslationEntry(source);

            if (cached && cached.text) {
                showTranslatedText(node, cached.text);
            }

            requestLiveTranslation(source).then(function (translated) {
                if (node.dataset.translateHover !== "true") {
                    return;
                }

                showTranslatedText(node, translated);
            });

            event.preventDefault();
        });
    }

    function createTranslationNode(textNode) {
        if (!textNode || !textNode.parentNode) {
            return;
        }

        const originalText = textNode.textContent || "";
        const normalizedSource = normalizeWhitespace(originalText);

        if (!shouldTranslateText(normalizedSource)) {
            return;
        }

        const span = document.createElement("span");
        span.className = "lesson-hover-translate";
        span.dataset.translateOriginal = originalText;
        span.dataset.translateSource = normalizedSource;
        span.textContent = originalText;
        bindTranslationNode(span);
        textNode.parentNode.replaceChild(span, textNode);
    }

    function scanTranslationRoot(root) {
        if (!root) {
            return;
        }

        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function (node) {
                    const parent = node.parentElement;

                    if (!parent) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    if (
                        parent.closest(
                            ".lesson-watermark, .lesson-footer, script, style, noscript, svg, i, a, button, [data-no-translate]"
                        )
                    ) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    if (
                        parent.id === "slide-counter" ||
                        parent.id === "lesson-status" ||
                        parent.classList.contains("lesson-hover-translate")
                    ) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return shouldTranslateText(node.textContent)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                },
            }
        );

        const textNodes = [];

        while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
        }

        textNodes.forEach(createTranslationNode);
    }

    function initializeLessonTranslations() {
        restoreTranslationCache();

        document
            .querySelectorAll(".lesson-header h1, .lesson-header p, .slide")
            .forEach(scanTranslationRoot);
    }

    function prefetchTranslation(source) {
        const normalized = normalizeWhitespace(source);

        if (!normalized || prefetchedTranslationKeys.has(normalized)) {
            return;
        }

        prefetchedTranslationKeys.add(normalized);
        requestLiveTranslation(normalized);
    }

    function prefetchTranslationsForCurrentSlide() {
        const targets = Array.from(
            document.querySelectorAll(
                ".lesson-header .lesson-hover-translate, .slide.active .lesson-hover-translate"
            )
        );

        targets.forEach(function (node) {
            prefetchTranslation(node.dataset.translateSource || "");
        });
    }

    document.addEventListener("click", function (event) {
        if (!isTouchTranslationMode()) {
            return;
        }

        if (event.target.closest(".lesson-hover-translate")) {
            return;
        }

        clearActiveTranslations();
    });

    function clampSlide(index) {
        return Math.max(0, Math.min(index, lastSlideIndex));
    }

    function parseHash() {
        const match = window.location.hash.match(/slide-(\d+)/i);

        if (!match) {
            return null;
        }

        return clampSlide(Number(match[1]) - 1);
    }

    function getInitialSlide() {
        const slideFromHash = parseHash();

        if (slideFromHash !== null) {
            return slideFromHash;
        }

        const storedSlide = Number(readStorage(lastSlideKey));

        if (Number.isFinite(storedSlide)) {
            return clampSlide(storedSlide);
        }

        return 0;
    }

    function markComplete() {
        if (isComplete) {
            return;
        }

        isComplete = true;
        writeStorage(completionKey, "true");
    }

    function updateHash() {
        const nextHash = "#slide-" + String(currentSlide + 1);

        if (window.location.hash !== nextHash) {
            try {
                history.replaceState(null, "", nextHash);
            } catch (error) {
                window.location.hash = nextHash;
            }
        }
    }

    function updateStatus(unlocked) {
        if (!statusText) {
            return;
        }

        if (unlocked) {
            statusText.textContent =
                "Ready to save as PDF. Open the print dialog and choose Save as PDF.";
            return;
        }

        statusText.textContent =
            "Finish the lesson to unlock PDF export (" +
            String(currentSlide + 1) +
            "/" +
            String(totalSlides) +
            ").";
    }

    function updateButtons(unlocked) {
        if (prevBtn) {
            prevBtn.disabled = currentSlide === 0;
        }

        if (nextBtn) {
            nextBtn.disabled = currentSlide === lastSlideIndex;
            nextBtn.innerHTML =
                currentSlide === lastSlideIndex
                    ? 'Completed <i class="fas fa-check ml-2"></i>'
                    : 'Next <i class="fas fa-arrow-right ml-2"></i>';
        }

        if (downloadBtn) {
            downloadBtn.hidden = !unlocked;
            downloadBtn.disabled = !unlocked;
        }
    }

    function updateUI() {
        slides.forEach(function (slide, index) {
            slide.classList.toggle("active", index === currentSlide);
        });

        if (currentSlide === lastSlideIndex) {
            markComplete();
        }

        const unlocked = isComplete || currentSlide === lastSlideIndex;
        body.classList.toggle("lesson-complete", unlocked);

        if (counter) {
            counter.textContent =
                String(currentSlide + 1) + " / " + String(totalSlides);
        }

        if (progressBar) {
            progressBar.style.width =
                String(((currentSlide + 1) / totalSlides) * 100) + "%";
        }

        updateButtons(unlocked);
        updateStatus(unlocked);
        writeStorage(lastSlideKey, String(currentSlide));
        updateHash();
        prefetchTranslationsForCurrentSlide();
    }

    function goToSlide(index) {
        currentSlide = clampSlide(index);
        updateUI();
    }

    function nextSlide() {
        if (currentSlide < lastSlideIndex) {
            currentSlide += 1;
            updateUI();
        }
    }

    function prevSlide() {
        if (currentSlide > 0) {
            currentSlide -= 1;
            updateUI();
        }
    }

    function handleKeydown(event) {
        if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }

        switch (event.key) {
            case "ArrowRight":
            case "PageDown":
                event.preventDefault();
                nextSlide();
                break;
            case "ArrowLeft":
            case "PageUp":
                event.preventDefault();
                prevSlide();
                break;
            case "Home":
                event.preventDefault();
                goToSlide(0);
                break;
            case "End":
                event.preventDefault();
                goToSlide(lastSlideIndex);
                break;
            default:
                break;
        }
    }

    function handleSwipe(endX, endY) {
        const distanceX = endX - touchStartX;
        const distanceY = endY - touchStartY;

        if (Math.abs(distanceX) < 50 || Math.abs(distanceX) <= Math.abs(distanceY)) {
            return;
        }

        if (distanceX < 0) {
            nextSlide();
            return;
        }

        prevSlide();
    }

    if (prevBtn) {
        prevBtn.addEventListener("click", prevSlide);
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", nextSlide);
    }

    if (downloadBtn) {
        downloadBtn.addEventListener("click", function () {
            window.print();
        });
    }

    document.addEventListener("keydown", handleKeydown);

    window.addEventListener("hashchange", function () {
        const slideFromHash = parseHash();

        if (slideFromHash !== null) {
            goToSlide(slideFromHash);
        }
    });

    if (touchArea) {
        touchArea.addEventListener(
            "touchstart",
            function (event) {
                const touch = event.changedTouches[0];
                touchStartX = touch.screenX;
                touchStartY = touch.screenY;
            },
            { passive: true }
        );

        touchArea.addEventListener(
            "touchend",
            function (event) {
                const touch = event.changedTouches[0];
                handleSwipe(touch.screenX, touch.screenY);
            },
            { passive: true }
        );
    }

    initializeLessonTranslations();
    updateUI();
})();
