document.addEventListener("DOMContentLoaded", () => {
    const openHashTarget = () => {
        const hash = window.location.hash;

        if (!hash) return;

        const target = document.querySelector(hash);

        if (!target) return;

        // Jeśli hash wskazuje bezpośrednio na <details>
        if (target.tagName === "DETAILS") {
            target.open = true;
        }

        // Jeśli hash wskazuje element znajdujący się wewnątrz <details>
        const parentDetails = target.closest("details");
        if (parentDetails) {
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
