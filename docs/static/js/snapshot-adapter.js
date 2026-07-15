/* Static snapshot adapter for privacy-news GitHub Pages dashboard. */
(function () {
  if (!window.SNAPSHOT_MODE) return;
  const nativeFetch = window.fetch.bind(window);
  const cache = new Map();
  const SITE_NAMES = {
    moleg_news: '법제처(보도자료)', moleg_legis: '법제처(입법예고)',
    pipc: '개인정보보호위원회', privacy: '개인정보포털', kisa: 'KISA'
  };

  function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Snapshot-Mode': 'true' }
    });
  }
  async function loadJson(path, fallback) {
    if (cache.has(path)) return cache.get(path);
    try {
      const res = await nativeFetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      cache.set(path, data);
      return data;
    } catch (e) {
      console.warn('[snapshot] fallback for', path, e);
      cache.set(path, fallback);
      return fallback;
    }
  }
  function getUrl(input) {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    return new URL(raw, window.location.origin);
  }
  function getPath(input) {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    try { return new URL(raw, window.location.origin).pathname; }
    catch (e) { return raw.split('?')[0]; }
  }
  function isApi(path) { return path.startsWith('/api/') || path === '/health'; }
  function limitRows(rows, url) {
    const limit = parseInt(url.searchParams.get('limit') || '0', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    return limit > 0 ? rows.slice(offset, offset + limit) : rows.slice(offset);
  }
  function contains(haystack, needle) {
    return String(haystack || '').toLowerCase().includes(String(needle || '').toLowerCase());
  }
  async function handlePosts(site, url) {
    const payload = await loadJson(`snapshot/api/posts/${site}.json`, { site, data: [], total_count: 0 });
    let rows = (payload.data || []).slice();
    const fromdate = url.searchParams.get('fromdate');
    const todate = url.searchParams.get('todate');
    const search = url.searchParams.get('search');
    if (fromdate) rows = rows.filter(r => !r.post_date || String(r.post_date) >= fromdate);
    if (todate) rows = rows.filter(r => !r.post_date || String(r.post_date) <= todate);
    if (search) rows = rows.filter(r => contains(r.title, search));
    rows.sort((a, b) => String(b.post_date || '').localeCompare(String(a.post_date || '')) || ((b.id || 0) - (a.id || 0)));
    const total = rows.length;
    const data = limitRows(rows, url);
    return { site, display_name: SITE_NAMES[site] || site, count: data.length, total_count: total, offset: parseInt(url.searchParams.get('offset') || '0', 10), limit: parseInt(url.searchParams.get('limit') || String(data.length), 10), data };
  }
  async function handleAlerts(url) {
    let rows = await loadJson('snapshot/api/alerts.json', []);
    const channel = url.searchParams.get('channel_type');
    const job = url.searchParams.get('job_name');
    if (channel) rows = rows.filter(r => r.channel_type === channel);
    if (job) rows = rows.filter(r => r.job_name === job);
    return limitRows(rows, url);
  }
  async function route(input) {
    const path = getPath(input);
    const url = getUrl(input);
    if (path === '/health') return { status: 'ok', mode: 'static_snapshot' };
    if (path === '/api/summary') return loadJson('snapshot/api/summary.json', {});
    if (path === '/api/crawl-progress') return loadJson('snapshot/api/crawl-progress.json', []);
    if (path === '/api/crawl-logs') return limitRows(await loadJson('snapshot/api/crawl-logs.json', []), url);
    if (path === '/api/crawl-logs/failures') return limitRows(await loadJson('snapshot/api/crawl-logs/failures.json', []), url);
    if (path === '/api/alerts') return handleAlerts(url);
    if (path === '/api/system-health') return loadJson('snapshot/api/system-health.json', {});
    if (path === '/api/crawl-timeline') return loadJson('snapshot/api/crawl-timeline.json', {});
    if (path === '/api/logs/files') return loadJson('snapshot/api/logs/files.json', []);
    if (path.startsWith('/api/logs/tail/')) return loadJson('snapshot/api/logs/tail/empty.json', { filename: '', lines: [] });
    if (path.startsWith('/api/email/')) return loadJson('snapshot/api/email/disabled.json', { status: 'warn', message: '정적 페이지에서는 사용할 수 없습니다.' });
    if (path === '/api/law-search') return loadJson('snapshot/api/law-search.json', { status: 'static_unavailable', data: [] });
    const m = path.match(/^\/api\/posts\/([^/]+)$/);
    if (m) return handlePosts(m[1], url);
    return { error: 'Static snapshot endpoint is not available', path };
  }

  window.fetch = async function (input, init) {
    const path = getPath(input);
    if (isApi(path)) return jsonResponse(await route(input));
    return nativeFetch(input, init);
  };

  document.addEventListener('DOMContentLoaded', function () {
    const emailBtn = document.getElementById('email-toggle');
    if (emailBtn) emailBtn.title = '정적 스냅샷 페이지에서는 이메일 등록/해제가 비활성화됩니다.';
  });
})();
