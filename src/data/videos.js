// 从 scripts/drivenlisten_drive_links.json 动态构建 ROUTES（YouTube）
window.ROUTES = [];

(function(){
  const MAX_ROUTES = 800;
  function extractYouTubeId(url) {
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) {
        return u.pathname.replace('/', '').split('/')[0];
      }
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = /embed\/([A-Za-z0-9_-]{6,})/.exec(u.pathname);
      if (m) return m[1];
      const m2 = /v=([A-Za-z0-9_-]{6,})/.exec(url);
      if (m2) return m2[1];
      return '';
    } catch(_) { const m3 = /v=([A-Za-z0-9_-]{6,})/.exec(String(url)); return m3?m3[1]:''; }
  }

  function tryFetch(paths) {
    return new Promise((resolve, reject) => {
      const next = (i) => {
        if (i >= paths.length) return reject(new Error('all paths failed'));
        fetch(paths[i]).then(r => {
          if (!r.ok) { next(i+1); return; }
          r.json().then(resolve).catch(()=> next(i+1));
        }).catch(()=> next(i+1));
      };
      next(0);
    });
  }

  const candidates = [
    'scripts/drivenlisten_drive_links.json',
    './scripts/drivenlisten_drive_links.json',
    '/scripts/drivenlisten_drive_links.json'
  ];

  tryFetch(candidates)
    .then(list => {
      const groups = new Map();
      for (let i = 0; i < list.length && i < MAX_ROUTES * 3; i++) {
        const item = list[i] || {};
        const id = extractYouTubeId(item.youtube_url || '');
        if (!id) continue;
        const city = String(item.city || '').trim();
        const country = String(item.country || '').trim();
        const title = country ? `${city} — ${country}` : city;
        const key = title.toLowerCase();
        if (!groups.has(key)) {
          groups.set(key, { title, city, ids: [id] });
        } else {
          const g = groups.get(key);
          if (!g.ids.includes(id)) g.ids.push(id);
        }
      }

      const deduped = [];
      let idx = 0;
      for (const [key, g] of groups) {
        if (deduped.length >= MAX_ROUTES) break;
        const youtubeId = g.ids[0];
        deduped.push({
          id: `yt-${idx++}-${(g.city||'unknown').toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,
          title: g.title,
          city: g.city,
          mode: 'drive',
          type: 'youtube',
          youtubeId,
          variants: g.ids
        });
      }

      // 保持数组引用，避免 app.js 的 routes 常量失效
      window.ROUTES.splice(0, window.ROUTES.length, ...deduped);
      window.dispatchEvent(new Event('routes-ready'));
    })
    .catch(err => {
      console.warn('Failed to load drivenlisten list', err);
      // Fallback：提供明确提示项，便于用户确认加载问题
      window.ROUTES.splice(0, window.ROUTES.length, {
        id: 'yt-fallback',
        title: '未加载到 JSON 列表 — 请检查 /scripts 路径',
        city: 'Troubleshoot',
        mode: 'drive',
        type: 'youtube',
        youtubeId: 'dQw4w9WgXcQ'
      });
      window.dispatchEvent(new Event('routes-ready'));
    });
})();