import { initSite } from "./site.js?v=20261004-pl-en";

document.addEventListener("DOMContentLoaded", () => {
    initSite();

    const answers = Array.from(document.querySelectorAll(".faq-topic .faq-answer"));
    const closeOtherAnswers = (current) => {
        answers.forEach((answer) => {
            if (answer !== current) answer.open = false;
        });
    };

    // Fallback for browsers without native support for grouped details.
    answers.forEach((answer) => {
        answer.addEventListener("toggle", () => {
            if (answer.open) closeOtherAnswers(answer);
        });
    });

    const openHashTarget = () => {
        const hash = window.location.hash;

        if (!hash) return;

        const target = document.querySelector(hash);

        if (!target) return;

        // Open the linked answer, including links to elements inside it.
        const parentDetails = target.closest("details");
        if (parentDetails) {
            if (answers.includes(parentDetails)) closeOtherAnswers(parentDetails);
            parentDetails.open = true;
        }

        // przewinięcie po otwarciu
        requestAnimationFrame(() => {
            target.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    };

    openHashTarget();

    // obsługa zmiany #hash bez przeładowania strony
    window.addEventListener("hashchange", openHashTarget);
});
