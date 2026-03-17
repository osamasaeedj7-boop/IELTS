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

    const vocabDayLinks = Array.from(document.querySelectorAll(".vocab-day-link"));

    if (!vocabDayLinks.length) {
        return;
    }

    const vocabProgramKey = "ilets:vocab-program:start-date";
    const vocabDayCompletionPrefix = "ilets:vocab-day:";

    function getLocalMidnight(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function formatDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return year + "-" + month + "-" + day;
    }

    function parseDateKey(value) {
        const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

        if (!match) {
            return null;
        }

        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }

    function getConfiguredStartDate() {
        return parseDateKey(document.body.dataset.vocabStartDate);
    }

    function readProgramStartDate() {
        try {
            return parseDateKey(localStorage.getItem(vocabProgramKey));
        } catch (error) {
            return null;
        }
    }

    function readDayCompletion(dayNumber) {
        try {
            return localStorage.getItem(
                vocabDayCompletionPrefix + String(dayNumber) + ":completed"
            ) === "true";
        } catch (error) {
            return false;
        }
    }

    function writeProgramStartDate(value) {
        try {
            localStorage.setItem(vocabProgramKey, formatDateKey(value));
        } catch (error) {
            return;
        }
    }

    function addDays(date, offset) {
        const result = new Date(date);
        result.setDate(result.getDate() + offset);
        return getLocalMidnight(result);
    }

    function formatDisplayDate(date) {
        return new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        }).format(date);
    }

    function getProgramState(totalDays) {
        const today = getLocalMidnight(new Date());
        const configuredStartDate = getConfiguredStartDate();
        let startDate = configuredStartDate || readProgramStartDate();

        if (!startDate || startDate.getTime() > today.getTime()) {
            startDate = configuredStartDate || today;

            if (!configuredStartDate) {
                writeProgramStartDate(startDate);
            }
        }

        const dayDifference = Math.floor(
            (today.getTime() - startDate.getTime()) / 86400000
        );
        const activeDayNumber = Math.max(
            1,
            Math.min(totalDays, dayDifference + 1)
        );

        return {
            startDate: startDate,
            activeDayNumber: activeDayNumber
        };
    }

    const programState = getProgramState(vocabDayLinks.length);

    vocabDayLinks.forEach(function (link) {
        const url = new URL(link.href, window.location.href);
        const dayNumber = Number(url.searchParams.get("day"));
        const isComplete = readDayCompletion(dayNumber);
        const isUnlocked =
            Number.isFinite(dayNumber) && dayNumber <= programState.activeDayNumber;
        const isCurrentDay =
            Number.isFinite(dayNumber) && dayNumber === programState.activeDayNumber;
        const unlockDate = addDays(programState.startDate, Math.max(0, dayNumber - 1));

        if (isComplete) {
            link.classList.add("is-complete");
            link.classList.add("is-open");

            if (isCurrentDay) {
                link.classList.add("is-current");
                link.title = "Completed today";
                return;
            }

            link.title = "Completed";
            return;
        }

        if (isUnlocked) {
            link.classList.add("is-open");

            if (isCurrentDay) {
                link.classList.add("is-current");
                link.title = "Open today";
            } else {
                link.title = "Open";
            }

            return;
        }

        link.classList.add("is-locked");
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("tabindex", "-1");
        link.title = "Locked until " + formatDisplayDate(unlockDate);

        link.addEventListener("click", function (event) {
            event.preventDefault();
        });
    });
})();
