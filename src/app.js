(function () {
  const routes = window.ROUTES || [];
  const routeListEl = document.getElementById("routeList");
  const modeFilterEl = document.getElementById("modeFilter");
  const searchInputEl = document.getElementById("searchInput");

  const videoEl = document.getElementById("videoPlayer");
  const youtubeEl = document.getElementById("youtubePlayer");
  const placeholderEl = document.getElementById("placeholder");

  const playPauseBtn = document.getElementById("playPauseBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const rateSelect = document.getElementById("rateSelect");
  const volumeRange = document.getElementById("volumeRange");
  const autoplayNextEl = document.getElementById("autoplayNext");
  const nowPlayingEl = document.getElementById("nowPlaying");

  function initSeoSite(){
    let ldW = document.getElementById("ld-website");
    if (!ldW) { ldW = document.createElement("script"); ldW.type = "application/ld+json"; ldW.id = "ld-website"; document.head.appendChild(ldW); }
    const obj = { "@context":"https://schema.org", "@type":"WebSite", name:"ZenDrive Breath", url: location.origin + location.pathname };
    ldW.textContent = JSON.stringify(obj);
    const canEl = document.getElementById("canonical"); if (canEl) canEl.setAttribute("href", location.origin + location.pathname);
    const ogUrl = document.getElementById("og-url"); if (ogUrl) ogUrl.setAttribute("content", location.href);
  }
  initSeoSite();

  const sidebarEl = document.getElementById("sidebar");
  const openSettingsBtn = document.getElementById("openSettingsBtn");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const routeTabBtn = document.getElementById("routeTabBtn");
  const breathTabBtn = document.getElementById("breathTabBtn");
  const routeTab = document.getElementById("routeTab");
  const breathTab = document.getElementById("breathTab");

  const enterBtn = document.getElementById("enterBtn");

  const LS_KEYS = {
    autoplayNext: "zb.autoplayNext",
    rate: "zb.rate",
    volume: "zb.volume",
    lastRouteId: "zb.lastRouteId",
    mp4ProgressPrefix: "zb.mp4Progress.",
    breathProgram: "zb.breath.program",
    breathLevel: "zb.breath.level",
  };
  function lsGet(key, defVal) { try { const v = localStorage.getItem(key); return v===null?defVal:v; } catch(_) { return defVal; } }
  function lsSet(key, val) { try { localStorage.setItem(key, String(val)); } catch(_) {} }

  function openSettings() { sidebarEl.classList.add("open"); }
  function closeSettings() { sidebarEl.classList.remove("open"); }
  function activateTab(which) {
    const isRoute = which === "route";
    routeTabBtn.classList.toggle("active", isRoute);
    breathTabBtn.classList.toggle("active", !isRoute);
    routeTab.classList.toggle("active", isRoute);
    breathTab.classList.toggle("active", !isRoute);
  }

  const rootEl = document.body;
  function enterLanding() { rootEl.classList.add("landing-mode"); rootEl.classList.remove("playback-mode"); }
  function leaveLandingToPlayback() { rootEl.classList.remove("landing-mode"); rootEl.classList.add("playback-mode"); openSettings(); activateTab("route"); }
  function enterPlaybackMode() { rootEl.classList.remove("landing-mode"); rootEl.classList.add("playback-mode"); }

  if (openSettingsBtn) openSettingsBtn.addEventListener("click", () => sidebarEl.classList.add("open"));
  if (closeSettingsBtn) closeSettingsBtn.addEventListener("click", () => sidebarEl.classList.remove("open"));
  if (routeTabBtn) routeTabBtn.addEventListener("click", () => activateTab("route"));
  if (breathTabBtn) breathTabBtn.addEventListener("click", () => activateTab("breath"));
  if (enterBtn) enterBtn.addEventListener("click", leaveLandingToPlayback);
  if (enterBtn) enterBtn.addEventListener("click", () => {
    const lastId = lsGet(LS_KEYS.lastRouteId, "");
    if (!lastId) return;
    applyFilters();
    const idxFiltered = filtered.findIndex(r => r.id === lastId);
    if (idxFiltered >= 0) selectIndex(idxFiltered, true);
  });

  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
    if (e.code === "KeyS") {
      if (sidebarEl.classList.contains("open")) closeSettings(); else openSettings();
    } else if (e.code === "Escape") {
      closeSettings();
    }
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;

    if (e.code === "Space") {
      e.preventDefault();
      playPauseBtn.click();
    } else if (e.code === "ArrowRight") {
      nextBtn.click();
    } else if (e.code === "ArrowLeft") {
      prevBtn.click();
    } else if (e.code === "BracketRight") {
      const idx = rateSelect.selectedIndex;
      rateSelect.selectedIndex = Math.min(idx + 1, rateSelect.options.length - 1);
      rateSelect.dispatchEvent(new Event("change"));
    } else if (e.code === "BracketLeft") {
      const idx = rateSelect.selectedIndex;
      rateSelect.selectedIndex = Math.max(idx - 1, 0);
      rateSelect.dispatchEvent(new Event("change"));
    }
  });

  activateTab("route");

  const breathProgramSelect = document.getElementById("breathProgramSelect");
  const breathLevelSelect = document.getElementById("breathLevelSelect");
  const breathStartBtn = document.getElementById("breathStartBtn");
  const breathStopBtn = document.getElementById("breathStopBtn");
  const breathOverlay = document.getElementById("breathOverlay");
  const breathLabel = document.getElementById("breathLabel");
  const breathTimer = document.getElementById("breathTimer");
  const breathProgramDesc = document.getElementById("breathProgramDesc");
  const breathInfoBox = document.getElementById("breathInfo");
  const breathCue = document.getElementById("breathCue");
  const breathBadge = document.getElementById("breathBadge");
  const badgeIconEl = breathBadge ? breathBadge.querySelector(".badge-icon") : null;
  const badgeTextEl = breathBadge ? breathBadge.querySelector(".badge-text") : null;
  const badgeCountdownEl = breathBadge ? breathBadge.querySelector(".badge-countdown") : null;

  let breathingActive = false;

  const soundMap = {
    preparing: new Audio("miniprogram-4/sounds/preparing.wav"),
    start: new Audio("miniprogram-4/sounds/start.wav"),
    inhale: new Audio("miniprogram-4/sounds/inhale.wav"),
    retain: new Audio("miniprogram-4/sounds/retain.wav"),
    exhale: new Audio("miniprogram-4/sounds/exhale.wav"),
    sustain: new Audio("miniprogram-4/sounds/sustain.wav"),
    well_done: new Audio("miniprogram-4/sounds/well_done.wav")
  };
  Object.values(soundMap).forEach(a => { try { a.preload = "auto"; a.volume = 0.9; } catch(_){} });

  const breathState = {
    program: null, level: null, sequence: [],
    cycles: 0, currentCycle: 0, currentStepIndex: 0,
    stepRemainingMs: 0, countdownInterval: null, stepTimer: null
  };

  function playSound(key) { const a = soundMap[key]; if (!a) return; try { a.currentTime=0; a.play().catch(()=>{});} catch(_){} }

  function makePicker(selectEl, items) {
    const wrap = document.createElement("div");
    wrap.className = "picker";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker-btn";
    btn.textContent = selectEl.value || (items[0]?.label || "Select");
    const menu = document.createElement("div");
    menu.className = "picker-menu";
    const search = document.createElement("input");
    search.className = "picker-search";
    search.placeholder = "搜索...";
    menu.appendChild(search);
    const listBox = document.createElement("div");
    menu.appendChild(listBox);
    function render(filter) {
      listBox.innerHTML = "";
      const q = String(filter||"").trim().toLowerCase();
      items.filter(it => !q || (it.label+" "+(it.desc||"")).toLowerCase().includes(q)).forEach(it => {
        const row = document.createElement("div");
        row.className = "picker-item";
        const t = document.createElement("div"); t.className = "title"; t.textContent = it.label; row.appendChild(t);
        if (it.desc) { const s = document.createElement("div"); s.className = "subtitle"; s.textContent = it.desc; row.appendChild(s); }
        row.addEventListener("click", () => {
          selectEl.value = it.value;
          selectEl.dispatchEvent(new Event("change"));
          btn.textContent = it.label;
          wrap.classList.remove("open");
        });
        listBox.appendChild(row);
      });
    }
    render("");
    btn.addEventListener("click", () => { wrap.classList.toggle("open"); if (wrap.classList.contains("open")) { search.value=""; render(""); search.focus(); } });
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) wrap.classList.remove("open"); });
    search.addEventListener("input", () => render(search.value));
    selectEl.classList.add("is-hidden");
    selectEl.parentNode.insertBefore(wrap, selectEl);
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    selectEl.addEventListener("change", () => { const it = items.find(x => x.value === selectEl.value); if (it) btn.textContent = it.label; });
    return {
      setItems(next) {
        items = next.slice();
        render("");
        const it = items.find(x => x.value === selectEl.value) || items[0];
        if (it) { selectEl.value = it.value; selectEl.dispatchEvent(new Event("change")); btn.textContent = it.label; }
      }
    };
  }

  function populateBreathOptions() {
    const programs = window.BREATHING_PROGRAMS || [];
    breathProgramSelect.innerHTML = "";
    programs.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.program;
      opt.textContent = p.program;
      breathProgramSelect.appendChild(opt);
    });
    breathLevelSelect.innerHTML = "";
    const first = programs[0];
    (first?.levels || []).forEach(l => {
      const opt = document.createElement("option");
      opt.value = l.level;
      opt.textContent = l.level;
      breathLevelSelect.appendChild(opt);
    });
    const programItems = programs.map(p => ({ value: p.program, label: p.program, desc: p.description || "" }));
    const toLevelItems = (p) => (p?.levels||[]).map(l => {
      const perCycle = (l.sequence||[]).reduce((a,s)=>a+Number(s.duration||0),0);
      return { value: l.level, label: l.level, desc: `周期 ${l.cycles} ｜ 每循环 ${perCycle}s` };
    });
    let programPicker = makePicker(breathProgramSelect, programItems);
    let levelPicker = makePicker(breathLevelSelect, toLevelItems(first));
    breathProgramSelect.addEventListener("change", () => {
      const p = programs.find(x => x.program === breathProgramSelect.value);
      breathLevelSelect.innerHTML = "";
      (p?.levels || []).forEach(l => {
        const opt = document.createElement("option");
        opt.value = l.level;
        opt.textContent = l.level;
        breathLevelSelect.appendChild(opt);
      });
      levelPicker.setItems(toLevelItems(p));
    });
  }

  function updateBreathInfo() {
    const programs = window.BREATHING_PROGRAMS || [];
    const p = programs.find(x => x.program === breathProgramSelect.value);
    const l = (p?.levels || []).find(x => x.level === breathLevelSelect.value);
    if (breathProgramDesc) breathProgramDesc.textContent = p?.description || "";
    if (breathInfoBox) {
      if (!p || !l) { breathInfoBox.textContent = ""; return; }
      const steps = (l.sequence||[]).map(s => `${s.step} ${Number(s.duration||0)}s`).join(" · ");
      const perCycle = (l.sequence||[]).reduce((a,s)=>a+Number(s.duration||0),0);
      const total = perCycle * Number(l.cycles||0);
      const mm = String(Math.floor(total/60)).padStart(2,"0");
      const ss = String(Math.floor(total%60)).padStart(2,"0");
      breathInfoBox.textContent = `Level: ${l.level} ｜ Cycles: ${l.cycles} ｜ Per cycle: ${perCycle}s ｜ Total: ${mm}:${ss} ｜ ${steps}`;
    }
  }

  function startBreathing() {
    const programs = window.BREATHING_PROGRAMS || [];
    const p = programs.find(x => x.program === breathProgramSelect.value);
    const l = (p?.levels || []).find(x => x.level === breathLevelSelect.value);
    if (!p || !l) { alert("Please select Program and Level"); return; }

    document.body.classList.remove("landing-mode");
    document.body.classList.add("playback-mode");

    const candidates = routes.filter(r => (r.mode||"").toLowerCase()==="drive" && ["mp4","youtube","bilibili"].includes((r.type||"").toLowerCase()));
    const chosen = candidates.length ? candidates[Math.floor(Math.random()*candidates.length)] : routes[0];
    breathingActive = true;
    if (chosen) loadRoute(chosen, true);
  
    breathState.program = p; breathState.level = l;
    breathState.sequence = l.sequence || []; breathState.cycles = l.cycles || 1;
    breathState.currentCycle = 1; breathState.currentStepIndex = 0;
    breathOverlay.style.display = "block";
  
    playSound("preparing");
    setTimeout(() => { playSound("start"); advanceBreathStep(); }, 400);
  }

  function stopBreathing() {
    breathingActive = false;
    breathOverlay.style.display = "none";
    breathLabel.textContent = "Ready"; breathTimer.textContent = "0";
    if (breathState.countdownInterval) { clearInterval(breathState.countdownInterval); breathState.countdownInterval = null; }
    if (breathState.stepTimer) { clearTimeout(breathState.stepTimer); breathState.stepTimer = null; }
  }

  function advanceBreathStep() {
    const seq = breathState.sequence; if (!seq || !seq.length) { playSound("well_done"); stopBreathing(); return; }
    const step = seq[breathState.currentStepIndex]; const label = step?.step || ""; const durSec = Number(step?.duration || 0);
  
    if (durSec <= 0) {
      breathState.currentStepIndex = (breathState.currentStepIndex + 1) % seq.length;
      if (breathState.currentStepIndex === 0) { breathState.currentCycle += 1; if (breathState.currentCycle > breathState.cycles) { playSound("well_done"); stopBreathing(); return; } }
      advanceBreathStep(); return;
    }
  
    breathLabel.textContent = label; breathState.stepRemainingMs = durSec*1000;
    const soundKey = ({Inhale:"inhale", Retain:"retain", Exhale:"exhale", Sustain:"sustain"})[label] || null;
    if (soundKey) playSound(soundKey);
    if (breathCue) {
      breathCue.classList.remove("step-inhale","step-exhale","step-retain","step-sustain");
      const cls = ({Inhale:"step-inhale", Retain:"step-retain", Exhale:"step-exhale", Sustain:"step-sustain"})[label] || "";
      if (cls) breathCue.classList.add(cls);
      breathCue.style.setProperty("--dur", `${durSec}s`);
      breathCue.style.setProperty("--p", "0");
      const icon = ({Inhale:"↑", Retain:"⏸", Exhale:"↓", Sustain:"•"})[label] || "";
      breathCue.innerHTML = '<div class="grid"></div><div class="ring"></div><div class="reticle"></div><div class="tracker"></div><div class="glyph"></div>';
      const g = breathCue.querySelector('.glyph'); if (g) g.textContent = icon;
    }
    if (breathBadge) {
      breathBadge.classList.remove("step-inhale","step-exhale","step-retain","step-sustain");
      const c2 = ({Inhale:"step-inhale", Retain:"step-retain", Exhale:"step-exhale", Sustain:"step-sustain"})[label] || "";
      if (c2) breathBadge.classList.add(c2);
      const icon = ({Inhale:"↑", Retain:"⏸", Exhale:"↓", Sustain:"•"})[label] || "";
      const zh = ({Inhale:"吸", Retain:"屏", Exhale:"呼", Sustain:"停"})[label] || label;
      if (badgeIconEl) badgeIconEl.textContent = icon;
      if (badgeTextEl) badgeTextEl.textContent = zh;
    }
  
    if (breathState.countdownInterval) clearInterval(breathState.countdownInterval);
    breathState.countdownInterval = setInterval(() => {
      breathState.stepRemainingMs = Math.max(0, breathState.stepRemainingMs - 100);
      const sec = breathState.stepRemainingMs/1000; const t = (sec%1===0) ? String(sec|0) : sec.toFixed(1);
      breathTimer.textContent = t; if (badgeCountdownEl) badgeCountdownEl.textContent = t;
      const totalMs = Number(step?.duration||0) * 1000; if (totalMs > 0 && breathCue) {
        const prog = Math.max(0, Math.min(1, 1 - breathState.stepRemainingMs/totalMs));
        breathCue.style.setProperty('--p', String(prog));
      }
    }, 100);
  
    if (breathState.stepTimer) clearTimeout(breathState.stepTimer);
    breathState.stepTimer = setTimeout(() => {
      clearInterval(breathState.countdownInterval); breathState.countdownInterval = null;
      breathState.currentStepIndex += 1;
      if (breathState.currentStepIndex >= seq.length) {
        breathState.currentStepIndex = 0; breathState.currentCycle += 1;
        if (breathState.currentCycle > breathState.cycles) { playSound("well_done"); stopBreathing(); return; }
      }
      advanceBreathStep();
    }, durSec*1000);
  }

  breathStartBtn.addEventListener("click", startBreathing);
  breathStopBtn.addEventListener("click", stopBreathing);
  
  populateBreathOptions();
  try {
    const savedProgram = lsGet(LS_KEYS.breathProgram, "");
    const savedLevel = lsGet(LS_KEYS.breathLevel, "");
    if (savedProgram) { breathProgramSelect.value = savedProgram; breathProgramSelect.dispatchEvent(new Event("change")); }
    if (savedLevel) breathLevelSelect.value = savedLevel;
  } catch(_) {}
  updateBreathInfo();

  let filtered = routes.slice();
  let currentIndex = -1;

  function renderList() {
      routeListEl.innerHTML = "";
      filtered.forEach((route, idx) => {
          const li = document.createElement("li");
          li.className = "route-item" + (idx === currentIndex ? " active" : "");
          li.dataset.index = String(idx);
  
          const title = document.createElement("div");
          title.textContent = route.title || route.id;
  
          const meta = document.createElement("div");
          meta.className = "meta";
          meta.textContent = `${route.city || "Unknown city"} · ${route.mode || "Unknown mode"} · ${route.type.toUpperCase()}`;
  
          li.appendChild(title);
          li.appendChild(meta);
          li.addEventListener("click", () => {
              enterPlaybackMode();
              selectIndex(idx, true);
          });
  
          routeListEl.appendChild(li);
      });
  }

  function applyFilters() {
    const modeVal = modeFilterEl.value.trim().toLowerCase();
    const q = searchInputEl.value.trim().toLowerCase();
    filtered = routes.filter(r => {
      const modeOk = !modeVal || (r.mode || "").toLowerCase() === modeVal;
      const text = `${r.title || ""} ${r.city || ""} ${r.mode || ""}`.toLowerCase();
      const searchOk = !q || text.includes(q);
      return modeOk && searchOk;
    });
    if (currentIndex >= filtered.length) {
      currentIndex = -1;
    }
    renderList();
  }

  function selectIndex(idx, autoPlay = true) {
    currentIndex = idx;
    const route = filtered[idx];
    if (!route) return;
    loadRoute(route, autoPlay);
    renderList();
    updateNowPlaying(route);
    saveToHash(route.id);
    lsSet(LS_KEYS.lastRouteId, route.id);
  }

  function loadRoute(route, autoPlay = true) {
      document.body.classList.remove("landing-mode");
      document.body.classList.add("playback-mode");
  
      videoEl.style.display = "none";
      youtubeEl.style.display = "none";
      placeholderEl.style.display = "none";
  
      videoEl.pause();
      playPauseBtn.textContent = "▶️ Play";
      playPauseBtn.style.display = "inline-block";
      rateSelect.style.display = "";
      volumeRange.style.display = "";
      youtubeEl.style.pointerEvents = "auto";
      youtubeEl.style.clipPath = "";
  
      if (route.type === "mp4") {
        videoEl.src = route.src;
        videoEl.playbackRate = Number(rateSelect.value) || 1;
        videoEl.volume = Number(volumeRange.value) || 0.8;
        videoEl.style.display = "block";
        videoEl.classList.add("fullscreen-fit");
        try { videoEl.muted = true; } catch(_){}
        if (typeof breathingActive !== "undefined" && breathingActive) {
          videoEl.controls = false;
          videoEl.style.pointerEvents = "none";
          playPauseBtn.style.display = "none";
          rateSelect.style.display = "none";
          volumeRange.style.display = "none";
        }
        if (autoPlay) {
          videoEl.play().then(()=>{ playPauseBtn.textContent = "⏸ Pause"; }).catch(()=>{
            playPauseBtn.textContent = "▶️ Play";
            videoEl.controls = true;
            try { videoEl.muted = false; } catch(_){}
          });
        }
      } else if (route.type === "bilibili") {
        let embedUrl = route.src;
        try {
            const u = new URL(route.src);
            u.searchParams.set("autoplay", autoPlay ? "1" : "0");
            embedUrl = u.toString();
        } catch (_) {
            embedUrl = route.src + (route.src.includes("?") ? "&" : "?") + `autoplay=${autoPlay ? "1" : "0"}`;
        }
  
        youtubeEl.src = embedUrl;
        youtubeEl.style.display = "block";
        playPauseBtn.style.display = "none";
        rateSelect.style.display = "none";
        volumeRange.style.display = "none";
        youtubeEl.style.pointerEvents = "none";
        youtubeEl.style.clipPath = "inset(48px 0 96px 0)";
        youtubeEl.setAttribute("sandbox", "allow-same-origin allow-scripts allow-forms");
        youtubeEl.setAttribute("allow", "autoplay; fullscreen");
        youtubeEl.setAttribute("referrerpolicy", "no-referrer");
      } else if (route.type === "youtube") {
        if (Array.isArray(route.variants) && route.variants.length) {
          try {
            const pick = route.variants[Math.floor(Math.random()*route.variants.length)] || route.youtubeId;
            if (pick) route.youtubeId = pick;
          } catch(_) {}
        }
        if (!route.youtubeId || /REPLACE_WITH_YOUTUBE_ID/i.test(String(route.youtubeId))) {
          placeholderEl.textContent = "YouTube 视频未配置";
          placeholderEl.style.display = "grid";
          return;
        }
        const params = new URLSearchParams({
            autoplay: autoPlay ? "1" : "0",
            controls: "0",
            rel: "0",
            modestbranding: "1",
            disablekb: "1",
            fs: "0",
            iv_load_policy: "3",
            playsinline: "1"
        });
        youtubeEl.src = `https://www.youtube.com/embed/${route.youtubeId}?${params.toString()}`;
        youtubeEl.style.display = "block";
        youtubeEl.classList.add("fullscreen-fit");
        youtubeEl.style.pointerEvents = "none";
        playPauseBtn.style.display = "none";
        rateSelect.style.display = "none";
        volumeRange.style.display = "none";
        youtubeEl.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
        youtubeEl.setAttribute("referrerpolicy", "no-referrer");
      } else {
        placeholderEl.textContent = "Unsupported resource type";
        placeholderEl.style.display = "grid";
      }
  }

  function updateNowPlaying(route) {
    const parts = [
      route.title || route.id,
      route.city ? `｜${route.city}` : "",
      route.mode ? `｜${route.mode}` : "",
      `｜${route.type.toUpperCase()}`
    ].filter(Boolean);
    nowPlayingEl.textContent = parts.join("");
    const title = `${route.title || route.id} ｜ ZenDrive Breath`;
    document.title = title;
    const descEl = document.getElementById("meta-desc"); if (descEl) descEl.setAttribute("content", `在${route.city||''}虚拟驾驶视频背景下进行呼吸训练，帮助放松与专注。`);
    const kwEl = document.getElementById("meta-keywords"); if (kwEl) kwEl.setAttribute("content", `${route.city||''}, 呼吸训练, 驾驶, 放松, ZenDrive, breathing trainer, virtual driving`);
    const ogTitle = document.getElementById("og-title"); if (ogTitle) ogTitle.setAttribute("content", title);
    const ogDesc = document.getElementById("og-desc"); if (ogDesc) ogDesc.setAttribute("content", `Breathing trainer with virtual driving in ${route.city||''}.`);
    const twTitle = document.getElementById("tw-title"); if (twTitle) twTitle.setAttribute("content", title);
    const twDesc = document.getElementById("tw-desc"); if (twDesc) twDesc.setAttribute("content", `在${route.city||''}视频背景下进行呼吸训练。`);
    const imgUrl = route.youtubeId ? `https://img.youtube.com/vi/${route.youtubeId}/hqdefault.jpg` : "";
    const ogImg = document.getElementById("og-image"); if (ogImg && imgUrl) ogImg.setAttribute("content", imgUrl);
    const twImg = document.getElementById("tw-image"); if (twImg && imgUrl) twImg.setAttribute("content", imgUrl);
    let ldV = document.getElementById("ld-video"); if (!ldV) { ldV = document.createElement("script"); ldV.type = "application/ld+json"; ldV.id = "ld-video"; document.head.appendChild(ldV); }
    const ldObj = { "@context":"https://schema.org", "@type":"VideoObject", name: route.title || route.id, description: `Virtual driving breathing: ${route.city||''}`, thumbnailUrl: imgUrl? [imgUrl]:[], embedUrl: route.youtubeId? `https://www.youtube.com/embed/${route.youtubeId}`:"", contentUrl: route.youtubeId? `https://www.youtube.com/watch?v=${route.youtubeId}`:"", isFamilyFriendly: true };
    ldV.textContent = JSON.stringify(ldObj);
  }

  function saveToHash(id) {
    if (id) {
      location.hash = `route=${encodeURIComponent(id)}`;
    }
  }

  function restoreFromHash() {
    const match = /route=([^&]+)/.exec(location.hash);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const idxAll = routes.findIndex(r => r.id === id);
      if (idxAll >= 0) {
        applyFilters();
        const idxFiltered = filtered.findIndex(r => r.id === id);
        if (idxFiltered >= 0) {
          selectIndex(idxFiltered, false);
        } else {
          modeFilterEl.value = "";
          searchInputEl.value = "";
          applyFilters();
          const idxAgain = filtered.findIndex(r => r.id === id);
          if (idxAgain >= 0) selectIndex(idxAgain, false);
        }
      }
    }
  }

  playPauseBtn.addEventListener("click", () => {
    if (videoEl.style.display === "block") {
      if (videoEl.paused) {
        videoEl.play().then(() => {
          playPauseBtn.textContent = "⏸ Pause";
        }).catch(() => { });
      } else {
        videoEl.pause();
        playPauseBtn.textContent = "▶️ Play";
      }
    } else {
      alert("Playback is controlled by the embedded player");
    }
  });

  prevBtn.addEventListener("click", () => {
    if (filtered.length === 0) return;
    const prev = (currentIndex - 1 + filtered.length) % filtered.length;
    selectIndex(prev, true);
  });

  nextBtn.addEventListener("click", () => {
    if (filtered.length === 0) return;
    const next = (currentIndex + 1) % filtered.length;
    selectIndex(next, true);
  });

  rateSelect.addEventListener("change", () => {
    const rate = Number(rateSelect.value) || 1;
    if (videoEl.style.display === "block") {
      videoEl.playbackRate = rate;
    }
  });
  rateSelect.addEventListener("change", () => { lsSet(LS_KEYS.rate, rateSelect.value); });

  volumeRange.addEventListener("input", () => {
    const vol = Number(volumeRange.value) || 0.8;
    if (videoEl.style.display === "block") {
      videoEl.volume = vol;
    }
  });
  volumeRange.addEventListener("input", () => { lsSet(LS_KEYS.volume, volumeRange.value); });

  autoplayNextEl.addEventListener("change", () => {
    lsSet(LS_KEYS.autoplayNext, autoplayNextEl.checked ? "1" : "0");
  });

  videoEl.addEventListener("ended", () => {
    if (autoplayNextEl.checked) {
      nextBtn.click();
    } else {
      playPauseBtn.textContent = "▶️ Play";
    }
  });
  videoEl.addEventListener("ended", () => {
    const match = /route=([^&]+)/.exec(location.hash);
    if (match) { const id = decodeURIComponent(match[1]); lsSet(LS_KEYS.mp4ProgressPrefix + id, "0"); }
  });

  let __lastSaveTs = 0;
  videoEl.addEventListener("timeupdate", () => {
    const now = Date.now();
    if (now - __lastSaveTs < 1000) return;
    __lastSaveTs = now;
    const match = /route=([^&]+)/.exec(location.hash);
    if (!match) return;
    const id = decodeURIComponent(match[1]);
    lsSet(LS_KEYS.mp4ProgressPrefix + id, videoEl.currentTime.toFixed(1));
  });

  videoEl.addEventListener("loadedmetadata", () => {
    const match = /route=([^&]+)/.exec(location.hash);
    if (!match) return;
    const id = decodeURIComponent(match[1]);
    const saved = Number(lsGet(LS_KEYS.mp4ProgressPrefix + id, "0")) || 0;
    if (saved > 0) { try { videoEl.currentTime = saved; } catch(_){} }
  });

  videoEl.addEventListener("error", () => {
    const match = /route=([^&]+)/.exec(location.hash);
    const id = match ? decodeURIComponent(match[1]) : "";
    placeholderEl.textContent = (id?`视频加载失败：${id}`:"视频加载失败") + "。请检查网络或更换视频源。";
    placeholderEl.style.display = "grid";
  });

  window.addEventListener("hashchange", () => {
    const match = /route=([^&]+)/.exec(location.hash);
    if (match) lsSet(LS_KEYS.lastRouteId, decodeURIComponent(match[1]));
  });

  modeFilterEl.addEventListener("change", applyFilters);
  searchInputEl.addEventListener("input", applyFilters);

  applyFilters();
  restoreFromHash();
  window.addEventListener("routes-ready", () => {
    applyFilters();
    restoreFromHash();
  });
  try {
    autoplayNextEl.checked = lsGet(LS_KEYS.autoplayNext, "0") === "1";
    const savedRate = lsGet(LS_KEYS.rate, rateSelect.value);
    if (savedRate) rateSelect.value = String(savedRate);
    const savedVol = lsGet(LS_KEYS.volume, volumeRange.value);
    if (savedVol) volumeRange.value = String(savedVol);
  } catch(_) {}
  
  if (!/route=([^&]+)/.test(location.hash)) {
    enterLanding();
  } else {
    document.body.classList.add("playback-mode");
  }
  
  breathProgramSelect.addEventListener("change", () => lsSet(LS_KEYS.breathProgram, breathProgramSelect.value));
  breathLevelSelect.addEventListener("change", () => lsSet(LS_KEYS.breathLevel, breathLevelSelect.value));
  breathProgramSelect.addEventListener("change", updateBreathInfo);
  breathLevelSelect.addEventListener("change", updateBreathInfo);
})();