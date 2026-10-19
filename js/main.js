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
  const MARQUEE_SPEED = 45; // px per second when the page is still

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
    initReadout();
    initProjects();
    initCopy();
    if (photos.length) initGallery(photos);

    if (motion) {
      gsap.registerPlugin(ScrollTrigger);
      initSmoothScroll();
      const intro = prepareHero();
      prepareReveals();
      await fontsReady();
      intro.play();
      ScrollTrigger.refresh();
    }
    initMarquee();
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

    slot('name').innerHTML = String(content.name || '')
      .split(/\s+/)
      .map((word) => `<span class="hero__word">${esc(word)}</span>`)
      .join(' ');

    const about = content.about || {};
    slot('about').innerHTML = (about.lines || [])
      .map((line) => `<p data-reveal="words">${rich(line)}</p>`)
      .join('');
    if (about.photo) {
      const avatar = slot('avatar');
      avatar.hidden = false;
      avatar.innerHTML = `<img src="${esc(about.photo)}" alt="${esc(content.name)}" width="200" height="200" loading="lazy" decoding="async">`;
    }

    slot('work').innerHTML = (content.work?.items || []).map((job) => `
      <li class="job" data-reveal="fade">
        <p class="job__title">${esc(job.role)} <span class="job__at">${esc(ui('at'))}</span> ${esc(job.company)}</p>
        <p class="job__dates">${esc(job.dates)}</p>
      </li>`).join('');

    const skills = content.skills?.items || [];
    slot('skills-list').innerHTML = skills.map((s) => `<li>${esc(s)}</li>`).join('');
    slot('skills').innerHTML = `<div class="marquee__group">${
      skills.map((s) => `<span class="marquee__item">${esc(s)}</span>${STAR}`).join('')
    }</div>`;

    slot('projects').innerHTML = (content.projects?.items || []).map(renderProject).join('');

    renderGallery(photos);

    const email = content.contact?.email || '';
    const mail = slot('email');
    mail.href = `mailto:${email}`;
    mail.textContent = email;

    slot('contact-links').innerHTML = (content.contact?.links || [])
      .filter((link) => link.url)
      .map((link) => `<li><a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)} ↗</a></li>`)
      .join('');

    slot('footer').textContent = String(content.footer || '').replace('{year}', new Date().getFullYear());
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
      <li class="project" data-reveal="fade">
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
        $('[data-gallery-link]')?.remove();
      }
      return;
    }

    section.hidden = false;
    slot('gallery-hint').textContent = content.gallery?.hint ?? '';
    slot('gallery').innerHTML = photos.map((photo, i) => `
      <li>
        <button class="gallery__btn" type="button" data-index="${i}" aria-label="${esc(photo.caption || `${ui('photo')} ${i + 1}`)}">
          <img src="${PHOTO_DIR}/thumb/${esc(photo.id)}.webp" alt="" width="${photo.w}" height="${photo.h}" loading="lazy" decoding="async" draggable="false">
        </button>
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


  /* ---------------- Hardware readout (the playful bit) ---------------- */

  function initReadout() {
    const el = slot('readout');
    const specs = [];
    const gpu = detectGPU();
    if (gpu) specs.push(['GPU', esc(gpu)]);
    if (navigator.hardwareConcurrency) specs.push(['CPU', `${navigator.hardwareConcurrency} ${esc(ui('threads'))}`]);
    specs.push(['FPS', '<span class="readout__fps">--</span>']);

    el.innerHTML = `<span class="readout__label"><span class="readout__dot" aria-hidden="true"></span>${esc(content.hero?.readout)}</span>`
      + specs.map(([key, value]) => `<span class="readout__spec">${key} <b>${value}</b></span>`).join('');

    // Measure the real frame rate, only while the readout is on screen.
    const out = $('.readout__fps', el);
    let loop = 0;
    const run = () => {
      const id = ++loop;
      let frames = 0;
      let since = performance.now();
      const tick = (now) => {
        if (id !== loop) return;
        frames++;
        const elapsed = now - since;
        if (elapsed >= 1000) {
          if (elapsed < 1500) out.textContent = Math.round((frames * 1000) / elapsed);
          frames = 0;
          since = now;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) run();
      else loop++;
    }).observe(el);
  }

  function detectGPU() {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (!gl) return null;
      let name = gl.getParameter(gl.RENDERER);
      if (!name || /^WebKit WebGL$/i.test(name)) {
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        if (info) name = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return tidyGPUName(name);
    } catch {
      return null;
    }
  }

  function tidyGPUName(raw) {
    if (!raw) return null;
    let name = String(raw);
    // Chrome/Edge: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)"
    const angle = name.match(/^ANGLE \((.*)\)$/);
    if (angle) {
      const parts = angle[1].split(',');
      name = (parts[1] || parts[0]).trim();
    }
    name = name
      .replace(/^ANGLE \w+ Renderer:\s*/i, '')        // "ANGLE Metal Renderer: Apple M2"
      .replace(/\(0x[0-9a-f]+\)/gi, '')
      .replace(/\b(Direct3D|OpenGL|Vulkan|Metal)\S*.*$/i, '')
      .replace(/\b[vp]s_\d.*$/i, '')
      .replace(/\((R|TM)\)/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!name || /^(WebKit WebGL|Mozilla|Generic Renderer)$/i.test(name)) return null;
    if (/swiftshader|llvmpipe|software|microsoft basic/i.test(name)) return null;
    return name;
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
    if (!email || !navigator.clipboard) {
      button.remove();
      return;
    }
    let timer;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(email);
      } catch {
        return;
      }
      button.textContent = ui('copied');
      button.classList.add('is-done');
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = ui('copy');
        button.classList.remove('is-done');
      }, 1800);
    });
  }


  /* ---------------- Gallery: drag strip + lightbox ---------------- */

  function initGallery(photos) {
    const scroller = $('.gallery');
    const drag = enableDragScroll(scroller);
    const lightbox = createLightbox(photos);

    scroller.addEventListener('click', (e) => {
      if (drag.consumeDrag()) return; // the mouse was dragging, not clicking
      const button = e.target.closest('.gallery__btn');
      if (button) lightbox.open(Number(button.dataset.index));
    });
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

    return {
      consumeDrag() {
        const was = dragged;
        dragged = false;
        return was;
      },
    };
  }

  function createLightbox(photos) {
    const dialog = $('.lightbox');
    const img = $('.lightbox__img', dialog);
    const stage = $('.lightbox__stage', dialog);
    const caption = $('.lightbox__caption', dialog);
    const count = $('.lightbox__count', dialog);
    const prev = $('.lightbox__prev', dialog);
    const next = $('.lightbox__next', dialog);
    const close = $('.lightbox__close', dialog);
    const loaded = new Map();
    let index = 0;
    let closing = false;

    dialog.setAttribute('aria-label', content.gallery?.label || '');
    close.setAttribute('aria-label', ui('close'));
    prev.setAttribute('aria-label', ui('previous'));
    next.setAttribute('aria-label', ui('next'));
    prev.hidden = next.hidden = photos.length < 2;

    const url = (photo, size) => `${PHOTO_DIR}/${size}/${photo.id}.webp`;
    const wrap = (i) => (i + photos.length) % photos.length;

    const preload = (i) => {
      const src = url(photos[wrap(i)], 'full');
      if (!loaded.has(src)) {
        const im = new Image();
        im.decoding = 'async';
        im.src = src;
        loaded.set(src, im);
      }
      return loaded.get(src);
    };

    function show(i, dir = 0) {
      index = wrap(i);
      const photo = photos[index];
      const full = preload(index);
      const ready = full.complete && full.naturalWidth > 0;

      img.width = photo.w;
      img.height = photo.h;
      img.alt = photo.caption || '';
      // Show the (already cached) thumbnail at once, swap in the sharp version when it lands.
      img.src = ready ? full.src : url(photo, 'thumb');
      if (!ready) {
        const wanted = index;
        full.addEventListener('load', () => { if (index === wanted) img.src = full.src; }, { once: true });
      }

      caption.textContent = photo.caption || '';
      count.textContent = `${index + 1} / ${photos.length}`;

      if (motion && dir) {
        gsap.fromTo(img, { x: 48 * dir, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: 'expo.out', overwrite: true });
      }
      if (photos.length > 1) {
        preload(index + 1);
        preload(index - 1);
      }
    }

    function open(i) {
      show(i);
      dialog.showModal();
      lenis?.stop();
      root.classList.add('is-locked');
      if (motion) gsap.fromTo(dialog, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
    }

    function shut() {
      if (closing || !dialog.open) return;
      if (!motion) {
        dialog.close();
        return;
      }
      closing = true;
      gsap.to(dialog, { opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: () => dialog.close() });
    }

    // Runs however the dialog closes (button, Esc, backdrop).
    dialog.addEventListener('close', () => {
      closing = false;
      lenis?.start();
      root.classList.remove('is-locked');
    });

    prev.addEventListener('click', () => show(index - 1, -1));
    next.addEventListener('click', () => show(index + 1, 1));
    close.addEventListener('click', shut);

    dialog.addEventListener('cancel', (e) => { // Esc
      e.preventDefault();
      shut();
    });

    dialog.addEventListener('keydown', (e) => {
      if (photos.length < 2) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        show(index - 1, -1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        show(index + 1, 1);
      }
    });

    // Clicking the dark area around the photo closes it.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target === stage) shut();
    });

    // Swipe left/right on touch screens.
    let swipeX = null;
    let swipeY = 0;
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      swipeX = e.clientX;
      swipeY = e.clientY;
    });
    stage.addEventListener('pointerup', (e) => {
      if (swipeX === null) return;
      const dx = e.clientX - swipeX;
      const dy = e.clientY - swipeY;
      swipeX = null;
      if (photos.length > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const dir = dx < 0 ? 1 : -1;
        show(index + dir, dir);
      }
    });

    return { open };
  }


  /* ---------------- Skills marquee ---------------- */

  function initMarquee() {
    const band = $('.marquee');
    const track = slot('skills');
    const group = $('.marquee__group', track);
    if (!group) return;

    if (!motion) {
      band.classList.add('is-static');
      return;
    }

    let width = 0;
    let x = 0;
    let speed = 1;
    let dir = 1;
    let hovering = false;
    let visible = true;

    // Repeat the group until it covers the band, so the loop never shows a gap.
    const fill = () => {
      $$('.marquee__group', track).slice(1).forEach((g) => g.remove());
      width = group.getBoundingClientRect().width;
      if (!width) return;
      const copies = Math.ceil(band.clientWidth / width) + 1;
      for (let i = 1; i < copies; i++) track.append(group.cloneNode(true));
    };
    fill();
    const resize = new ResizeObserver(fill);
    resize.observe(band);
    resize.observe(group);

    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(band);
    band.addEventListener('pointerenter', () => { hovering = true; });
    band.addEventListener('pointerleave', () => { hovering = false; });

    // Drifts slowly; speeds up with scroll velocity and follows the scroll direction.
    gsap.ticker.add((time, deltaMs) => {
      if (!visible || !width) return;
      const velocity = lenis ? lenis.velocity : 0;
      if (lenis && lenis.direction) dir = lenis.direction;
      const target = (hovering ? 0.25 : 1) + Math.min(Math.abs(velocity) * 0.12, 6);
      speed += (target - speed) * 0.06;
      x -= dir * speed * MARQUEE_SPEED * (deltaMs / 1000);
      x %= width;
      if (x > 0) x -= width;
      track.style.transform = `translate3d(${x}px, 0, 0)`;
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

    gsap.set(nameWords, { yPercent: 150, rotate: 5, transformOrigin: '0% 100%' });
    gsap.set(tagWords, { yPercent: 130 });
    gsap.set([slot('readout'), '.site-header__inner'], { opacity: 0 });

    return gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } })
      .to(nameWords, { yPercent: 0, rotate: 0, duration: 1.6, stagger: 0.12 })
      .to(tagWords, { yPercent: 0, duration: 1.2, stagger: 0.035 }, 0.4)
      .to('.site-header__inner', { opacity: 1, duration: 1 }, 0.7)
      .fromTo(slot('readout'), { y: 12 }, { opacity: 1, y: 0, duration: 1 }, 1);
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
