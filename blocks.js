// Fade carousels with numbered dots.
// Markup: <div class="carousel" aria-label="…"><img …><img …></div>

document.querySelectorAll(".carousel").forEach(function (carousel) {
  var images = Array.prototype.slice.call(carousel.querySelectorAll("img"));
  var slides = document.createElement("div");
  var dots = document.createElement("div");
  var current = 0;

  slides.className = "slides";
  dots.className = "dots";

  carousel.setAttribute("role", "region");
  carousel.setAttribute("aria-roledescription", "carousel");

  images.forEach(function (img, i) {
    var dot = document.createElement("button");
    dot.type = "button";
    dot.textContent = String(i + 1);
    dot.setAttribute("aria-label", "Image " + (i + 1) + " of " + images.length);
    dot.addEventListener("click", function () { show(i); });
    dots.appendChild(dot);
    slides.appendChild(img);
  });

  carousel.appendChild(slides);
  carousel.appendChild(dots);

  // Left and right arrow keys move between images while a dot has focus.
  dots.addEventListener("keydown", function (e) {
    var next;
    if (e.key === "ArrowRight") next = (current + 1) % images.length;
    else if (e.key === "ArrowLeft") next = (current - 1 + images.length) % images.length;
    else return;
    e.preventDefault();
    show(next);
    dots.children[next].focus();
  });

  function show(index) {
    current = index;
    images.forEach(function (img, i) {
      img.classList.toggle("is-active", i === index);
      dots.children[i].setAttribute("aria-current", i === index ? "true" : "false");
    });
  }

  show(0);
});

// Portal and masthead, both driven by the first part of the scroll: picture 01
// fades out and the masthead shrinks away, both done once the first paragraph
// has risen three quarters of the way up the screen. The masthead is fixed, so
// a hidden copy at the top of <main> holds its place.

(function () {
  var masthead = document.querySelector(".masthead");
  var portal = document.querySelector(".portal");
  var main = document.querySelector("main");
  var first = document.querySelector(".portal ~ .row p");
  if (!masthead || !portal || !main || !first) return;

  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var phone = window.matchMedia("(max-width: 800px)");
  var ticking = false;

  var space = masthead.cloneNode(true);
  space.className = "masthead-space";
  space.setAttribute("aria-hidden", "true");
  space.inert = true;
  main.insertBefore(space, main.firstChild);

  // With reduced motion: no fade, and the masthead goes at 100px.
  function step() {
    // Measured each time: the page above it grows as images load.
    var end = first.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.25;
    var progress = window.scrollY / Math.max(end, 1);
    var p = Math.min(Math.max(progress, 0), 1);
    if (still) p = window.scrollY > 100 ? 1 : 0;
    else portal.style.opacity = String(1 - p);
    // On a phone the masthead stays put: leave its style alone while scrolling.
    if (!phone.matches) {
      masthead.style.setProperty("--p", p.toFixed(4));
      masthead.classList.toggle("is-gone", p === 1);
    }
    ticking = false;
  }

  function request() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(step);
    }
  }

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  step();
})();

// Player: waveform down the right margin, played part in full ink. On a
// phone it's a bar along the bottom instead, time running across: a six minute
// window of the mix that slides past a fixed playhead in the middle, the
// played part to its left. The bar is drawn on a canvas, just the visible six
// minutes each frame: the SVG ink filter is far too slow to move every frame.
// Audio is self-hosted: audio/mix.m4a, 128 kbps AAC (under GitHub's 100 MB
// file limit). Seeking needs a server with range requests, e.g. npx http-server.

