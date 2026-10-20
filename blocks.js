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
    masthead.style.setProperty("--p", p.toFixed(4));
    masthead.classList.toggle("is-gone", p === 1);
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

// Player: waveform down the right margin, played part in full ink.
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
  var shownPx = -1;
  var target = 0;
  var SVG = "http://www.w3.org/2000/svg";

  rest.className = "rest";
  played.className = "played";
  cursor.className = "cursor";
  cursor.appendChild(cursorTime);
  wave.appendChild(rest);
  wave.appendChild(played);
  wave.appendChild(cursor);

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

  fetch(wave.dataset.src)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      duration = duration || data.duration;
      [rest, played].forEach(function (layer) {
        layer.appendChild(outline(data.peak, "peak"));
        layer.appendChild(outline(data.rms, "rms"));
      });
      update();
    });

  // Reveal the played part. Only touch the clip when it moves a whole pixel,
  // so the ink filter isn't redrawn more than it needs to be.
  function update() {
    var t = audio.currentTime;
    var px = duration ? Math.round((t / duration) * wave.clientHeight) : 0;
    time.textContent = format(t) + (duration ? " / " + format(duration) : "");
    wave.setAttribute("aria-valuemax", String(Math.round(duration)));
    wave.setAttribute("aria-valuenow", String(Math.round(t)));
    wave.setAttribute("aria-valuetext", format(t));
    if (px !== shownPx) {
      shownPx = px;
      played.style.clipPath = "inset(0 -50% " + (wave.clientHeight - px) + "px -50%)";
    }
  }

  function timeAt(e) {
    var box = wave.getBoundingClientRect();
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

  audio.addEventListener("play", function () { button.textContent = "pause"; });
  audio.addEventListener("pause", function () { button.textContent = "play"; });
  audio.addEventListener("timeupdate", update);

  // A server without range requests (e.g. python -m http.server) can't seek:
  // the audio snaps back to the start. Say so, rather than fail quietly.
  audio.addEventListener("seeked", function () {
    if (target > 1 && audio.currentTime < 1) {
      console.warn("Seeking failed: serve the site with range requests, e.g. npx http-server");
    }
  });
  audio.addEventListener("loadedmetadata", function () {
    duration = audio.duration;
    update();
  });
  // The waveform is as long as the page, which grows as images load.
  new ResizeObserver(function () {
    shownPx = -1;
    update();
  }).observe(wave);

  // Click or drag on the waveform to move through the mix.
  wave.addEventListener("pointerdown", function (e) {
    wave.setPointerCapture(e.pointerId);
    seek(timeAt(e));
  });

  wave.addEventListener("pointermove", function (e) {
    var box = wave.getBoundingClientRect();
    cursor.style.top = (e.clientY - box.top) + "px";
    cursorTime.textContent = format(timeAt(e));
    if (wave.hasPointerCapture(e.pointerId)) seek(timeAt(e));
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
