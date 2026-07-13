(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const normalize = (value) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");

  const menuButton = document.querySelector("[data-menu-toggle]");
  const sidebar = document.querySelector(".docs-sidebar");
  const setMenu = (open) => {
    if (!menuButton || !sidebar) return;
    body.classList.toggle("docs-menu-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    sidebar.setAttribute("aria-hidden", String(!open && window.innerWidth < 920));
  };
  menuButton?.addEventListener("click", () => setMenu(!body.classList.contains("docs-menu-open")));
  sidebar?.addEventListener("click", (event) => {
    if (event.target.closest("a") && window.innerWidth < 920) setMenu(false);
  });
  window.addEventListener("resize", () => {
    if (!sidebar) return;
    if (window.innerWidth >= 920) {
      body.classList.remove("docs-menu-open");
      sidebar.removeAttribute("aria-hidden");
      menuButton?.setAttribute("aria-expanded", "false");
    } else if (!body.classList.contains("docs-menu-open")) {
      sidebar.setAttribute("aria-hidden", "true");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
  });
  if (window.innerWidth < 920) sidebar?.setAttribute("aria-hidden", "true");

  const progress = document.querySelector("[data-reading-progress]");
  const backTop = document.querySelector("[data-back-top]");
  const updateScroll = () => {
    const available = Math.max(1, root.scrollHeight - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, window.scrollY / available));
    if (progress) progress.style.transform = `scaleX(${ratio})`;
    backTop?.classList.toggle("is-visible", window.scrollY > 640);
  };
  updateScroll();
  document.addEventListener("scroll", updateScroll, { passive: true });
  backTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }));

  const tocLinks = [...document.querySelectorAll(".toc a[href^='#']")];
  const sections = [...document.querySelectorAll("main section[id]")];
  if ("IntersectionObserver" in window && tocLinks.length) {
    const visible = new Map();
    const activate = () => {
      const candidates = [...visible.entries()]
        .filter(([, state]) => state.isIntersecting)
        .sort((a, b) => Math.abs(a[1].boundingClientRect.top - 120) - Math.abs(b[1].boundingClientRect.top - 120));
      const activeId = candidates[0]?.[0];
      if (!activeId) return;
      for (const link of tocLinks) {
        if (link.hash === `#${activeId}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.set(entry.target.id, entry);
      activate();
    }, { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.01] });
    sections.forEach((section) => observer.observe(section));
  }

  for (const section of sections) {
    const heading = section.querySelector(":scope > h2");
    if (!heading) continue;
    const permalink = document.createElement("a");
    permalink.className = "heading-anchor";
    permalink.href = `#${section.id}`;
    permalink.setAttribute("aria-label", `Enlace a ${heading.textContent.trim()}`);
    permalink.title = "Copiar enlace a esta sección";
    permalink.textContent = "#";
    permalink.addEventListener("click", async () => {
      const url = new URL(permalink.href, window.location.href).href;
      try {
        await navigator.clipboard?.writeText(url);
        permalink.dataset.copied = "true";
        permalink.textContent = "✓";
        window.setTimeout(() => {
          permalink.textContent = "#";
          delete permalink.dataset.copied;
        }, 1400);
      } catch (_) {
        // El hash sigue funcionando aunque el navegador no permita el portapapeles.
      }
    });
    heading.append(permalink);
  }

  const searchInput = document.querySelector("[data-doc-search]");
  const searchResults = document.querySelector("[data-search-results]");
  const searchItems = [...document.querySelectorAll("[data-search-item][id]")].map((element) => {
    const heading = element.querySelector("h2, h3");
    const title = heading?.childNodes[0]?.textContent?.trim() || heading?.textContent.trim() || element.id;
    const searchable = element.cloneNode(true);
    searchable.querySelectorAll(".heading-anchor").forEach((anchor) => anchor.remove());
    const text = searchable.textContent.replace(/\s+/g, " ").trim();
    return { element, title, text, normalized: normalize(text) };
  });
  const clearSearch = () => {
    if (!searchResults) return;
    searchResults.replaceChildren();
    searchResults.hidden = true;
  };
  searchInput?.addEventListener("input", () => {
    if (!searchResults) return;
    const query = normalize(searchInput.value.trim());
    if (query.length < 2) {
      clearSearch();
      return;
    }
    const matches = searchItems.filter((item) => item.normalized.includes(query)).slice(0, 8);
    const fragment = document.createDocumentFragment();
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "search-empty";
      empty.textContent = "No hay coincidencias. Prueba con otro término.";
      fragment.append(empty);
    }
    for (const match of matches) {
      const link = document.createElement("a");
      link.href = `#${match.element.id}`;
      const strong = document.createElement("strong");
      strong.textContent = match.title;
      const preview = document.createElement("span");
      const index = match.normalized.indexOf(query);
      const start = Math.max(0, index - 55);
      preview.textContent = `${start ? "…" : ""}${match.text.slice(start, start + 145)}${match.text.length > start + 145 ? "…" : ""}`;
      link.append(strong, preview);
      link.addEventListener("click", () => {
        searchInput.value = "";
        clearSearch();
      });
      fragment.append(link);
    }
    searchResults.replaceChildren(fragment);
    searchResults.hidden = false;
  });
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      searchInput.value = "";
      clearSearch();
      searchInput.blur();
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".docs-search")) clearSearch();
  });

  const eraButtons = [...document.querySelectorAll("[data-era-filter]")];
  const eraEntries = [...document.querySelectorAll("[data-era]")];
  const eraStatus = document.querySelector("[data-era-status]");
  for (const button of eraButtons) {
    button.addEventListener("click", () => {
      const filter = button.dataset.eraFilter;
      eraButtons.forEach((candidate) => {
        candidate.classList.toggle("is-active", candidate === button);
        candidate.setAttribute("aria-pressed", String(candidate === button));
      });
      let shown = 0;
      for (const entry of eraEntries) {
        const visible = filter === "all" || entry.dataset.era === filter;
        entry.hidden = !visible;
        if (visible) shown++;
      }
      if (eraStatus) eraStatus.textContent = `${shown} hitos visibles`;
    });
  }

  for (const group of document.querySelectorAll("[data-tab-group]")) {
    const tabs = [...group.querySelectorAll("[data-tab]")];
    const panels = [...group.querySelectorAll("[data-tab-panel]")];
    const select = (key) => {
      tabs.forEach((tab) => {
        const active = tab.dataset.tab === key;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== key; });
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(tab.dataset.tab));
      tab.addEventListener("keydown", (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(index + direction + tabs.length) % tabs.length];
        select(next.dataset.tab);
        next.focus();
      });
    });
    if (tabs[0]) select(tabs.find((tab) => tab.classList.contains("is-active"))?.dataset.tab ?? tabs[0].dataset.tab);
  }

  const checklist = [...document.querySelectorAll("[data-practice-check]")];
  const checklistOutput = document.querySelector("[data-checklist-output]");
  const updateChecklist = () => {
    if (!checklistOutput) return;
    const done = checklist.filter((item) => item.checked).length;
    checklistOutput.textContent = `${done}/${checklist.length} preparado`;
    checklistOutput.style.setProperty("--check-progress", checklist.length ? done / checklist.length : 0);
  };
  checklist.forEach((item) => item.addEventListener("change", updateChecklist));
  updateChecklist();

  const noteNames = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
  const frequencyToNote = (frequency) => {
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const note = noteNames[((midi % 12) + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    const exact = 440 * Math.pow(2, (midi - 69) / 12);
    const cents = 1200 * Math.log2(frequency / exact);
    return `${note}${octave} ${cents >= 0 ? "+" : ""}${cents.toFixed(0)} ¢`;
  };
  const rangeMin = document.querySelector("[data-range-min]");
  const rangeOctaves = document.querySelector("[data-range-octaves]");
  const rangeOutput = document.querySelector("[data-range-output]");
  const rangeMarkers = document.querySelector("[data-range-markers]");
  const updateRange = () => {
    if (!rangeMin || !rangeOctaves || !rangeOutput || !rangeMarkers) return;
    const min = Math.min(2000, Math.max(16, Number(rangeMin.value) || 32.703));
    const octaves = Math.min(7, Math.max(1, Number(rangeOctaves.value) || 6));
    const max = Math.min(5000, min * Math.pow(2, octaves));
    const actualOctaves = Math.log2(max / min);
    rangeOutput.textContent = `${min.toFixed(2)}–${max.toFixed(2)} Hz · ${actualOctaves.toFixed(2)} oct · ${frequencyToNote(min)} → ${frequencyToNote(max)}`;
    rangeMarkers.replaceChildren();
    for (let midi = 0; midi <= 127; midi += 12) {
      const hz = 440 * Math.pow(2, (midi - 69) / 12);
      if (hz < min || hz > max) continue;
      const marker = document.createElement("span");
      marker.style.left = `${(Math.log2(hz / min) / actualOctaves) * 100}%`;
      marker.textContent = `Do${Math.floor(midi / 12) - 1}`;
      rangeMarkers.append(marker);
    }
  };
  rangeMin?.addEventListener("input", updateRange);
  rangeOctaves?.addEventListener("input", updateRange);
  updateRange();

  const fpsInput = document.querySelector("[data-latency-fps]");
  const glideInput = document.querySelector("[data-latency-glide]");
  const outputLatencyInput = document.querySelector("[data-latency-output]");
  const latencyOutput = document.querySelector("[data-latency-output-value]");
  const updateLatency = () => {
    if (!fpsInput || !glideInput || !outputLatencyInput || !latencyOutput) return;
    const fps = Math.min(120, Math.max(10, Number(fpsInput.value) || 30));
    const glide = Math.min(150, Math.max(3, Number(glideInput.value) || 10));
    const audio = Math.min(200, Math.max(0, Number(outputLatencyInput.value) || 0));
    const captureMedian = 500 / fps;
    const bridge = Math.max(glide, 1150 / fps);
    const estimate = captureMedian + bridge * 0.5 + audio;
    latencyOutput.textContent = `≈ ${estimate.toFixed(0)} ms orientativos`;
  };
  [fpsInput, glideInput, outputLatencyInput].forEach((input) => input?.addEventListener("input", updateLatency));
  updateLatency();

  document.querySelector("[data-print]")?.addEventListener("click", () => window.print());
})();