(function () {
  var player = document.querySelector(".player");
  if (!player) return;

  var audio = player.querySelector("audio");
  var button = player.querySelector(".play");
  var time = player.querySelector(".time");
  var wave = player.querySelector(".wave");
  var played = document.createElement("div");
  var rest = document.createElement("div");
  var cursor = document.createElement("div");
  var cursorTime = document.createElement("span");
  var duration = 0;
  var shown = null;
  var preview = null;
  var bar = document.createElement("canvas");
  var barPeak = [];
  var barRms = [];
  var target = 0;
  var SVG = "http://www.w3.org/2000/svg";
  var phone = window.matchMedia("(max-width: 800px)");
  var WINDOW = 360;

  rest.className = "rest";
  played.className = "played";
  cursor.className = "cursor";
  cursor.appendChild(cursorTime);
  wave.appendChild(rest);
  wave.appendChild(played);
  wave.appendChild(cursor);
  bar.className = "bar";
  wave.appendChild(bar);

  function format(seconds) {
    var s = Math.floor(seconds);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  // A mirrored outline, time running down: left edge down, right edge back up.
  // Values are 0-1000; the viewBox is 100 wide and stretched to fit.
  function outline(values, className) {
    var n = values.length;
    var left = [];
    var right = [];
    values.forEach(function (v, i) {
      var half = v / 20;
      left.push((50 - half).toFixed(2) + " " + i);
      right.unshift((50 + half).toFixed(2) + " " + i);
    });
    var svg = document.createElementNS(SVG, "svg");
    var path = document.createElementNS(SVG, "path");
    svg.setAttribute("viewBox", "0 0 100 " + (n - 1));
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", className);
    path.setAttribute("d", "M" + left.concat(right).join("L") + "Z");
    svg.appendChild(path);
    return svg;
  }

  // The phone bar shows six minutes at a time: half the detail is plenty.
  // Keep the loudest of each run.
  function fewer(values, count) {
    var out = [];
    var size = values.length / count;
    for (var i = 0; i < count; i++) {
      out.push(Math.max.apply(null, values.slice(Math.floor(i * size), Math.floor((i + 1) * size))));
    }
    return out;
  }

  fetch(wave.dataset.src)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      duration = duration || data.duration;
      [rest, played].forEach(function (layer) {
        layer.appendChild(outline(data.peak, "peak"));
        layer.appendChild(outline(data.rms, "rms"));
      });
      barPeak = fewer(data.peak, data.peak.length / 2);
      barRms = fewer(data.rms, data.rms.length / 2);
      shown = null;
      update();
    });

  // Margin: reveal the played part down to the playhead. Phone: redraw the
  // bar. While a finger drags the bar, show where it would land instead.
  function update() {
    var t = preview === null ? audio.currentTime : preview;
    time.textContent = format(t) + (duration ? " / " + format(duration) : "");
    wave.setAttribute("aria-valuemax", String(Math.round(duration)));
    wave.setAttribute("aria-valuenow", String(Math.round(t)));
    wave.setAttribute("aria-valuetext", format(t));
    if (phone.matches) draw(t);
    else reveal(t);
  }

  // Only touch the clip when it moves a whole pixel, so the ink filter isn't
  // redrawn more than it needs to be.
  function reveal(t) {
    var length = wave.clientHeight;
    var px = duration ? Math.round((t / duration) * length) : 0;
    if (px === shown) return;
    shown = px;
    played.style.clipPath = "inset(0 -50% " + (length - px) + "px -50%)";
  }

  // Ink for the bar: the margin's colour and layers, without its printed
  // texture (the filter that makes it is what's too slow).
  var INK = "20, 19, 17";
  var LAYERS = [
    { values: function () { return barPeak; }, alpha: 0.1, played: 0.25 },
    { values: function () { return barRms; }, alpha: 0.28, played: 0.8 }
  ];

  function draw(t) {
    var n = barRms.length;
    if (!n || !duration) return;
    var dpr = window.devicePixelRatio || 1;
    var w = wave.clientWidth;
    var h = wave.clientHeight;
    if (bar.width !== Math.round(w * dpr) || bar.height !== Math.round(h * dpr)) {
      bar.width = Math.round(w * dpr);
      bar.height = Math.round(h * dpr);
    }
    var c = bar.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    // One point per pixel, read off the data between its samples.
    var start = t - WINDOW / 2;
    var perPx = WINDOW / w;
    function at(values, x) {
      var f = ((start + x * perPx) / duration) * n;
      if (f < 0 || f > n - 1) return null;
      var i = Math.floor(f);
      var v = values[i] + (values[Math.min(i + 1, n - 1)] - values[i]) * (f - i);
      return (v / 1000) * (h / 2);
    }

    function shape(values) {
      var top = [];
      for (var x = 0; x <= w; x++) {
        var half = at(values, x);
        if (half !== null) top.push([x, half]);
      }
      if (!top.length) return false;
      c.beginPath();
      top.forEach(function (p, i) { c[i ? "lineTo" : "moveTo"](p[0], h / 2 - p[1]); });
      for (var i = top.length - 1; i >= 0; i--) c.lineTo(top[i][0], h / 2 + top[i][1]);
      c.closePath();
      return true;
    }

    LAYERS.forEach(function (layer) {
      if (!shape(layer.values())) return;
      c.fillStyle = "rgba(" + INK + ", " + layer.alpha + ")";
      c.fill();
      c.save();
      c.beginPath();
      c.rect(0, 0, w / 2, h);
      c.clip();
      shape(layer.values());
      c.fillStyle = "rgba(" + INK + ", " + layer.played + ")";
      c.fill();
      c.restore();
    });
  }

  // While playing on a phone, redraw every frame so the bar glides.
  function glide() {
    if (audio.paused || !phone.matches) return;
    draw(preview === null ? audio.currentTime : preview);
    window.requestAnimationFrame(glide);
  }

  function timeAt(e) {
    var box = wave.getBoundingClientRect();
    if (phone.matches) {
      return audio.currentTime + ((e.clientX - box.left) / box.width - 0.5) * WINDOW;
    }
    return Math.min(Math.max((e.clientY - box.top) / box.height, 0), 1) * duration;
  }

  function seek(seconds) {
    target = Math.min(Math.max(seconds, 0), duration);
    audio.currentTime = target;
    update();
  }

  button.addEventListener("click", function () {
    if (audio.paused) audio.play();
    else audio.pause();
  });

  audio.addEventListener("play", function () {
    button.textContent = "pause";
    window.requestAnimationFrame(glide);
  });
  audio.addEventListener("pause", function () { button.textContent = "play"; });
  audio.addEventListener("timeupdate", update);
  audio.addEventListener("seeking", update);

  // A server without range requests (e.g. python -m http.server) can't seek:
  // the audio snaps back to the start. Say so, rather than fail quietly.
  audio.addEventListener("seeked", function () {
    if (target > 1 && audio.currentTime < 1) {
      console.warn("Seeking failed: serve the site with range requests, e.g. npx http-server");
    }
  });
  audio.addEventListener("loadedmetadata", function () {
    duration = audio.duration;
    shown = null;
    update();
  });
  // The waveform is as long as the page, which grows as images load; the
  // phone bar changes width when the phone turns.
  new ResizeObserver(function () {
    shown = null;
    update();
  }).observe(wave);

  // Margin: click or drag on the waveform to move through the mix. On a
  // touchscreen it's also where you scroll, so a finger seeks on a tap only.
  // Phone bar: tap to jump to that point, or drag the waveform along like tape.
  // A drag only moves the picture; the audio jumps once, when you let go, as
  // each jump has to fetch that part of the file.
  var pointerType = "mouse";
  var drag = null;

  wave.addEventListener("pointerdown", function (e) {
    pointerType = e.pointerType;
    if (phone.matches) {
      wave.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, t: audio.currentTime, moved: false };
      return;
    }
    if (pointerType === "touch") return;
    wave.setPointerCapture(e.pointerId);
    seek(timeAt(e));
  });

  wave.addEventListener("click", function (e) {
    if (pointerType === "touch" && !phone.matches) seek(timeAt(e));
  });

  wave.addEventListener("pointermove", function (e) {
    if (drag) {
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) drag.moved = true;
      if (drag.moved) {
        preview = Math.min(Math.max(drag.t - (dx / wave.clientWidth) * WINDOW, 0), duration);
        update();
      }
      return;
    }
    if (phone.matches) return;
    var box = wave.getBoundingClientRect();
    cursor.style.top = (e.clientY - box.top) + "px";
    cursorTime.textContent = format(timeAt(e));
    if (wave.hasPointerCapture(e.pointerId)) seek(timeAt(e));
  });

  wave.addEventListener("pointerup", function (e) {
    if (drag) {
      var to = drag.moved ? preview : timeAt(e);
      drag = null;
      preview = null;
      seek(to);
    }
  });

  wave.addEventListener("pointercancel", function () {
    drag = null;
    preview = null;
    update();
  });

  // Arrow keys step 10 seconds, Page Up/Down a minute, Home/End the ends.
  wave.addEventListener("keydown", function (e) {
    var t = audio.currentTime;
    var steps = { ArrowDown: 10, ArrowRight: 10, ArrowUp: -10, ArrowLeft: -10, PageDown: 60, PageUp: -60 };
    if (e.key in steps) seek(t + steps[e.key]);
    else if (e.key === "Home") seek(0);
    else if (e.key === "End") seek(duration);
    else return;
    e.preventDefault();
  });
})();
