/*
  Renders content.json and photos.json into the page, then layers motion on top.
  If GSAP/Lenis fail to load, or the visitor prefers reduced motion, the page
  still renders and works, just without the animation.
*/
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = !reduceMotion && 'gsap' in window && 'ScrollTrigger' in window;

  const PHOTO_DIR = 'assets/gallery';
  const MARQUEE_SPEED = 90; // px per second when the page is still

  let content = {};
  let lenis = null;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const slot = (name) => $(`[data-slot="${name}"]`);
  const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const ui = (key) => get(content, `ui.${key}`) ?? '';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  // *words* get the accent colour, \n becomes a line break
  const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');

  const STAR = '<svg class="marquee__sep" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>';

  // Cartoon glove that slaps the photo sticker on. Drawn twice: a thick ink pass, then a
  // cream fill on top, which leaves one clean outline around the whole hand.
  // (The custom cursor reuses the same drawing over the photo, with its own id.)
  const glove = (id, className = '') => `<svg class="${className}" viewBox="0 0 200 250" aria-hidden="true">
    <defs><g id="${id}">
      <rect x="47" y="34" width="30" height="100" rx="15" transform="rotate(-7 62 125)"/>
      <rect x="81" y="20" width="30" height="110" rx="15"/>
      <rect x="115" y="28" width="30" height="102" rx="15" transform="rotate(5 130 125)"/>
      <rect x="147" y="56" width="26" height="80" rx="13" transform="rotate(13 160 130)"/>
      <rect x="40" y="110" width="30" height="90" rx="15" transform="rotate(-33 55 190)"/>
      <rect x="44" y="96" width="128" height="112" rx="48"/>
      <rect x="52" y="196" width="112" height="48" rx="13"/>
    </g></defs>
    <use href="#${id}" class="hand__outline"/>
    <use href="#${id}" class="hand__fill"/>
    <path class="hand__lines" d="M84 148v30M108 144v34M132 148v30M58 213h100"/>
  </svg>`;
  const HAND = `<span class="hand">${glove('hand-glove')}</span>`;

  // Comic "impact" lines that flash around the sticker when it lands.
  const BURST = `<span class="burst"><svg viewBox="-80 -80 160 160" aria-hidden="true">${
    Array.from({ length: 8 }, (_, i) => {
      const a = ((i * 45 + 22.5) * Math.PI) / 180;
      const at = (r) => `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
      return `<path d="M${at(60)}L${at(75)}"/>`;
    }).join('')
  }</svg></span>`;

  start();

  async function start() {
    let photos = [];
    try {
      const [c, p] = await Promise.all([
        loadJSON('content.json'),
        loadJSON('photos.json').catch(() => null),
      ]);
      content = c;
      photos = normalisePhotos(p);
    } catch (err) {
      console.error(err);
      showLoadError();
      return;
    }

    render(photos);
    initTheme();
    initHeader();
    initProjects();
    initCopy();
    initFooter();
    if (photos.length) initGallery();

    if (motion) {
      gsap.registerPlugin(ScrollTrigger);
      initSmoothScroll();
      initCursor();
      const intro = prepareHero();
      prepareReveals();
      await fontsReady();
      intro.play();
    }
    fitWordmark();
    initMarquee();
    if (motion) ScrollTrigger.refresh();
  }

  function loadJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then((res) => {
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return res.json();
    });
  }

  function normalisePhotos(data) {
    const list = Array.isArray(data) ? data : data?.photos;
    return (list || []).filter((p) => p && p.id && p.w && p.h);
  }

  function fontsReady() {
    const timeout = new Promise((resolve) => setTimeout(resolve, 1200));
    return Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), timeout]);
  }

  function showLoadError() {
    const p = document.createElement('p');
    p.className = 'load-error';
    p.textContent = "Couldn't load content.json. Open this folder with Live Server (or any local web server): browsers block it when you double-click index.html.";
    $('#main').replaceChildren(p);
  }


  /* ---------------- Render ---------------- */

  function render(photos) {
    $$('[data-text]').forEach((el) => { el.textContent = get(content, el.dataset.text) ?? ''; });
    $$('[data-rich]').forEach((el) => { el.innerHTML = rich(get(content, el.dataset.rich)); });

    renderHero();

    slot('about').innerHTML = (content.about?.lines || [])
      .map((line) => `<p data-reveal="words">${rich(line)}</p>`)
      .join('');

    slot('work').innerHTML = (content.work?.items || []).map((job) => `
      <li class="job" data-reveal="fade">
        <p class="job__title">${esc(job.role)} <span class="job__at">${esc(ui('at'))}</span> ${esc(job.company)}</p>
        <p class="job__dates">${esc(job.dates)}</p>
      </li>`).join('');

    const roles = content.roles?.items || [];
    slot('roles-list').innerHTML = roles.map((r) => `<li>${esc(r)}</li>`).join('');
    slot('roles').innerHTML = `<div class="marquee__group">${
      roles.map((r) => `<span class="marquee__item">${esc(r)}</span>${STAR}`).join('')
    }</div>`;
    const caption = content.roles?.caption;
    $$('.marquee__row--caption').forEach((row) => {
      if (!caption) {
        row.remove();
        return;
      }
      $('.marquee__track', row).innerHTML = `<div class="marquee__group"><span class="marquee__caption">${esc(caption)}</span>${STAR}</div>`;
    });

    slot('skills').innerHTML = (content.skills?.groups || []).map((group) => `
      <li class="skill-group" data-reveal="fade">
        <h3 class="skill-group__title">${esc(group.title)}</h3>
        <ul class="skill-group__items">${(group.items || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      </li>`).join('');

    // Featured projects first, then the "earlier" ones under their own smaller heading.
    const projects = content.projects?.items || [];
    const featured = projects.filter((p) => !p.earlier);
    const earlier = projects.filter((p) => p.earlier);
    slot('projects').innerHTML = featured.map((p, i) => renderProject(p, i)).join('')
      + (earlier.length
        ? `<li class="projects__group" data-reveal="fade"><h3 class="projects__group-label">${esc(content.projects.earlierLabel || '')}</h3></li>`
          + earlier.map((p, i) => renderProject(p, featured.length + i)).join('')
        : '');

    renderGallery(photos);

    const email = content.contact?.email || '';
    const mail = slot('email');
    mail.href = `mailto:${email}`;
    mail.textContent = email;

    slot('contact-links').innerHTML = (content.contact?.links || [])
      .filter((link) => link.url)
      .map((link) => `<li><a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)} ↗</a></li>`)
      .join('');

    renderFooter();
    root.classList.add('is-rendered');
  }

  function renderHero() {
    const hero = content.hero || {};

    // Shown visually as the #OPENTOWORK frame on the photo; this copy is for screen readers.
    slot('status').textContent = hero.status || '';

    slot('name').innerHTML = String(content.name || '')
      .split(/\s+/)
      .map((word) => `<span class="hero__word">${esc(word)}</span>`)
      .join(' ');

    if (hero.photo) {
      const sticker = slot('sticker');
      sticker.hidden = false;
      sticker.innerHTML = `<span class="sticker__face"><img src="${esc(hero.photo)}" alt="${esc(content.name)}" width="200" height="200" decoding="async">${hero.badge ? photoBadge(hero.badge) : ''}</span>${BURST}${HAND}`;
    }

    slot('hero-buttons').innerHTML = (hero.buttons || [])
      .filter((button) => button.url)
      .map((button, i) => {
        const external = !button.url.startsWith('#');
        return `<a class="btn${i === 0 ? ' btn--primary' : ''}" href="${esc(button.url)}"${external ? ' target="_blank" rel="noopener"' : ''}>${esc(button.label)}</a>`;
      })
      .join('');
  }

  function renderFooter() {
    const footer = content.footer || {};

    if (content.hero?.status) {
      const status = slot('footer-status');
      status.hidden = false;
      // The site's ✳ star (as in the roles strips) instead of a "live" dot.
      status.innerHTML = `${STAR.replace('marquee__sep', 'footer__star')}${esc(content.hero.status)}`;
    }

    const email = content.contact?.email;
    const links = [
      ...(email ? [{ label: ui('email'), url: `mailto:${email}` }] : []),
      ...(content.contact?.links || []),
    ].filter((link) => link.url);
    slot('footer-links').innerHTML = links.map((link) => {
      const external = !link.url.startsWith('mailto:');
      const handle = link.handle ? `<small class="footer__handle">${esc(link.handle)}</small>` : '';
      return `<li><a href="${esc(link.url)}"${external ? ' target="_blank" rel="noopener me"' : ''}>${esc(link.label)}${external ? ' ↗' : ''}${handle}</a></li>`;
    }).join('');

    slot('copyright').textContent = String(footer.copyright || '').replace('{year}', new Date().getFullYear());
    slot('wordmark').innerHTML = String(content.name || '')
      .split(/\s+/)
      .map((word) => `<span class="footer__word">${esc(word)}</span>`)
      .join(' ');
  }

  // LinkedIn-style "#OPENTOWORK" frame: a thick arc around the bottom of the photo that fades
  // out on the right, with the text running along the curve. Drawn on a 100x100 grid, where the
  // photo is the circle of radius 50; the band covers radius 36-50.
  function photoBadge(text) {
    return `<svg class="sticker__badge" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="badge-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
          <stop offset=".55" class="sticker__badge-stop"/>
          <stop offset=".88" class="sticker__badge-stop" stop-opacity="0"/>
        </linearGradient>
        <path id="badge-text-path" d="M8.67 30.73A45.6 45.6 0 0 0 84.93 79.31"/>
      </defs>
      <path class="sticker__badge-band" d="M13.53 27.21A43 43 0 1 0 92.58 55.98" stroke="url(#badge-fade)"/>
      <text class="sticker__badge-text"><textPath href="#badge-text-path" startOffset="39%" text-anchor="middle">${esc(text)}</textPath></text>
    </svg>`;
  }

  function renderProject(project, i) {
    const id = `project-${i}`;
    const tags = (project.tags || []).map((t) => `<li>${esc(t)}</li>`).join('');
    const links = (project.links || [])
      .filter((link) => link.url)
      .map((link) => `<a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)} ↗</a>`)
      .join('');
    const image = project.image
      ? `<figure class="project__media"><img src="${esc(project.image)}" alt="${esc(project.imageAlt || '')}" width="1600" height="1000" loading="lazy" decoding="async"></figure>`
      : '';

    return `
      <li class="project${project.earlier ? ' project--earlier' : ''}" data-reveal="fade">
        <h3>
          <button class="project__toggle" type="button" aria-expanded="false" aria-controls="${id}">
            <span class="project__title">${esc(project.title)}</span>
            <span class="project__line">${esc(project.line)}</span>
            <span class="project__icon" aria-hidden="true"></span>
          </button>
        </h3>
        <div class="project__panel" id="${id}" role="region" aria-label="${esc(project.title)}" inert>
          <div class="project__panel-inner">
            <div class="project__content">
              <div>
                <p class="project__desc">${rich(project.description)}</p>
                ${tags ? `<ul class="tags">${tags}</ul>` : ''}
                ${links ? `<p class="project__links">${links}</p>` : ''}
              </div>
              ${image}
            </div>
          </div>
        </div>
      </li>`;
  }

  function renderGallery(photos) {
    const section = $('#gallery');
    const isLocal = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);

    if (!photos.length) {
      if (isLocal) {
        // Only you see this while previewing; the live site just hides the section.
        section.hidden = false;
        $('.gallery', section).outerHTML = `<div class="wrap"><p class="gallery-empty">${esc(content.gallery?.empty)}</p></div>`;
      } else {
        $$('[data-gallery-link]').forEach((el) => el.remove());
      }
      return;
    }

    section.hidden = false;
    const touch = matchMedia('(hover: none)').matches;
    slot('gallery-hint').textContent = (touch && content.gallery?.hintTouch) || content.gallery?.hint || '';
    slot('gallery').innerHTML = photos.map((photo, i) => `
      <li class="gallery__item">
        <img src="${PHOTO_DIR}/thumb/${esc(photo.id)}.webp" alt="${esc(photo.caption || '')}" width="${photo.w}" height="${photo.h}" loading="lazy" decoding="async" draggable="false">
      </li>`).join('');
  }


  /* ---------------- Theme ---------------- */

  function initTheme() {
    const button = $('.theme-toggle');
    const themeColor = $('meta[name="theme-color"]');
    const systemDark = matchMedia('(prefers-color-scheme: dark)');

    const sync = () => {
      const dark = root.dataset.theme === 'dark';
      button.setAttribute('aria-label', dark ? ui('themeToLight') : ui('themeToDark'));
      themeColor.content = getComputedStyle(root).getPropertyValue('--bg').trim();
    };

    const apply = (theme, remember) => {
      root.dataset.theme = theme;
      if (remember) {
        try { localStorage.setItem('theme', theme); } catch { /* private mode */ }
      }
      sync();
    };

    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      if (!document.startViewTransition || reduceMotion) {
        apply(next, true);
        return;
      }
      // New theme grows out of the button as a circle.
      const r = button.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const transition = document.startViewTransition(() => apply(next, true));
      transition.ready.then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 700, easing: 'cubic-bezier(.7, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      }).catch(() => {});
    });

    // Follow the OS setting until the visitor picks a theme themselves.
    systemDark.addEventListener('change', (e) => {
      let saved = null;
      try { saved = localStorage.getItem('theme'); } catch { /* ignore */ }
      if (!saved) apply(e.matches ? 'dark' : 'light', false);
    });

    sync();
  }


  /* ---------------- Header: hides on the way down, returns on the way up ---------------- */

  function initHeader() {
    const header = $('.site-header');
    let lastY = scrollY;
    let queued = false;

    const update = () => {
      const y = scrollY;
      header.classList.toggle('is-scrolled', y > 10);
      if (Math.abs(y - lastY) > 4) {
        header.classList.toggle('is-hidden', y > lastY && y > innerHeight * 0.5);
        lastY = y;
      }
      queued = false;
    };

    addEventListener('scroll', () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }


  /* ---------------- Footer ---------------- */

  function initFooter() {
    // Live local time, e.g. "2:32 PM IST".
    const clock = slot('clock');
    const zone = content.footer?.timezone;
    if (clock && zone) {
      try {
        const format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
        const label = content.footer.timezoneLabel ? ` ${content.footer.timezoneLabel}` : '';
        const tick = () => { clock.textContent = format.format(new Date()) + label; };
        tick();
        setInterval(tick, 30000);
      } catch { /* unknown time zone: leave it blank */ }
    }

    // The footer is pinned underneath the page (revealed as the page lifts off it),
    // but only while it fits on screen; a taller footer just scrolls normally.
    const footer = $('.site-footer');
    const checkFit = () => footer.classList.toggle('is-tall', footer.offsetHeight > innerHeight);
    checkFit();
    new ResizeObserver(checkFit).observe(footer);
    addEventListener('resize', checkFit);

    // If a keyboard user tabs into the footer early, jump to the end so they can see where they are.
    // (Keyboard focus only: tapping a footer link on a phone must not jump the page.)
    footer.addEventListener('focusin', (e) => {
      if (!e.target.matches(':focus-visible')) return;
      const end = document.documentElement.scrollHeight - innerHeight;
      if (scrollY >= end - 2) return;
      if (lenis) lenis.scrollTo(end, { immediate: true });
      else window.scrollTo(0, end);
    });
  }

  // Sizes the giant name so it spans the footer exactly, on any screen and with any font.
  function fitWordmark() {
    const box = $('.footer__wordmark');
    const inner = slot('wordmark');
    const fit = () => {
      const style = getComputedStyle(box);
      const available = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (!available) return;
      inner.style.fontSize = '100px';
      const natural = inner.getBoundingClientRect().width;
      if (natural) inner.style.fontSize = `${Math.floor((10000 * available) / natural) / 100}px`;
    };
    fit();
    // Refit when the screen resizes or the web font arrives (both change the width).
    // Refitting to the same size changes nothing, so this settles after one pass.
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    observer.observe(inner);
    document.fonts?.addEventListener('loadingdone', fit);
  }


  /* ---------------- Projects: expand on click ---------------- */

  function initProjects() {
    $$('.project__toggle').forEach((button) => {
      const item = button.closest('.project');
      const panel = document.getElementById(button.getAttribute('aria-controls'));

      button.addEventListener('click', () => {
        const open = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(open));
        item.classList.toggle('is-open', open);
        panel.inert = !open;
      });

      // Page height changed, so scroll-triggered animations below need new positions.
      panel.addEventListener('transitionend', (e) => {
        if (motion && e.target === panel && e.propertyName === 'grid-template-rows') ScrollTrigger.refresh();
      });
    });
  }


  /* ---------------- Copy email ---------------- */

  function initCopy() {
    const button = $('.copy-btn');
    const email = content.contact?.email;
    if (!email) {
      button.remove();
      return;
    }
    let timer;
    button.addEventListener('click', async () => {
      if (!(await copyText(email))) return;
      button.textContent = ui('copied');
      button.classList.add('is-done');
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = ui('copy');
        button.classList.remove('is-done');
      }, 1800);
    });
  }

  // Modern clipboard API first; some phone in-app browsers (Instagram, LinkedIn...) block it,
  // so fall back to the older select-and-copy method.
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fall through */ }
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.append(field);
    field.select();
    field.setSelectionRange(0, text.length);
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* not supported */ }
    field.remove();
    return copied;
  }


  /* ---------------- Gallery: drag strip ---------------- */

  // The photos are only shown in the strip; they don't open anywhere.
  function initGallery() {
    enableDragScroll($('.gallery'));
  }

  // Mouse drag-to-scroll with a little momentum. Touch and trackpads scroll natively.
  function enableDragScroll(el) {
    let pointer = null;
    let startX = 0;
    let startScroll = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let dragged = false;
    let frame = 0;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      cancelAnimationFrame(frame);
      pointer = e.pointerId;
      dragged = false;
      startX = lastX = e.clientX;
      startScroll = el.scrollLeft;
      lastT = e.timeStamp;
      velocity = 0;
    });

    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointer) return;
      const dx = e.clientX - startX;
      if (!dragged) {
        if (Math.abs(dx) < 6) return;
        dragged = true;
        el.setPointerCapture(pointer);
        el.classList.add('is-dragging');
      }
      el.scrollLeft = startScroll - dx;
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (e.clientX - lastX) / dt;
      lastX = e.clientX;
      lastT = e.timeStamp;
    });

    const end = (e) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      el.classList.remove('is-dragging');
      if (!dragged || reduceMotion || e.timeStamp - lastT > 80) return;
      let v = velocity * 16; // px per frame
      const glide = () => {
        el.scrollLeft -= v;
        v *= 0.94;
        if (Math.abs(v) > 0.4) frame = requestAnimationFrame(glide);
      };
      frame = requestAnimationFrame(glide);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', () => cancelAnimationFrame(frame), { passive: true });
  }


  /* ---------------- Roles marquee ---------------- */

  function initMarquee() {
    const band = $('.marquee');
    // Each strip has its own track; data-direction and data-speed tune it relative to the rest.
    const rows = $$('.marquee__row', band)
      .map((row) => ({
        row,
        track: $('.marquee__track', row),
        group: $('.marquee__group', row),
        dir: Number(row.dataset.direction || 1),
        pace: Number(row.dataset.speed || 1),
        offset: Number(row.dataset.offset || 0), // start part-way through, so stacked strips don't line up
        width: 0,
        x: 0,
      }))
      .filter((r) => r.group);
    if (!rows.length) return;

    if (!motion) {
      band.classList.add('is-static');
      return;
    }

    let speed = 1;
    let scrollDir = 1;
    let hovering = false;
    let visible = true;

    // Repeat each group until it covers the band, so the loop never shows a gap.
    const fill = (r) => {
      $$('.marquee__group', r.track).slice(1).forEach((g) => g.remove());
      r.width = r.group.getBoundingClientRect().width;
      if (!r.width) return;
      const copies = Math.ceil(band.clientWidth / r.width) + 1;
      for (let i = 1; i < copies; i++) r.track.append(r.group.cloneNode(true));
    };
    rows.forEach((r) => {
      fill(r);
      r.x = -r.width * r.offset;
      const resize = new ResizeObserver(() => fill(r));
      resize.observe(r.row);
      resize.observe(r.group);
    });

    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(band);
    band.addEventListener('pointerenter', () => { hovering = true; });
    band.addEventListener('pointerleave', () => { hovering = false; });

    // Drifts on its own; speeds up with scroll velocity and follows the scroll direction.
    gsap.ticker.add((time, deltaMs) => {
      if (!visible) return;
      const velocity = lenis ? lenis.velocity : 0;
      if (lenis && lenis.direction) scrollDir = lenis.direction;
      const target = (hovering ? 0.25 : 1) + Math.min(Math.abs(velocity) * 0.12, 6);
      speed += (target - speed) * 0.06;
      rows.forEach((r) => {
        if (!r.width) return;
        r.x -= scrollDir * r.dir * r.pace * speed * MARQUEE_SPEED * (deltaMs / 1000);
        r.x %= r.width;
        if (r.x > 0) r.x -= r.width;
        r.track.style.transform = `translate3d(${r.x}px, 0, 0)`;
      });
    });
  }


  /* ---------------- Custom cursor ---------------- */

  // Mouse and trackpad only: phones and tablets keep their normal touch behaviour.
  // A dot that tracks the pointer exactly, a ring that trails it (stretching with speed),
  // and context states: bigger over links, a labelled bubble over projects and the gallery,
  // and the cartoon glove over the photo sticker.
  function initCursor() {
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const cursor = document.createElement('div');
    cursor.className = 'cursor is-hidden';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = `<div class="cursor__ring"><div class="cursor__shape"></div><span class="cursor__label"></span>${glove('cursor-glove', 'cursor__glove')}</div><div class="cursor__dot"></div>`;
    document.body.append(cursor);

    const ring = $('.cursor__ring', cursor);
    const shape = $('.cursor__shape', cursor);
    const label = $('.cursor__label', cursor);
    const dot = $('.cursor__dot', cursor);

    const setActive = () => root.classList.toggle('has-cursor', finePointer.matches);
    setActive();
    finePointer.addEventListener('change', setActive); // e.g. a mouse plugged into a tablet

    let x = -100;
    let y = -100;
    let ringX = x;
    let ringY = y;
    let seen = false;

    // What the cursor should look like over a given element.
    const stateFor = (el) => {
      if (!el?.closest) return { mode: '' };
      const tone = el.closest('.site-footer') ? 'dark' : el.closest('.marquee__row--roles') ? 'accent' : '';
      if (el.closest('.sticker')) return { mode: 'glove', tone };
      const project = el.closest('.project__toggle');
      if (project) return { mode: 'label', tone, text: ui(project.getAttribute('aria-expanded') === 'true' ? 'cursorClose' : 'cursorOpen') };
      if (el.closest('.gallery')) return { mode: 'label', tone, text: ui('cursorDrag') };
      if (el.closest('a, button, [role="button"], label')) return { mode: 'hover', tone };
      return { mode: '', tone };
    };
    const apply = (el) => {
      const state = stateFor(el);
      cursor.dataset.mode = state.mode;
      cursor.dataset.tone = state.tone || '';
      if (state.text) label.textContent = state.text;
    };

    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') {
        cursor.classList.add('is-hidden');
        return;
      }
      x = e.clientX;
      y = e.clientY;
      if (!seen) {
        ringX = x;
        ringY = y;
        seen = true;
      }
      cursor.classList.remove('is-hidden');
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }, { passive: true });

    document.addEventListener('pointerover', (e) => apply(e.target));
    document.documentElement.addEventListener('mouseleave', () => cursor.classList.add('is-hidden'));
    addEventListener('pointerdown', () => cursor.classList.add('is-down'));
    addEventListener('pointerup', () => {
      cursor.classList.remove('is-down');
      setTimeout(() => apply(document.elementFromPoint(x, y)), 0); // e.g. a project flips Open -> Close
    });

    // Content moves under a still pointer while scrolling, so re-check what's underneath.
    let queued = false;
    addEventListener('scroll', () => {
      if (queued || !seen) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        apply(document.elementFromPoint(x, y));
      });
    }, { passive: true });

    // Hide the glove while the real hand replays the slap.
    $('.sticker:not([hidden])')?.addEventListener('click', () => {
      cursor.classList.add('is-busy');
      setTimeout(() => cursor.classList.remove('is-busy'), 1600);
    });

    // The ring eases towards the pointer and stretches along its direction of travel.
    gsap.ticker.add(() => {
      if (!seen) return;
      const ease = 1 - Math.pow(1 - 0.2, gsap.ticker.deltaRatio());
      const dx = x - ringX;
      const dy = y - ringY;
      ringX += dx * ease;
      ringY += dy * ease;
      const stretch = Math.min(Math.hypot(dx, dy) / 150, 0.35);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
      shape.style.transform = `rotate(${angle}deg) scale(${1 + stretch}, ${1 - stretch * 0.5})`;
    });
  }


  /* ---------------- Motion ---------------- */

  function initSmoothScroll() {
    lenis = new Lenis({ lerp: 0.1, anchors: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Wraps every word in a mask so it can slide up into view. Returns the inner spans.
  function splitWords(el) {
    const words = [];
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
          return;
        }
        if (child.nodeType !== Node.TEXT_NODE) return;
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.append(' ');
            return;
          }
          const mask = document.createElement('span');
          const inner = document.createElement('span');
          mask.className = 'w';
          inner.className = 'w__i';
          inner.textContent = part;
          mask.append(inner);
          frag.append(mask);
          words.push(inner);
        });
        child.replaceWith(frag);
      });
    };
    walk(el);
    return words;
  }

  function prepareHero() {
    const nameWords = splitWords($('.hero__name'));
    const tagWords = splitWords($('.hero__tagline'));
    const sticker = $('.sticker:not([hidden])');
    const buttons = slot('hero-buttons');

    gsap.set(nameWords, { yPercent: 150, rotate: 5, transformOrigin: '0% 100%' });
    gsap.set(tagWords, { yPercent: 130 });
    gsap.set([buttons, '.site-header__inner'], { opacity: 0 });

    const intro = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } })
      .to(nameWords, { yPercent: 0, rotate: 0, duration: 1.6, stagger: 0.12 })
      .to(tagWords, { yPercent: 0, duration: 1.2, stagger: 0.035 }, 0.4)
      .to('.site-header__inner', { opacity: 1, duration: 1 }, 0.6)
      .fromTo(buttons, { y: 12 }, { opacity: 1, y: 0, duration: 1 }, 0.95);

    // Once the name has landed, a hand slaps the photo on like a sticker.
    // Clicking the photo later replays it.
    if (sticker) {
      gsap.set(sticker, { autoAlpha: 0 });
      intro.add(slapSticker(sticker), 0.8);

      let replay = null;
      sticker.style.cursor = 'pointer';
      sticker.addEventListener('click', () => {
        if (intro.isActive() || replay?.isActive()) return;
        replay = slapSticker(sticker);
      });
    }
    return intro;
  }

  function slapSticker(sticker) {
    const hand = $('.hand', sticker);
    const face = $('.sticker__face', sticker);
    const burst = $('.burst', sticker);
    const size = sticker.offsetWidth;

    // Tweens after the swoop wait for their turn (immediateRender: false) so nothing flashes early.
    return gsap.timeline()
      .set([hand, burst], { display: 'block' }, 0)
      .set(hand, { autoAlpha: 1, x: 0, y: 0, rotation: -35, scale: 1 }, 0)
      // Swoop in from the bottom-right, held up close (bigger, softer shadow).
      .fromTo(sticker,
        { autoAlpha: 1, x: innerWidth * 0.5, y: innerHeight * 0.45, scale: 1.45, rotation: 22 },
        { x: 0, y: -size * 0.12, scale: 1.28, rotation: 6, duration: 0.55, ease: 'power3.out' }, 0)
      .fromTo(face, { '--lift': 1 }, { '--lift': 0.7, duration: 0.55, ease: 'power3.out' }, 0)
      // Slap it down.
      .to(sticker, { y: 0, scale: 1, rotation: 0, duration: 0.13, ease: 'power4.in' })
      .to(face, { '--lift': 0, duration: 0.13, ease: 'power4.in' }, '<')
      .addLabel('impact')
      // Squash and wobble, impact lines, and a little shake of the name.
      .fromTo(sticker, { scaleX: 1.07, scaleY: 0.93 }, { scaleX: 1, scaleY: 1, duration: 0.6, ease: 'elastic.out(1, 0.35)', immediateRender: false }, 'impact')
      .fromTo(burst, { autoAlpha: 1, scale: 0.85 }, { autoAlpha: 0, scale: 1.2, duration: 0.45, ease: 'power2.out', immediateRender: false }, 'impact')
      .fromTo('.hero__name', { x: 0 }, { keyframes: { x: [-6, 5, -3, 1, 0] }, duration: 0.3, ease: 'none', immediateRender: false }, 'impact')
      // Let go: the hand lifts off and leaves.
      .to(hand, {
        x: size * 1.3, y: size * 1.1, rotation: -20, scale: 1.12, autoAlpha: 0, duration: 0.6, ease: 'power2.in',
      }, 'impact+=0.18')
      // Take them out of the layout again, so they can't widen the page while invisible.
      .set([hand, burst], { display: 'none' });
  }

  function prepareReveals() {
    // Word-by-word reveals (about lines, contact heading)
    $$('[data-reveal="words"]').forEach((el) => {
      gsap.from(splitWords(el), {
        yPercent: 120,
        duration: 1.1,
        ease: 'expo.out',
        stagger: 0.03,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });

    // Fade-and-rise for blocks, batched so neighbours stagger in together.
    // Opacity only (not visibility) so keyboard users can still tab to them.
    const fades = $$('[data-reveal="fade"], .section__label');
    gsap.set(fades, { opacity: 0, y: 28 });
    ScrollTrigger.batch(fades, {
      start: 'top 92%',
      once: true,
      onEnter: (batch) => gsap.to(batch, {
        opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09, overwrite: true,
      }),
    });

    // Footer: the giant name rises out of the bottom edge, letter by letter, as the page lifts off it.
    const letters = [];
    $$('.footer__word').forEach((word) => {
      const text = word.textContent;
      word.textContent = '';
      for (const char of text) {
        const span = document.createElement('span');
        span.className = 'footer__letter';
        span.textContent = char;
        word.append(span);
        letters.push(span);
      }
    });
    const footer = $('.site-footer');
    // Start position set separately, so letters that haven't risen yet stay hidden across refreshes.
    gsap.set(letters, { yPercent: 105 });
    gsap.to(letters, {
      yPercent: 0,
      ease: 'none',
      stagger: 0.05,
      scrollTrigger: {
        trigger: 'main',
        start: 'bottom bottom',
        end: () => `bottom bottom-=${footer.offsetHeight * 0.85}`,
        scrub: 0.6,
      },
    });

    const strip = $('.gallery__track');
    if (strip) {
      gsap.from(strip, {
        x: 120,
        opacity: 0,
        duration: 1.4,
        ease: 'expo.out',
        scrollTrigger: { trigger: strip, start: 'top 90%', once: true },
      });
    }
  }
})();
