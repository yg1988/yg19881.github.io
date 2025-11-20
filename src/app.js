(function () {
  // --- Data & State ---
  const routes = window.ROUTES || [];
  const programs = window.BREATHING_PROGRAMS || [];
  
  const state = {
    route: null,
    breathProgram: null,
    breathLevel: null,
    isPlaying: false,
    breathingActive: false,
    breathState: {
      cycle: 0,
      stepIndex: 0,
      startTime: 0,
      timerId: null,
      rafId: null
    }
  };

  // --- DOM Elements ---
  const els = {
    landing: document.getElementById('landing'),
    wizard: document.getElementById('setupWizard'),
    appMain: document.querySelector('.app-main'),
    
    // Landing Buttons
    quickStartBtn: document.getElementById('quickStartBtn'),
    customSetupBtn: document.getElementById('customSetupBtn'),
    
    // Wizard
    closeWizardBtn: document.getElementById('closeWizardBtn'),
    wizardSteps: document.querySelectorAll('.step'),
    nextStepBtn: document.querySelector('.next-step-btn'),
    prevStepBtn: document.querySelector('.prev-step-btn'),
    startSessionBtn: document.getElementById('startSessionBtn'),
    wizardModeFilter: document.getElementById('wizardModeFilter'),
    wizardSearch: document.getElementById('wizardSearch'),
    wizardRouteList: document.getElementById('wizardRouteList'),
    wizardBreathProgram: document.getElementById('wizardBreathProgram'),
    wizardBreathLevel: document.getElementById('wizardBreathLevel'),
    wizardBreathInfo: document.getElementById('wizardBreathInfo'),
    
    // Player
    video: document.getElementById('videoPlayer'),
    youtube: document.getElementById('youtubePlayer'),
    placeholder: document.getElementById('placeholder'),
    exitBtn: document.getElementById('exitBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsPanel: document.getElementById('settingsPanel'),
    settingsCloseBtn: document.getElementById('settingsCloseBtn'),
    settingsTabBtns: document.querySelectorAll('.settings-tabs .tab-btn'),
    settingsModeFilter: document.getElementById('settingsModeFilter'),
    settingsSearch: document.getElementById('settingsSearch'),
    settingsRouteList: document.getElementById('settingsRouteList'),
    settingsBreathProgram: document.getElementById('settingsBreathProgram'),
    settingsBreathLevel: document.getElementById('settingsBreathLevel'),
    settingsBreathInfo: document.getElementById('settingsBreathInfo'),
    
    // Dashboard Widget
    dashboard: document.getElementById('dashboardWidget'),
    gaugeProgress: document.getElementById('gaugeProgress'),
    gaugeNeedle: document.getElementById('gaugeNeedle'),
    breathAction: document.getElementById('breathAction'),
    breathTimer: document.getElementById('breathTimer'),
    breathCycleInfo: document.getElementById('breathCycleInfo'),
    dashboardWidget: document.getElementById('dashboardWidget')
  };

  // --- Initialization ---
  function init() {
    // Remove any duplicated sections by id to avoid broken event bindings
    ['landing','setupWizard','videoPlayer','youtubePlayer','placeholder','dashboardWidget','quickStartBtn','customSetupBtn','settingsPanel','settingsBtn'].forEach((id)=>{
      const nodes = document.querySelectorAll(`#${id}`);
      for (let i = 1; i < nodes.length; i++) {
        try { nodes[i].remove(); } catch(_) {}
      }
    });
    setupLanding();
    setupWizard();
    setupPlayer();
    setupSettings();
    window.addEventListener('routes-ready', () => {
      try { renderWizardRoutes(); } catch(_) {}
      try { renderSettingsRoutes(); } catch(_) {}
    });
    
    // Check for hash route (legacy support or direct link)
    const match = /route=([^&]+)/.exec(location.hash);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const route = routes.find(r => r.id === id);
      if (route) {
        // If route exists, just start with default breath settings
        startSession(route, programs[0], programs[0].levels[0]);
      }
    }
  }

  // --- Landing Page Logic ---
  function setupLanding() {
    els.quickStartBtn.addEventListener('click', () => {
      // Random Route
      const driveRoutes = routes.filter(r => r.mode === 'drive');
      const randomRoute = driveRoutes[Math.floor(Math.random() * driveRoutes.length)] || routes[0];
      
      // Random Program (prefer 'Relax' or similar if available, else random)
      const randomProgram = programs[Math.floor(Math.random() * programs.length)];
      const randomLevel = randomProgram.levels[0]; // Start with level 1 usually
      
      startSession(randomRoute, randomProgram, randomLevel);
    });

    els.customSetupBtn.addEventListener('click', () => {
      openWizard();
    });
  }

  // --- Wizard Logic ---
  let currentWizardStep = 1;
  let selectedRoute = null;

  function openWizard() {
    els.wizard.classList.add('active');
    currentWizardStep = 1;
    updateWizardSteps();
    try { els.wizardModeFilter.value = 'drive'; } catch(_) {}
    renderWizardRoutes();
    populateBreathOptions();
  }

  function closeWizard() {
    els.wizard.classList.remove('active');
  }

  function updateWizardSteps() {
    els.wizardSteps.forEach(step => {
      step.classList.toggle('active', parseInt(step.dataset.step) === currentWizardStep);
    });
  }

  function setupWizard() {
    els.closeWizardBtn.addEventListener('click', closeWizard);
    
    els.nextStepBtn.addEventListener('click', () => {
      if (currentWizardStep < 2) {
        currentWizardStep++;
        updateWizardSteps();
      }
    });

    els.prevStepBtn.addEventListener('click', () => {
      if (currentWizardStep > 1) {
        currentWizardStep--;
        updateWizardSteps();
      }
    });

    els.startSessionBtn.addEventListener('click', () => {
      const pName = els.wizardBreathProgram.value;
      const lName = els.wizardBreathLevel.value;
      const prog = programs.find(p => p.program === pName);
      const level = prog.levels.find(l => l.level === lName);
      
      if (selectedRoute && prog && level) {
        startSession(selectedRoute, prog, level);
        closeWizard();
      }
    });

    // Route Filters
    els.wizardModeFilter.addEventListener('change', renderWizardRoutes);
    els.wizardSearch.addEventListener('input', renderWizardRoutes);
    
    // Breath Options
    els.wizardBreathProgram.addEventListener('change', () => {
      populateBreathLevels();
      updateBreathInfo();
    });
    els.wizardBreathLevel.addEventListener('change', updateBreathInfo);
  }

  function renderWizardRoutes() {
    const mode = els.wizardModeFilter.value.toLowerCase();
    const search = els.wizardSearch.value.toLowerCase();
    
    const filtered = routes.filter(r => {
      const m = (r.mode || '').toLowerCase();
      const t = (r.title || '').toLowerCase() + ' ' + (r.city || '').toLowerCase();
      return (!mode || m === mode) && (!search || t.includes(search));
    });

    els.wizardRouteList.innerHTML = '';
    filtered.slice(0, 50).forEach(r => { // Limit to 50 for performance
      const li = document.createElement('li');
      li.className = 'route-item';
      if (selectedRoute && selectedRoute.id === r.id) li.classList.add('selected');
      
      li.innerHTML = `
        <div class="title">${r.title || r.city}</div>
        <div class="meta">${r.city} · ${r.mode}</div>
      `;
      
      li.addEventListener('click', () => {
        selectedRoute = r;
        document.querySelectorAll('.route-item').forEach(el => el.classList.remove('selected'));
        li.classList.add('selected');
        els.nextStepBtn.disabled = false;
      });
      
      els.wizardRouteList.appendChild(li);
    });
  }

  function populateBreathOptions() {
    els.wizardBreathProgram.innerHTML = '';
    programs.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.program;
      opt.textContent = p.program;
      els.wizardBreathProgram.appendChild(opt);
    });
    populateBreathLevels();
    updateBreathInfo();
  }

  function populateBreathLevels() {
    const pName = els.wizardBreathProgram.value;
    const prog = programs.find(p => p.program === pName);
    els.wizardBreathLevel.innerHTML = '';
    if (prog) {
      prog.levels.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.level;
        opt.textContent = l.level;
        els.wizardBreathLevel.appendChild(opt);
      });
    }
  }

  function updateBreathInfo() {
    const pName = els.wizardBreathProgram.value;
    const lName = els.wizardBreathLevel.value;
    const prog = programs.find(p => p.program === pName);
    const level = prog ? prog.levels.find(l => l.level === lName) : null;
    
    if (prog && level) {
      const seqStr = level.sequence.map(s => `${s.step} ${s.duration}s`).join(' → ');
      els.wizardBreathInfo.textContent = `${prog.description}\n\nSequence: ${seqStr}\nCycles: ${level.cycles}`;
    }
  }

  // --- Session Logic ---
  function startSession(route, program, level) {
    state.route = route;
    state.breathProgram = program;
    state.breathLevel = level;
    
    // UI Transition
    els.landing.style.display = 'none';
    els.appMain.classList.add('visible');
    els.dashboardWidget.classList.remove('hidden');
    
    // Load Video
    loadRouteVideo(route);
    
    // Start Breathing
    startBreathingLogic(level);
    
    try { if (audioCtx) audioCtx.resume(); } catch(_) {}
  }

  function loadRouteVideo(route) {
    els.video.style.display = 'none';
    els.youtube.style.display = 'none';
    els.placeholder.style.display = 'none';
    
    if (route.type === 'mp4') {
      els.video.src = route.src;
      els.video.style.display = 'block';
      fitAndCropMedia(els.video);
      els.video.loop = true;
      els.video.play().catch(e => console.log("Autoplay blocked", e));
    } else if (route.type === 'youtube') {
      els.youtube.style.display = 'block';
      // Use existing YT logic or simple embed
      const embedUrl = `https://www.youtube-nocookie.com/embed/${route.youtubeId}?autoplay=1&controls=0&mute=1&loop=1&playlist=${route.youtubeId}&playsinline=1`;
      els.youtube.src = embedUrl;
      fitAndCropMedia(els.youtube);
    }
  }

  function setupPlayer() {
    if (els.exitBtn) {
      els.exitBtn.addEventListener('click', () => {
        location.reload();
      });
    }

    window.addEventListener('resize', () => {
      if (els.youtube.style.display === 'block') {
        fitAndCropMedia(els.youtube);
      } else if (els.video.style.display === 'block') {
        fitAndCropMedia(els.video);
      }
    });
  }

  function openSettings() {
    els.settingsPanel.classList.add('open');
    try {
      // Ensure Routes tab is active by default
      els.settingsTabBtns.forEach(b => b.classList.remove('active'));
      const routesBtn = Array.from(els.settingsTabBtns).find(b => b.dataset.tab === 'routes');
      if (routesBtn) routesBtn.classList.add('active');
      document.querySelector('.routes-tab').classList.add('active');
      document.querySelector('.breathing-tab').classList.remove('active');
      // Default to Drive and clear search, then render
      if (els.settingsModeFilter) els.settingsModeFilter.value = 'drive';
      if (els.settingsSearch) els.settingsSearch.value = '';
      renderSettingsRoutes();
    } catch(_) {}
  }
  function closeSettings() { els.settingsPanel.classList.remove('open'); }

  function setupSettings() {
    if (!els.settingsBtn && els.exitBtn) {
      const btn = els.exitBtn;
      const newBtn = btn.cloneNode(true);
      newBtn.id = 'settingsBtn';
      newBtn.textContent = 'Settings';
      btn.parentNode.replaceChild(newBtn, btn);
      els.settingsBtn = document.getElementById('settingsBtn');
    }
    if (els.settingsBtn) els.settingsBtn.addEventListener('click', openSettings);
    if (els.settingsCloseBtn) els.settingsCloseBtn.addEventListener('click', closeSettings);
    els.settingsTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        els.settingsTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.querySelector('.routes-tab').classList.toggle('active', tab === 'routes');
        document.querySelector('.breathing-tab').classList.toggle('active', tab === 'breathing');
      });
    });
    populateSettingsBreath();
    try { els.settingsModeFilter.value = 'drive'; } catch(_) {}
    renderSettingsRoutes();
    els.settingsModeFilter.addEventListener('change', renderSettingsRoutes);
    els.settingsSearch.addEventListener('input', renderSettingsRoutes);
    els.settingsBreathProgram.addEventListener('change', () => { populateSettingsLevels(); updateSettingsBreathInfo(); applyBreathFromSettings(); });
    els.settingsBreathLevel.addEventListener('change', () => { updateSettingsBreathInfo(); applyBreathFromSettings(); });
  }

  function renderSettingsRoutes() {
    const mode = (els.settingsModeFilter.value || '').toLowerCase();
    const search = (els.settingsSearch.value || '').toLowerCase();
    const filtered = routes.filter(r => {
      const m = (r.mode || '').toLowerCase();
      const t = ((r.title || '') + ' ' + (r.city || '')).toLowerCase();
      return (!mode || m === mode) && (!search || t.includes(search));
    });
    els.settingsRouteList.innerHTML = '';
    filtered.slice(0, 100).forEach(r => {
      const li = document.createElement('li');
      li.className = 'route-item';
      if (state.route && state.route.id === r.id) li.classList.add('selected');
      li.innerHTML = `<div class="title">${r.title || r.city}</div><div class="meta">${r.city} · ${r.mode}</div>`;
      li.addEventListener('click', () => {
        state.route = r;
        loadRouteVideo(r);
        document.querySelectorAll('#settingsRouteList .route-item').forEach(el => el.classList.remove('selected'));
        li.classList.add('selected');
      });
      els.settingsRouteList.appendChild(li);
    });
  }

  function populateSettingsBreath() {
    els.settingsBreathProgram.innerHTML = '';
    programs.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.program;
      opt.textContent = p.program;
      els.settingsBreathProgram.appendChild(opt);
    });
    populateSettingsLevels();
    updateSettingsBreathInfo();
  }
  function populateSettingsLevels() {
    const pName = els.settingsBreathProgram.value;
    const prog = programs.find(p => p.program === pName);
    els.settingsBreathLevel.innerHTML = '';
    if (prog) {
      prog.levels.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.level;
        opt.textContent = l.level;
        els.settingsBreathLevel.appendChild(opt);
      });
    }
  }
  function updateSettingsBreathInfo() {
    const pName = els.settingsBreathProgram.value;
    const lName = els.settingsBreathLevel.value;
    const prog = programs.find(p => p.program === pName);
    const level = prog ? prog.levels.find(l => l.level === lName) : null;
    if (prog && level) {
      const seqStr = level.sequence.map(s => `${s.step} ${s.duration}s`).join(' → ');
      els.settingsBreathInfo.textContent = `${prog.description}\n\nSequence: ${seqStr}\nCycles: ${level.cycles}`;
    }
  }
  function applyBreathFromSettings() {
    const pName = els.settingsBreathProgram.value;
    const lName = els.settingsBreathLevel.value;
    const prog = programs.find(p => p.program === pName);
    const level = prog ? prog.levels.find(l => l.level === lName) : null;
    if (prog && level) {
      state.breathProgram = prog;
      state.breathLevel = level;
      state.breathingActive = false;
      if (state.breathState.rafId) cancelAnimationFrame(state.breathState.rafId);
      startBreathingLogic(level);
    }
  }

  // Fit, overscan and crop to hide YouTube UI/title
  function fitAndCropMedia(el) {
    try {
      const ar = 16/9;
      const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
      const vh = window.innerHeight || document.documentElement.clientHeight || 720;
      const r = vw / vh;
      const topCrop = Math.round(vh * 0.08);
      const bottomCrop = Math.round(vh * 0.12);
      let overscan = 1 + (topCrop + bottomCrop)/vh + 0.04;
      let h = vh * overscan;
      let w = h * ar;
      if (w < vw) {
        overscan = Math.max(overscan, vw/(vh*ar));
        h = vh * overscan;
        w = h * ar;
      }
      el.style.position = 'absolute';
      el.style.top = '50%';
      el.style.left = '50%';
      el.style.transform = 'translate(-50%, -50%)';
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.backgroundColor = '#000';
      el.style.clipPath = `inset(${topCrop}px 0 ${bottomCrop}px 0)`;
    } catch (_) {}
  }

  // --- Breathing Logic & Animation ---
  // Use WebAudio beeps instead of external files to avoid 404s
  let audioCtx = null;
  const cueFreq = {
    inhale: 520,
    retain: 340,
    exhale: 420,
    sustain: 300,
    start: 680,
    done: 540
  };
  const soundFiles = {
    inhale: 'sounds/inhale.wav',
    exhale: 'sounds/exhale.wav',
    retain: 'sounds/retain.wav',
    sustain: 'sounds/sustain.wav',
    start: 'sounds/start.wav',
    preparing: 'sounds/preparing.wav',
    done: 'sounds/well_done.wav'
  };
  const soundAudio = {};
  Object.keys(soundFiles).forEach((k)=>{ const a = new Audio(soundFiles[k]); a.preload = 'auto'; soundAudio[k] = a; });
  function beep(name) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const freq = cueFreq[name];
      if (!freq || !audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const now = audioCtx.currentTime;
      const dur = name === 'start' ? 0.18 : name === 'done' ? 0.22 : 0.14;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now); osc.stop(now + dur + 0.02);
    } catch (_) {}
  }
  function playSound(name) {
    try {
      const a = soundAudio[name];
      if (a) { a.currentTime = 0; a.play().catch(()=> beep(name)); } else { beep(name); }
    } catch(_) { beep(name); }
  }

  function startBreathingLogic(level) {
    state.breathingActive = true;
    state.breathState.cycle = 1;
    state.breathState.stepIndex = 0;
    
    playSound('start');
    runStartDelay();
  }

  function runStartDelay() {
    if (!state.breathingActive) return;
    const level = state.breathLevel;
    const duration = 2000;
    state.breathState.startTime = Date.now();
    updateDashboardUI({ step: 'START' }, state.breathState.cycle, level.cycles);
    if (state.breathState.rafId) cancelAnimationFrame(state.breathState.rafId);
    function animate() {
      const now = Date.now();
      const elapsed = now - state.breathState.startTime;
      const progress = Math.min(elapsed / duration, 1);
      updateGauge(progress, 'START');
      els.breathTimer.textContent = ((duration - elapsed) / 1000).toFixed(1);
      if (progress < 1) {
        state.breathState.rafId = requestAnimationFrame(animate);
      } else {
        runBreathStep();
      }
    }
    state.breathState.rafId = requestAnimationFrame(animate);
  }

  function runBreathStep() {
    if (!state.breathingActive) return;
    
    const level = state.breathLevel;
    const step = level.sequence[state.breathState.stepIndex];
    
    if (!step) {
      // End of sequence, check cycles
      if (state.breathState.cycle < level.cycles) {
        state.breathState.cycle++;
        state.breathState.stepIndex = 0;
        runBreathStep();
      } else {
        finishSession();
      }
      return;
    }

    // Update State
    const duration = step.duration * 1000;
    state.breathState.startTime = Date.now();
    
    // UI Updates
    updateDashboardUI(step, state.breathState.cycle, level.cycles);
    playSound(step.step.toLowerCase());

    // Animation Loop
    if (state.breathState.rafId) cancelAnimationFrame(state.breathState.rafId);
    
    function animate() {
      const now = Date.now();
      const elapsed = now - state.breathState.startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      updateGauge(progress, step.step);
      els.breathTimer.textContent = ((duration - elapsed) / 1000).toFixed(1);
      
      if (progress < 1) {
        state.breathState.rafId = requestAnimationFrame(animate);
      } else {
        // Step Complete
        state.breathState.stepIndex++;
        runBreathStep();
      }
    }
    
    state.breathState.rafId = requestAnimationFrame(animate);
  }

  function updateDashboardUI(step, currentCycle, totalCycles) {
    els.breathAction.textContent = step.step;
    els.breathCycleInfo.textContent = `Cycle ${currentCycle}/${totalCycles}`;
    
    // Update classes for color
    els.dashboardWidget.className = 'dashboard-widget'; // reset
    const cls = `state-${step.step.toLowerCase()}`;
    els.dashboardWidget.classList.add(cls);
  }

  function updateGauge(progress, type) {
    // Gauge is a semi-circle (180 deg).
    // Align needle direction with color arc (left → right)
    const startAngle = 0;
    const endAngle = 180;
    const currentAngle = startAngle + (progress * (endAngle - startAngle));
    
    els.gaugeNeedle.setAttribute('transform', `rotate(${currentAngle}, 100, 100)`);
    
    // Progress Bar (Stroke Dashoffset)
    // Total length for semi-circle radius 80 is PI * 80 ≈ 251.2
    const totalLen = 251.2;
    const offset = totalLen * (1 - progress);
    els.gaugeProgress.style.strokeDashoffset = offset;
  }

  function finishSession() {
    state.breathingActive = false;
    playSound('done');
    els.breathAction.textContent = "DONE";
    els.breathTimer.textContent = "0.0";
    els.gaugeNeedle.setAttribute('transform', `rotate(0, 100, 100)`);
    setTimeout(() => {
      alert("Session Complete! Great job.");
      location.reload();
    }, 2000);
  }

  // Run Init
  init();
})();