const PREVIEW_MARKER = 'data-insta-carousel-preview';

export function countHtmlCarouselSlides(html: string): number {
    if (!html) return 1;

    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.querySelectorAll('.slide').length || 1;
    } catch {
        return 1;
    }
}

/**
 * Makes an HTML carousel preview match the 420x525 export canvas.
 * The source template is kept intact; a small override is appended so legacy
 * templates and generated HTML share the same framing and slide activation.
 */
export function prepareHtmlCarouselPreview(html: string, slideIndex = 0): string {
    if (!html || html.includes(PREVIEW_MARKER)) return html;

    const total = countHtmlCarouselSlides(html);
    const safeIndex = Math.max(0, Math.min(slideIndex, total - 1));
    const override = `
<style ${PREVIEW_MARKER}>
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 420px !important;
  height: 525px !important;
  min-height: 525px !important;
  overflow: hidden !important;
  background: transparent !important;
  transform-origin: top left !important;
}
body { display: block !important; }
.carousel-wrap, .carousel-wrapper, .ig-frame, .carousel-viewport, #viewport {
  width: 420px !important;
  height: 525px !important;
  max-width: none !important;
  margin: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  overflow: hidden !important;
}
.carousel-track { width: 420px !important; height: 525px !important; transform: none !important; }
.slide { width: 420px !important; height: 525px !important; min-width: 420px !important; }
.ig-header, .ig-dots, .ig-actions, .ig-caption,
.nav-btn, .nav-prev, .nav-next, .progress-bar, .slide-counter,
.nav-dots, .bottom-bar .bb-swipe { display: none !important; }
</style>
<script ${PREVIEW_MARKER}>
(function () {
  function scaleCanvas() {
    var scale = Math.min(window.innerWidth / 420, window.innerHeight / 525);
    document.documentElement.style.transform = 'scale(' + Math.min(1, scale) + ')';
  }

  function fitWideText(scope) {
    var nodes = scope.querySelectorAll('h1, h2, h3, h4, p, span, li');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!(el.textContent || '').trim() || el.clientWidth < 1) continue;
      if (el.scrollWidth <= el.clientWidth + 1) continue;
      var initial = parseFloat(getComputedStyle(el).fontSize);
      if (!initial) continue;
      for (var guard = 0; guard < 30 && el.scrollWidth > el.clientWidth + 1; guard++) {
        var current = parseFloat(getComputedStyle(el).fontSize);
        var next = current - Math.max(1, current * 0.04);
        if (next < initial * 0.6) break;
        el.style.fontSize = next + 'px';
      }
    }
  }

  function activate() {
    scaleCanvas();
    var slides = document.querySelectorAll('.slide');
    var track = document.querySelector('.carousel-track');
    if (track) {
      track.style.transition = 'none';
      track.style.transform = 'none';
    }
    for (var i = 0; i < slides.length; i++) {
      var slide = slides[i];
      if (i === ${safeIndex}) {
        slide.classList.add('active');
        slide.classList.remove('exit');
        slide.style.removeProperty('display');
        slide.style.opacity = '1';
        fitWideText(slide);
      } else {
        slide.classList.remove('active', 'exit');
        slide.style.display = 'none';
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate);
  else activate();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(activate);
  window.addEventListener('resize', scaleCanvas);
})();
<\/script>`;

    if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${override}</body>`);
    return `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}${override}</body></html>`;
}
