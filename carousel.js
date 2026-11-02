/** Owned, disposable horizontal gallery; no document handlers or host mutations. */
export function bindCarousel(root, initialScroll = 0) {
    const viewport = root.querySelector('.ue-carousel-viewport');
    const track = root.querySelector('.ue-carousel-track');
    const previous = root.querySelector('[data-direction="previous"]');
    const next = root.querySelector('[data-direction="next"]');
    const controller = new AbortController(); const { signal } = controller;
    let frame = 0, disposed = false, drag = null, suppressClick = false;
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const update = () => {
        frame = 0; if (disposed || !root.isConnected) return;
        const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        const before = viewport.scrollLeft > 2, after = viewport.scrollLeft < maximum - 2;
        root.dataset.overflow = String(maximum > 2);
        root.dataset.before = String(before); root.dataset.after = String(after);
        previous.hidden = next.hidden = maximum <= 2;
        previous.disabled = !before; next.disabled = !after;
    };
    const refresh = () => { if (!disposed && !frame) frame = requestAnimationFrame(update); };
    const step = direction => {
        viewport.scrollBy({ left: direction * Math.max(1, viewport.clientWidth * .8), behavior: reduced() ? 'instant' : 'smooth' });
    };
    previous.addEventListener('click', () => step(-1), { signal });
    next.addEventListener('click', () => step(1), { signal });
    viewport.addEventListener('scroll', refresh, { passive: true, signal });
    viewport.addEventListener('keydown', event => {
        if (event.target !== viewport || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Home' || event.key === 'End') viewport.scrollTo({ left: event.key === 'Home' ? 0 : viewport.scrollWidth, behavior: reduced() ? 'instant' : 'smooth' });
        else step(event.key === 'ArrowLeft' ? -1 : 1);
    }, { signal });
    // Mouse dragging complements native touch/trackpad scrolling. A drag never opens a card.
    viewport.addEventListener('pointerdown', event => {
        suppressClick = false;
        if (event.pointerType !== 'mouse' || event.button !== 0 || viewport.scrollWidth <= viewport.clientWidth + 2) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, scroll: viewport.scrollLeft, active: false };
    }, { signal });
    viewport.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id) return;
        const delta = event.clientX - drag.x;
        if (!drag.active) {
            if (Math.abs(delta) < 7 || Math.abs(delta) < Math.abs(event.clientY - drag.y)) return;
            drag.active = true; suppressClick = true; viewport.setPointerCapture(event.pointerId); viewport.classList.add('ue-dragging');
        }
        event.preventDefault(); viewport.scrollLeft = drag.scroll - delta;
    }, { signal });
    const endDrag = event => {
        if (!drag || event.pointerId !== drag.id) return;
        if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
        drag = null; viewport.classList.remove('ue-dragging'); refresh();
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(type, endDrag, { signal });
    viewport.addEventListener('click', event => {
        if (!suppressClick) return;
        suppressClick = false; event.preventDefault(); event.stopImmediatePropagation();
    }, { capture: true, signal });
    let resize, intersection;
    if (typeof ResizeObserver === 'function') { resize = new ResizeObserver(refresh); resize.observe(viewport); resize.observe(track); }
    if (typeof IntersectionObserver === 'function') intersection = new IntersectionObserver(entries => {
        for (const entry of entries) entry.target.style.setProperty('--ue-card-visibility', String(Math.min(1, .38 + entry.intersectionRatio * .85)));
    }, { root: viewport, threshold: [0, .15, .35, .6, .8, 1] });
    const observeCards = () => { track.querySelectorAll('.ue-card').forEach(card => intersection?.observe(card)); refresh(); };
    const restore = requestAnimationFrame(() => { if (!disposed) { viewport.scrollLeft = initialScroll; refresh(); } });
    observeCards();
    return {
        observeCards,
        dispose() {
            disposed = true; controller.abort(); resize?.disconnect(); intersection?.disconnect();
            cancelAnimationFrame(restore); if (frame) cancelAnimationFrame(frame);
            viewport.classList.remove('ue-dragging');
        },
    };
}
