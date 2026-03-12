(function () {
    const lessonCards = Array.from(
        document.querySelectorAll(".lesson-card[data-lesson-id]")
    );

    if (!lessonCards.length) {
        return;
    }

    const totalLessons = lessonCards.length;
    let completedLessons = 0;

    function readStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function setText(id, value) {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = value;
        }
    }

    function setActionLabel(action, label) {
        action.innerHTML = label + ' <i class="fas fa-arrow-right ml-2"></i>';
    }

    lessonCards.forEach(function (card) {
        const lessonId = card.dataset.lessonId;
        const badge = card.querySelector('[data-role="badge"]');
        const status = card.querySelector('[data-role="status"]');
        const action = card.querySelector('[data-role="action"]');
        const completionKey = "ilets:" + lessonId + ":completed";
        const lastSlideKey = "ilets:" + lessonId + ":last-slide";
        const isComplete = readStorage(completionKey) === "true";
        const lastSlide = Number(readStorage(lastSlideKey));
        const hasProgress = Number.isFinite(lastSlide) && lastSlide > 0;

        if (action && Number.isFinite(lastSlide)) {
            const baseHref = action.getAttribute("href").split("#")[0];
            action.setAttribute("href", baseHref + "#slide-" + String(lastSlide + 1));
        }

        if (isComplete) {
            completedLessons += 1;
            card.classList.add("is-complete");

            if (badge) {
                badge.dataset.state = "complete";
                badge.textContent = "Completed";
            }

            if (status) {
                status.textContent = "You have finished this lesson.";
            }

            if (action) {
                setActionLabel(action, "Review Lesson");
            }

            return;
        }

        if (hasProgress) {
            if (status) {
                status.textContent =
                    "Continue from where you stopped (slide " +
                    String(lastSlide + 1) +
                    ").";
            }

            if (action) {
                setActionLabel(action, "Continue Lesson");
            }
        }
    });

    setText("completed-count", String(completedLessons));
    setText(
        "course-progress-label",
        String(completedLessons) +
            " of " +
            String(totalLessons) +
            " lessons completed"
    );

    const progressBar = document.getElementById("course-progress-bar");

    if (progressBar) {
        progressBar.style.width = String((completedLessons / totalLessons) * 100) + "%";
    }
})();
