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

    updateUI();
})();
