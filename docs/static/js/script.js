/* File Path : privacy-news-crawler/dashboard/static/js/script.js */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initThemeToggle();
  initHamburger();
  initDataTab();
  initLawTab();
  initMonitorTab();
  initEmailModal();
  initDownload();
  initAutoRefresh();
});

/* ═══════════════════════════════════════
   Tab Navigation
   ═══════════════════════════════════════ */

function initTabs() {
  const allTabs = document.querySelectorAll('.nav-tab, .nav-tab-mobile');
  allTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.nav-tab, .nav-tab-mobile').forEach(t => t.classList.remove('active'));
      document.querySelectorAll(`[data-tab="${tabId}"]`).forEach(t => t.classList.add('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      document.getElementById('nav-mobile').classList.remove('open');
      // 탭 전환 시 자동 새로고침 타이머 재설정
      if (typeof restartAutoRefresh === 'function') restartAutoRefresh(tabId);
    });
  });
}

/* ═══════════════════════════════════════
   Theme Toggle
   ═══════════════════════════════════════ */

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  const update = () => {
    const isDark = document.documentElement.classList.contains('dark');
    btn.textContent = isDark ? '☀️ 라이트모드' : '🌙 다크모드';
    btn.title = isDark ? '라이트 모드로 전환' : '다크 모드로 전환';
  };
  update();
  btn.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('darkMode', isDark);
    update();
  });
}

/* ═══════════════════════════════════════
   Mobile Hamburger
   ═══════════════════════════════════════ */

function initHamburger() {
  const btn = document.getElementById('nav-hamburger');
  const menu = document.getElementById('nav-mobile');
  btn.addEventListener('click', () => menu.classList.toggle('open'));
}

/* ═══════════════════════════════════════
   TAB 1: 크롤링 데이터
   ═══════════════════════════════════════ */

const PAGE_SIZE = 30;

/*
 * SITES 설정:
 * - 법제처: 보도자료 + 입법예고 → 같은 라인 안에 두 개 리스트 (side-by-side)
 * - 개인정보보호위원회: 공지사항+보도자료 → 통합 리스트 (board_type으로 출처 구분)
 * - 개인정보포털: 단독 리스트
 * - KISA: 공지사항+보도자료 → 통합 리스트 (board_type으로 출처 구분)
 */
const SITES = [
  { key: 'moleg_legis',  icon: '📋', name: '법제처(입법예고)',
    cols: ['law_type','title','department','start_date','end_date'] },
  { key: 'moleg_news',   icon: '⚖️', name: '법제처(보도자료)',
    cols: ['title','department','post_date'] },
  { key: 'pipc',         icon: '🏛️', name: 'PIPC (개인정보보호위원회)',
    cols: ['title','department','board_type','post_date'] },
  { key: 'kisa',         icon: '🔒', name: 'KISA (한국인터넷진흥원)',
    cols: ['title','board_type','post_date'] },
  { key: 'privacy',      icon: '🔐', name: '개인정보포털',
    cols: ['title','author','bbsno','post_date'] },
];

const COL_LABELS = {
  title: '제목',
  department: '담당부서',
  post_date: '작성일',
  post_number: '번호',
  hits: '조회수',
  attachment: '첨부',
  is_notice: 'Notice',
  board_type: '출처',
  law_type: '법령종류',
  start_date: '시작일자',
  end_date: '종료일자',
  author: '작성자',
  bbsno: '게시글UID',
};

// 사이트별 컬럼 레이블 오버라이드
const SITE_COL_OVERRIDES = {
  moleg_news: {
    post_date: '등록일',
  },
  moleg_legis: {
    title: '입법예고명',
    department: '소관부처',
  },
};

// 페이지네이션 상태 관리
const paginationState = {};

function initDataTab() {
  loadSummary();
  loadAllPosts();

  document.getElementById('data-filter-btn').addEventListener('click', loadAllPosts);
  document.getElementById('data-reset-btn').addEventListener('click', () => {
    document.getElementById('data-from').value = '';
    document.getElementById('data-to').value = '';
    document.getElementById('data-search').value = '';
    loadAllPosts();
  });

  document.getElementById('data-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadAllPosts();
  });
}

async function loadSummary() {
  try {
    const res = await fetch('/api/summary');
    const data = await res.json();
    document.querySelectorAll('.summary-card').forEach(card => {
      const site = card.dataset.site;
      if (data[site]) {
        card.querySelector('.summary-count').textContent = data[site].total_count.toLocaleString() + '건';
        const lastDate = data[site].last_collected
          ? new Date(data[site].last_collected).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
          : '--';
        card.querySelector('.summary-sub').textContent = '최신 수집: ' + lastDate;

        // last_success 표시
        const successEl = card.querySelector('.summary-last-success');
        if (successEl && data[site].last_success) {
          const successDate = new Date(data[site].last_success).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
          successEl.textContent = '최근 성공: ' + successDate;
          successEl.style.display = 'block';
        } else if (successEl) {
          successEl.textContent = '최근 성공: --';
          successEl.style.display = 'block';
        }
      }
    });
  } catch (e) {
    console.error('Summary load error:', e);
  }
}

async function fetchPosts(siteKey, offset = 0) {
  const fromdate = document.getElementById('data-from').value;
  const todate = document.getElementById('data-to').value;
  const search = document.getElementById('data-search').value;

  const params = new URLSearchParams();
  if (fromdate) params.set('fromdate', fromdate);
  if (todate) params.set('todate', todate);
  if (search) params.set('search', search);
  params.set('limit', PAGE_SIZE);
  params.set('offset', offset);

  const res = await fetch(`/api/posts/${siteKey}?${params}`);
  return await res.json();
}

async function loadAllPosts() {
  const container = document.getElementById('data-tables-container');
  container.innerHTML = '<div class="loading-placeholder loading-animate">데이터를 불러오는 중...</div>';

  // 페이지네이션 상태 초기화
  for (const site of SITES) {
    paginationState[site.key] = { offset: 0, hasMore: true, rows: [] };
  }

  let html = '';

  // ── 법제처: side-by-side ──
  const molegNews = SITES.find(s => s.key === 'moleg_news');
  const molegLegis = SITES.find(s => s.key === 'moleg_legis');

  try {
    const [newsJson, legisJson] = await Promise.all([
      fetchPosts('moleg_news'),
      fetchPosts('moleg_legis'),
    ]);
    const newsRows = sortRowsByDate(newsJson.data || [], molegNews);
    const legisRows = sortRowsByDate(legisJson.data || [], molegLegis);

    paginationState['moleg_news'].rows = newsRows;
    paginationState['moleg_news'].hasMore = newsRows.length >= PAGE_SIZE;
    paginationState['moleg_news'].offset = newsRows.length;
    paginationState['moleg_news'].totalCount = newsJson.total_count || 0;

    paginationState['moleg_legis'].rows = legisRows;
    paginationState['moleg_legis'].hasMore = legisRows.length >= PAGE_SIZE;
    paginationState['moleg_legis'].offset = legisRows.length;
    paginationState['moleg_legis'].totalCount = legisJson.total_count || 0;

    html += renderMolegSideBySide(molegNews, newsRows, molegLegis, legisRows);
  } catch (e) {
    html += `<div class="site-section"><p class="placeholder-text">법제처 데이터 로딩 실패</p></div>`;
  }

  // ── 나머지 사이트 ──
  const otherSites = SITES.filter(s => s.key !== 'moleg_news' && s.key !== 'moleg_legis');
  for (const site of otherSites) {
    try {
      const json = await fetchPosts(site.key);
      let rows = sortRowsByDate(json.data || [], site);

      paginationState[site.key].rows = rows;
      paginationState[site.key].hasMore = rows.length >= PAGE_SIZE;
      paginationState[site.key].offset = rows.length;
      paginationState[site.key].totalCount = json.total_count || 0;

      html += renderSiteSection(site, rows);
    } catch (e) {
      html += `<div class="site-section"><p class="placeholder-text">${site.name} 로딩 실패</p></div>`;
    }
  }

  container.innerHTML = html;
  initTableSort();
  initLoadMoreButtons();
}

/**
 * 법제처 보도자료 + 입법예고를 수직으로 표시 (들여쓰기 적용)
 * 각 리스트는 개별 섹션으로 렌더링되며, 하단에 '-- 더보기 --' 버튼 배치
 */
function renderMolegSideBySide(newsSite, newsRows, legisSite, legisRows) {
  let h = `<div class="site-section moleg-parent-section">
    <div class="site-section-header">
      <h3>⚖️ 법제처</h3>
    </div>
    <div class="moleg-subsections">`;

  // 입법예고
  h += `<div class="moleg-subsection" id="moleg-legis-section">
    <div class="moleg-subsection-header">
      <h4>📋 입법예고</h4>
      <span class="badge">${legisRows.length}건</span>
    </div>
    <div class="table-scroll" style="max-height:480px; overflow-y:auto;">
      ${renderTableHtml(legisSite, legisRows, 'moleg_legis')}
    </div>
    ${paginationState['moleg_legis'].hasMore ? `<div class="load-more-row"><button class="btn btn-outline btn-sm load-more-btn" data-site="moleg_legis">-- 더보기 --</button></div>` : ''}
  </div>`;

  // 보도자료
  h += `<div class="moleg-subsection" id="moleg-news-section">
    <div class="moleg-subsection-header">
      <h4>📰 보도자료</h4>
      <span class="badge">${newsRows.length}건</span>
    </div>
    <div class="table-scroll" style="max-height:480px; overflow-y:auto;">
      ${renderTableHtml(newsSite, newsRows, 'moleg_news')}
    </div>
    ${paginationState['moleg_news'].hasMore ? `<div class="load-more-row"><button class="btn btn-outline btn-sm load-more-btn" data-site="moleg_news">-- 더보기 --</button></div>` : ''}
  </div>`;

  h += `</div></div>`;
  return h;
}

/**
 * 테이블 HTML 생성 (공통)
 */
function renderTableHtml(site, rows, tableId) {
  if (rows.length === 0) {
    return '<p class="placeholder-text">조회된 데이터가 없습니다.</p>';
  }

  const overrides = SITE_COL_OVERRIDES[tableId || site.key] || {};

  let h = `<table class="data-table sortable" id="table-${tableId || site.key}">`;
  h += '<thead><tr>';
  for (const col of site.cols) {
    const label = overrides[col] || COL_LABELS[col] || col;
    h += `<th data-col="${col}">${label} <span class="sort-arrow">⇅</span></th>`;
  }
  h += '</tr></thead><tbody>';
  h += renderRowsHtml(site, rows);
  h += '</tbody></table>';
  return h;
}

/**
 * 테이블 행 HTML 생성
 */
function renderRowsHtml(site, rows) {
  const searchTerm = (document.getElementById('data-search')?.value || '').trim();
  let h = '';
  for (const row of rows) {
    h += '<tr>';
    for (const col of site.cols) {
      if (col === 'title') {
        const link = row.link || '#';
        const titleText = row.title || '';
        const displayTitle = searchTerm ? highlightText(escHtml(titleText), searchTerm) : escHtml(titleText);
        h += `<td class="td-title-cell"><a href="${escHtml(link)}" target="_blank" title="${escHtml(titleText)}" class="table-link compact">${displayTitle}</a></td>`;
      } else if (col === 'post_date' || col === 'start_date' || col === 'end_date') {
        h += `<td>${row[col] || ''}</td>`;
      } else if (col === 'board_type') {
        const bt = row.board_type || '';
        const tagClass = bt === '공지사항' ? 'tag-notice' : 'tag-press';
        h += `<td><span class="tag ${tagClass} compact">${escHtml(bt)}</span></td>`;
      } else if (col === 'is_notice') {
        const badge = row.is_notice === 'O' ? '<span class="tag tag-notice">O</span>' : '';
        h += `<td style="text-align:center;">${badge}</td>`;
      } else {
        const val = String(row[col] || '');
        const displayVal = searchTerm ? highlightText(escHtml(val), searchTerm) : escHtml(val);
        h += `<td title="${escHtml(val)}">${displayVal}</td>`;
      }
    }
    h += '</tr>';
  }
  return h;
}

/**
 * 검색 키워드 하이라이트
 * escHtml 처리된 텍스트에서 검색어를 찾아 <mark> 태그로 감싸기
 */
function highlightText(escapedHtml, searchTerm) {
  if (!searchTerm) return escapedHtml;
  const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedSearch})`, 'gi');
  return escapedHtml.replace(regex, '<mark class="search-highlight">$1</mark>');
}

function renderSiteSection(site, rows) {
  let h = `<div class="site-section">
    <div class="site-section-header">
      <h3>${site.icon} ${site.name}</h3>
      <span class="badge">${rows.length}건</span>
    </div>`;

  if (rows.length === 0) {
    h += '<p class="placeholder-text">조회된 데이터가 없습니다.</p>';
  } else {
    h += `<div class="table-scroll" style="max-height:480px; overflow-y:auto;">${renderTableHtml(site, rows, site.key)}</div>`;
    if (paginationState[site.key] && paginationState[site.key].hasMore) {
      h += `<div class="load-more-row"><button class="btn btn-outline btn-sm load-more-btn" data-site="${site.key}">-- 더보기 --</button></div>`;
    }
  }
  h += '</div>';
  return h;
}

/**
 * "더 보기" 버튼 이벤트 바인딩
 */
function initLoadMoreButtons() {
  document.querySelectorAll('.load-more-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const siteKey = this.dataset.site;
      const state = paginationState[siteKey];
      if (!state || !state.hasMore) return;

      this.disabled = true;
      this.textContent = '로딩 중...';

      try {
        const json = await fetchPosts(siteKey, state.offset);
        const site = SITES.find(s => s.key === siteKey);
        const newRows = sortRowsByDate(json.data || [], site);

        if (newRows.length === 0) {
          state.hasMore = false;
          this.parentElement.remove();
          return;
        }

        state.rows = state.rows.concat(newRows);
        state.offset += newRows.length;
        state.hasMore = newRows.length >= PAGE_SIZE;

        // 테이블에 행 추가
        const tableId = `table-${siteKey}`;
        const table = document.getElementById(tableId);
        if (table) {
          const tbody = table.querySelector('tbody');
          tbody.insertAdjacentHTML('beforeend', renderRowsHtml(site, newRows));

          // 배지 업데이트
          const section = table.closest('.site-section, .moleg-subsection');
          if (section) {
            const badge = section.querySelector('.badge');
            if (badge) badge.textContent = `${state.rows.length}건`;
          }

          // 스크롤 컨테이너를 새로 로드된 행 위치로 이동
          const scrollContainer = table.closest('.table-scroll');
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        }

        if (!state.hasMore) {
          this.parentElement.remove();
        } else {
          this.disabled = false;
          this.textContent = '-- 더보기 --';
        }
      } catch (e) {
        console.error('Load more error:', e);
        this.disabled = false;
        this.textContent = '-- 더보기 -- (오류 발생)';
      }
    });
  });
}

/**
 * 날짜 컬럼 기준으로 최신 글이 상단에 오도록 정렬
 */
function sortRowsByDate(rows, site) {
  let dateField = 'post_date';
  if (site.key === 'moleg_legis') {
    dateField = 'start_date';
  }

  return rows.sort((a, b) => {
    const dateA = a[dateField] || a['post_date'] || '';
    const dateB = b[dateField] || b['post_date'] || '';
    if (dateA > dateB) return -1;
    if (dateA < dateB) return 1;
    return 0;
  });
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ═══════════════════════════════════════
   Table Sort
   ═══════════════════════════════════════ */

function initTableSort() {
  document.querySelectorAll('.data-table.sortable').forEach(table => {
    const headers = table.querySelectorAll('thead th');
    headers.forEach((th, idx) => {
      th.addEventListener('click', () => {
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const current = th.dataset.sortDir || 'none';
        let dir = current === 'none' ? 'asc' : current === 'asc' ? 'desc' : 'none';
        th.dataset.sortDir = dir;

        headers.forEach(h => { if (h !== th) h.dataset.sortDir = 'none'; });

        headers.forEach(h => {
          const arrow = h.querySelector('.sort-arrow');
          if (!arrow) return;
          arrow.classList.remove('active');
          arrow.textContent = '⇅';
        });
        const arrow = th.querySelector('.sort-arrow');
        if (dir === 'asc') { arrow.textContent = '▲'; arrow.classList.add('active'); }
        else if (dir === 'desc') { arrow.textContent = '▼'; arrow.classList.add('active'); }

        if (dir === 'none') return;

        rows.sort((a, b) => {
          const aVal = (a.children[idx]?.textContent || '').trim().toLowerCase();
          const bVal = (b.children[idx]?.textContent || '').trim().toLowerCase();
          if (aVal < bVal) return dir === 'asc' ? -1 : 1;
          if (aVal > bVal) return dir === 'asc' ? 1 : -1;
          return 0;
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });
  });
}

/* ═══════════════════════════════════════
   TAB 2: 법령 검색
   ═══════════════════════════════════════ */

function initLawTab() {
  document.getElementById('law-search-btn').addEventListener('click', searchLaw);

  const lawInput = document.getElementById('law-fromdate');
  lawInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchLaw();
  });

  // 숫자만 허용, 8자리 제한
  lawInput.addEventListener('input', () => {
    lawInput.value = lawInput.value.replace(/[^0-9]/g, '').substring(0, 8);
  });
}

async function searchLaw() {
  const fromdate = document.getElementById('law-fromdate').value.trim();
  const container = document.getElementById('law-result-container');
  const loading = document.getElementById('law-loading');

  if (!fromdate || fromdate.length !== 8) {
    container.innerHTML = '<p class="placeholder-text">YYYYMMDD 형식으로 입력해주세요.</p>';
    return;
  }

  loading.style.display = 'block';
  container.innerHTML = '';

  try {
    const res = await fetch(`/api/law-search?fromdate=${fromdate}`);
    const json = await res.json();
    loading.style.display = 'none';

    if (json.error) {
      container.innerHTML = `<p class="placeholder-text">오류: ${escHtml(json.error)}</p>`;
      return;
    }

    if (!json.data || json.data.length === 0) {
      container.innerHTML = '<p class="placeholder-text">검색 결과가 없습니다.</p>';
      return;
    }

    let html = `<div class="filter-bar" style="margin-bottom:16px; padding:10px 16px;">
      <div class="filter-group">
        <label>결과 내 검색</label>
        <input type="text" id="law-inner-search" placeholder="결과 내 검색..." style="width:280px;" />
      </div>
    </div>`;

    html += '<div class="table-scroll"><table class="data-table sortable" id="law-result-table"><thead><tr>';
    for (const col of json.columns) {
      html += `<th>${escHtml(col)} <span class="sort-arrow">⇅</span></th>`;
    }
    html += '</tr></thead><tbody>';
    for (const row of json.data) {
      html += '<tr>';
      for (const col of json.columns) {
        if (col === 'Link') {
          html += `<td><a href="${escHtml(row[col] || '')}" target="_blank">이동</a></td>`;
        } else if (col === '법령명한글') {
          html += `<td><a href="${escHtml(row.Link || '')}" target="_blank">${escHtml(row[col] || '')}</a></td>`;
        } else {
          html += `<td>${escHtml(String(row[col] || ''))}</td>`;
        }
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;

    const innerSearch = document.getElementById('law-inner-search');
    if (innerSearch) {
      innerSearch.addEventListener('input', () => {
        const filter = innerSearch.value.toLowerCase();
        document.querySelectorAll('#law-result-table tbody tr').forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(filter) ? '' : 'none';
        });
      });
    }

    initTableSort();
  } catch (e) {
    loading.style.display = 'none';
    container.innerHTML = `<p class="placeholder-text">검색 중 오류 발생: ${e.message}</p>`;
  }
}

/* ═══════════════════════════════════════
   TAB 3: 시스템 모니터
   ═══════════════════════════════════════ */

const JOB_DISPLAY = {
  moleg_news: '법제처(보도자료)',
  moleg_legis: '법제처(입법예고)',
  pipc_news: 'PIPC(보도자료)',
  pipc_notice: 'PIPC(공지사항)',
  privacy: '개인정보포털',
  kisa_notice: 'KISA(공지사항)',
  kisa_news: 'KISA(보도자료)',
  daily_digest: 'Gmail 일일 다이제스트',
  initial_summary: 'Gmail 초기 요약',
};

function initMonitorTab() {
  loadSystemHealth();
  loadFailureSummary();
  loadTimeline();
  loadProgress();
  loadCrawlLogs();
  loadAlerts();
  loadLogFiles();

  document.getElementById('monitor-refresh-btn').addEventListener('click', () => {
    loadSystemHealth();
    loadFailureSummary();
    loadTimeline();
    loadProgress();
    loadCrawlLogs();
    const channelFilter = document.getElementById('alert-channel-filter');
    loadAlerts(channelFilter ? channelFilter.value : '');
    loadLogFiles();
  });

  document.getElementById('log-load-btn').addEventListener('click', loadLogContent);

  // 알림 채널 필터
  const channelFilter = document.getElementById('alert-channel-filter');
  if (channelFilter) {
    channelFilter.addEventListener('change', () => {
      loadAlerts(channelFilter.value);
    });
  }
}

async function loadSystemHealth() {
  try {
    const res = await fetch('/api/system-health');
    const data = await res.json();

    const dbCard = document.getElementById('status-db');
    const dbInd = dbCard.querySelector('.status-indicator');
    const dbLabel = dbCard.querySelector('.status-label');
    if (data.db === 'connected') {
      dbInd.className = 'status-indicator ok';
      dbLabel.textContent = '정상 연결';
    } else {
      dbInd.className = 'status-indicator error';
      dbLabel.textContent = '연결 실패';
    }

    const selCard = document.getElementById('status-selenium');
    const selInd = selCard.querySelector('.status-indicator');
    const selLabel = selCard.querySelector('.status-label');
    if (data.selenium === 'ready') {
      selInd.className = 'status-indicator ok';
      selLabel.textContent = '준비 완료';
    } else {
      selInd.className = 'status-indicator warn';
      selLabel.textContent = '사용 불가';
    }
  } catch (e) {
    console.error('System health error:', e);
  }
}

async function loadProgress() {
  const container = document.getElementById('progress-container');
  try {
    const res = await fetch('/api/crawl-progress');
    const data = await res.json();

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="placeholder-text">진행률 데이터 없음</p>';
      return;
    }

    // 법제처 병합 (moleg_news + moleg_legis)
    const molegItems = data.filter(p => ['moleg_news', 'moleg_legis'].includes(p.job_name));
    // PIPC 병합 (pipc_news + pipc_notice)
    const pipcItems = data.filter(p => ['pipc_news', 'pipc_notice'].includes(p.job_name));
    // KISA 병합 (kisa_notice + kisa_news)
    const kisaItems = data.filter(p => ['kisa_notice', 'kisa_news'].includes(p.job_name));
    const otherItems = data.filter(p =>
      !['moleg_news', 'moleg_legis', 'pipc_news', 'pipc_notice', 'kisa_notice', 'kisa_news'].includes(p.job_name)
    );

    let mergedData = [];

    function mergeGroup(items, groupName) {
      if (items.length === 0) return;
      const totalSteps = items.reduce((sum, p) => sum + (p.total_steps || 1), 0);
      const currentStep = items.reduce((sum, p) => sum + (p.current_step || 0), 0);
      const messages = items.map(p => p.message).filter(m => m).join(' / ');
      let mergedStatus = 'idle';
      if (items.some(p => p.status === 'running')) mergedStatus = 'running';
      else if (items.some(p => p.status === 'failed')) mergedStatus = 'failed';
      else if (items.every(p => p.status === 'completed')) mergedStatus = 'completed';
      mergedData.push({
        job_name: groupName, status: mergedStatus,
        current_step: currentStep, total_steps: totalSteps, message: messages
      });
    }

    mergeGroup(molegItems, 'moleg');
    mergeGroup(pipcItems, 'pipc');
    mergeGroup(kisaItems, 'kisa');

    for (const p of otherItems) {
      mergedData.push(p);
    }

    // 표시 순서
    const ORDER = ['moleg', 'pipc', 'kisa', 'privacy'];
    mergedData.sort((a, b) => {
      const ai = ORDER.indexOf(a.job_name);
      const bi = ORDER.indexOf(b.job_name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    let html = '';
    const PROGRESS_DISPLAY = {
      moleg: '법제처', pipc: 'PIPC (개인정보보호위원회)',
      kisa: 'KISA (한국인터넷진흥원)', privacy: '개인정보포털',
    };
    for (const p of mergedData) {
      const pct = p.total_steps > 0 ? Math.round((p.current_step / p.total_steps) * 100) : 0;
      const fillClass = p.status === 'completed' ? 'complete' : p.status === 'failed' ? 'error' : '';
      const display = PROGRESS_DISPLAY[p.job_name] || JOB_DISPLAY[p.job_name] || p.job_name;

      // 실패 메시지에서 오류 유형 힌트 추출
      let progressHint = '';
      const msg = p.message || '';
      if (msg.includes('renderer') || msg.includes('Renderer')) {
        progressHint = '<span class="tag tag-error-renderer" style="margin-left:6px;font-size:.6rem;">Renderer</span>';
      } else if (msg.includes('kisa_page_load') || msg.includes('KISA') && msg.includes('timeout')) {
        progressHint = '<span class="tag tag-error-kisa-page-load" style="margin-left:6px;font-size:.6rem;">KISA Timeout</span>';
      } else if (msg.includes('parse_zero_rows') || msg.includes('파싱 결과 0건')) {
        progressHint = '<span class="tag tag-error-parse-zero" style="margin-left:6px;font-size:.6rem;">Parse Zero</span>';
      } else if (msg.includes('link_build_failed') || msg.includes('링크 생성 실패')) {
        progressHint = '<span class="tag tag-error-link-build" style="margin-left:6px;font-size:.6rem;">Link Build</span>';
      } else if (msg.includes('crawl_exhausted') || msg.includes('재시도 소진')) {
        progressHint = '<span class="tag tag-error-exhausted" style="margin-left:6px;font-size:.6rem;">Exhausted</span>';
      } else if (msg.includes('셀렉터') || msg.includes('selector') || msg.includes('TimeoutException')) {
        progressHint = '<span class="tag tag-error-selector" style="margin-left:6px;font-size:.6rem;">Selector</span>';
      } else if (msg.includes('session') || msg.includes('Session') || msg.includes('InvalidSessionId')) {
        progressHint = '<span class="tag tag-error-session" style="margin-left:6px;font-size:.6rem;">Session</span>';
      }

      // 복구 시도 중 표시 (running 상태이면서 메시지에 재시도/복구 키워드 포함)
      let recoveryHint = '';
      if (p.status === 'running' && (msg.includes('재시도') || msg.includes('retry') || msg.includes('재생성') || msg.includes('recreat'))) {
        recoveryHint = '<span class="tag tag-recovering" style="margin-left:6px;font-size:.6rem;">복구 시도 중</span>';
      }

      html += `<div class="progress-item ${p.status === 'failed' ? 'progress-item-failed' : ''}">
        <div class="progress-item-header">
          <h4>${display}</h4>
          <span class="status-badge ${p.status}">${p.status}</span>${progressHint}${recoveryHint}
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill ${fillClass}" style="width: ${pct}%"></div>
        </div>
        <p class="progress-message">${escHtml(p.message || '')}</p>
      </div>`;
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p class="placeholder-text">로딩 실패</p>';
  }
}

/**
 * error_type을 사람이 읽기 쉬운 라벨과 CSS 클래스로 변환
 */
function getErrorTypeBadge(errorType) {
  switch (errorType) {
    case 'selenium_session_expired':
      return { label: 'Session Expired', cls: 'tag-error-session' };
    case 'selector_timeout':
      return { label: 'Selector Timeout', cls: 'tag-error-selector' };
    case 'renderer_timeout':
      return { label: 'Renderer Timeout', cls: 'tag-error-renderer' };
    case 'kisa_page_load_timeout':
      return { label: 'KISA Page Load', cls: 'tag-error-kisa-page-load' };
    case 'page_load_timeout':
      return { label: 'Page Load Timeout', cls: 'tag-error-page-load' };
    case 'timeout':
      return { label: 'Timeout', cls: 'tag-error-timeout' };
    case 'db_error':
      return { label: 'DB Error', cls: 'tag-error-db' };
    case 'parse_zero_rows':
      return { label: 'Parse Zero Rows', cls: 'tag-error-parse-zero' };
    case 'link_build_failed':
      return { label: 'Link Build Failed', cls: 'tag-error-link-build' };
    case 'crawl_exhausted':
      return { label: 'Crawl Exhausted', cls: 'tag-error-exhausted' };
    default:
      return errorType ? { label: errorType, cls: 'tag-error-unknown' } : null;
  }
}

/**
 * 최근 실패 요약 패널 — /api/crawl-logs/failures에서 데이터 로드
 * 시스템 모니터 탭 상단에 동적 삽입
 */
async function loadFailureSummary() {
  let container = document.getElementById('failure-summary-panel');

  // 패널이 없으면 동적으로 생성 (시스템 상태 카드 아래, 진행률 위)
  if (!container) {
    const progressPanel = document.querySelector('#tab-monitor .panel');
    if (progressPanel) {
      const panel = document.createElement('div');
      panel.className = 'panel failure-summary-panel';
      panel.id = 'failure-summary-panel';
      panel.innerHTML = '<h3 class="panel-title">⚠️ 최근 실패 요약</h3><div id="failure-summary-content"></div>';
      progressPanel.parentNode.insertBefore(panel, progressPanel);
    }
    container = document.getElementById('failure-summary-panel');
  }

  const content = document.getElementById('failure-summary-content');
  if (!content) return;

  try {
    const res = await fetch('/api/crawl-logs/failures?limit=10');
    const data = await res.json();

    if (!data || data.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = '';

    let html = '<div class="failure-cards">';
    for (const log of data) {
      const dt = log.created_at
        ? new Date(log.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
        : '';
      const display = JOB_DISPLAY[log.job_name] || log.job_name;
      const badge = getErrorTypeBadge(log.error_type);
      const badgeHtml = badge
        ? `<span class="tag ${badge.cls}">${escHtml(badge.label)}</span>`
        : '';

      // 진단 세부 정보 구성
      const diagParts = [];
      if (log.current_url) diagParts.push(`URL: ${log.current_url}`);
      if (log.page_len) diagParts.push(`page_len: ${log.page_len}`);
      if (log.row_count !== undefined && log.row_count !== null) diagParts.push(`rows: ${log.row_count}`);
      if (log.matched_selector) diagParts.push(`selector: ${log.matched_selector}`);
      if (log.attempt) diagParts.push(`attempt: ${log.attempt}`);
      const diagHtml = diagParts.length > 0
        ? `<div class="failure-card-diag">${escHtml(diagParts.join(' | '))}</div>`
        : '';

      html += `<div class="failure-card">
        <div class="failure-card-header">
          <strong>${display}</strong>
          ${badgeHtml}
        </div>
        <div class="failure-card-meta">${dt}</div>
        <div class="failure-card-msg">${escHtml((log.error_message || '').substring(0, 120))}</div>
        ${diagHtml}
      </div>`;
    }
    html += '</div>';
    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = '<p class="placeholder-text">실패 요약 로딩 실패</p>';
  }
}

async function loadCrawlLogs() {
  const container = document.getElementById('crawl-logs-container');
  try {
    const res = await fetch('/api/crawl-logs?limit=20');
    const data = await res.json();

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="placeholder-text">크롤링 로그 없음</p>';
      return;
    }

    let html = '<table class="data-table"><thead><tr>';
    html += '<th>시각</th><th>잡</th><th>상태</th><th>오류유형</th><th>수집</th><th>신규</th><th>소요</th><th>메시지</th><th>URL</th>';
    html += '</tr></thead><tbody>';
    for (const log of data) {
      const dt = log.created_at ? new Date(log.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '';
      const display = JOB_DISPLAY[log.job_name] || log.job_name;

      // no_data인데 error_message가 있으면 경고색 처리
      let tagClass;
      if (log.status === 'success') {
        tagClass = 'tag-success';
      } else if (log.status === 'failure') {
        tagClass = 'tag-failure';
      } else if (log.status === 'no_data' && log.error_message) {
        tagClass = 'tag-no-data-warn';
      } else {
        tagClass = 'tag-no-data';
      }

      // error_type 배지
      const badge = getErrorTypeBadge(log.error_type);
      const errorTypeTd = badge
        ? `<span class="tag ${badge.cls}">${escHtml(badge.label)}</span>`
        : '<span class="text-muted">-</span>';

      // current_url 축약 표시
      const currentUrl = log.current_url || '';
      const urlDisplay = currentUrl
        ? `<a href="${escHtml(currentUrl)}" target="_blank" title="${escHtml(currentUrl)}" class="table-link compact">${escHtml(currentUrl.length > 30 ? currentUrl.substring(0, 30) + '...' : currentUrl)}</a>`
        : '<span class="text-muted">-</span>';

      html += `<tr>
        <td>${dt}</td>
        <td>${display}</td>
        <td><span class="tag ${tagClass}">${log.status}</span></td>
        <td>${errorTypeTd}</td>
        <td>${log.records_saved || 0}</td>
        <td>${log.new_records || 0}</td>
        <td>${log.duration_seconds ? log.duration_seconds.toFixed(1) + 's' : ''}</td>
        <td title="${escHtml(log.error_message || '')}">${escHtml((log.error_message || '').substring(0, 80))}</td>
        <td>${urlDisplay}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p class="placeholder-text">로딩 실패</p>';
  }
}

async function loadAlerts(channelType) {
  const container = document.getElementById('alerts-container');
  try {
    let url = '/api/alerts?limit=15';
    if (channelType === 'daily_digest') {
      url += `&job_name=daily_digest`;
    } else if (channelType === 'initial_summary') {
      url += `&job_name=initial_summary`;
    } else if (channelType) {
      url += `&channel_type=${encodeURIComponent(channelType)}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="placeholder-text">알림 이력 없음</p>';
      return;
    }

    // 채널 타입별 라벨
    const CHANNEL_LABELS = {
      'news': '📢 Discord',
      'notify': '🔔 Discord',
      'email': '📧 Gmail',
      'daily_digest': '📬 다이제스트',
      'initial_summary': '📋 초기 요약',
    };

    let html = '<table class="data-table"><thead><tr>';
    html += '<th>시각</th><th>채널</th><th>유형</th><th>이벤트</th><th>잡</th><th>상태</th><th>메시지</th>';
    html += '</tr></thead><tbody>';
    for (const a of data) {
      const dt = a.created_at ? new Date(a.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '';
      const channelRaw = a.channel_type || a.alert_type || '';
      const channelDisplay = CHANNEL_LABELS[channelRaw] || escHtml(channelRaw);
      const channelTagClass = channelRaw === 'email' ? 'tag-email-channel' : '';
      const statusTag = a.status === 'sent'
        ? '<span class="tag tag-success">sent</span>'
        : a.status === 'failed'
          ? '<span class="tag tag-failure">failed</span>'
          : a.status === 'skipped_no_data'
            ? '<span class="tag tag-skipped">skipped</span>'
            : escHtml(a.status || '');
      html += `<tr>
        <td>${dt}</td>
        <td><span class="${channelTagClass}">${channelDisplay}</span></td>
        <td>${escHtml(a.alert_type || '')}</td>
        <td>${escHtml(a.event_type || '')}</td>
        <td>${JOB_DISPLAY[a.job_name] || a.job_name || ''}</td>
        <td>${statusTag}</td>
        <td title="${escHtml(a.message || '')}">${escHtml((a.message || '').substring(0, 100))}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p class="placeholder-text">로딩 실패</p>';
  }
}

async function loadLogFiles() {
  const select = document.getElementById('log-file-select');
  try {
    const res = await fetch('/api/logs/files');
    const files = await res.json();
    select.innerHTML = '<option value="">파일 선택...</option>';
    for (const f of files) {
      const sizeMB = (f.size / 1024 / 1024).toFixed(2);
      select.innerHTML += `<option value="${f.name}">${f.name} (${sizeMB}MB)</option>`;
    }
  } catch (e) {
    console.error('Log files load error:', e);
  }
}

async function loadLogContent() {
  const filename = document.getElementById('log-file-select').value;
  const terminal = document.getElementById('log-terminal');
  if (!filename) {
    terminal.textContent = '로그 파일을 선택하세요...';
    return;
  }
  terminal.textContent = '로딩 중...';
  try {
    const res = await fetch(`/api/logs/tail/${filename}?lines=200`);
    const data = await res.json();
    terminal.textContent = (data.lines || []).join('');
    terminal.scrollTop = terminal.scrollHeight;
  } catch (e) {
    terminal.textContent = '로그 로딩 실패: ' + e.message;
  }
}

/* ═══════════════════════════════════════
   이메일 수신 등록/해제 모달
   ═══════════════════════════════════════ */

function initEmailModal() {
  const modal = document.getElementById('email-modal');
  const openBtn = document.getElementById('email-toggle');
  const closeBtn = document.getElementById('email-modal-close');
  const subBtn = document.getElementById('email-subscribe-btn');
  const unsubBtn = document.getElementById('email-unsubscribe-btn');

  // 이메일 버튼 텍스트 초기화
  openBtn.textContent = '📧 이메일 관리';

  openBtn.addEventListener('click', () => {
    modal.style.display = 'flex';
    document.getElementById('email-input').value = '';
    document.getElementById('email-name-input').value = '';
    document.getElementById('email-result').style.display = 'none';
  });

  closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  subBtn.addEventListener('click', () => emailAction('subscribe'));
  unsubBtn.addEventListener('click', () => emailAction('unsubscribe'));

  document.getElementById('email-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') emailAction('subscribe');
  });
}

async function emailAction(action) {
  const email = document.getElementById('email-input').value.trim();
  const name = document.getElementById('email-name-input')?.value?.trim() || '';
  const resultEl = document.getElementById('email-result');

  if (!email) {
    resultEl.textContent = '이메일 주소를 입력해주세요.';
    resultEl.className = 'email-result error';
    resultEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch(`/api/email/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name })
    });
    const data = await res.json();

    if (data.error) {
      resultEl.textContent = data.error;
      resultEl.className = 'email-result error';
    } else {
      resultEl.textContent = data.message;
      resultEl.className = data.status === 'warn' ? 'email-result warn' : 'email-result success';
    }
    resultEl.style.display = 'block';
  } catch (e) {
    resultEl.textContent = '요청 중 오류가 발생했습니다.';
    resultEl.className = 'email-result error';
    resultEl.style.display = 'block';
  }
}

/* ═══════════════════════════════════════
   다운로드 (xlsx)
   ═══════════════════════════════════════ */

function initDownload() {
  document.getElementById('download-btn').addEventListener('click', downloadXlsx);
}

function downloadXlsx() {
  const site = document.getElementById('download-site-select').value;
  const fromdate = document.getElementById('data-from').value;
  const todate = document.getElementById('data-to').value;
  const search = document.getElementById('data-search').value;

  const params = new URLSearchParams();
  if (fromdate) params.set('fromdate', fromdate);
  if (todate) params.set('todate', todate);
  if (search) params.set('search', search);

  if (window.SNAPSHOT_MODE) {
    window.location.href = `snapshot/downloads/${site}.xlsx`;
    return;
  }
  const url = `/api/download/${site}?${params}`;
  window.location.href = url;
}


/* ═══════════════════════════════════════
   크롤링 실행 결과 타임라인
   ═══════════════════════════════════════ */

const TIMELINE_JOBS = [
  { key: 'moleg_legis', label: '📋 법제처(입법예고)' },
  { key: 'moleg_news',  label: '⚖️ 법제처(보도자료)' },
  { key: 'pipc_news',   label: '🏛️ PIPC(보도자료)' },
  { key: 'pipc_notice', label: '🏛️ PIPC(공지사항)' },
  { key: 'kisa_notice', label: '🔒 KISA(공지사항)' },
  { key: 'kisa_news',   label: '🔒 KISA(보도자료)' },
  { key: 'privacy',     label: '🔐 개인정보포털' },
];

let timelineData = [];
let timelineUniqueCounts = {};

async function loadTimeline() {
  try {
    const res = await fetch('/api/crawl-timeline');
    if (!res.ok) {
      document.getElementById('timelineGrid').innerHTML =
        '<p class="placeholder-text">타임라인 API 응답 오류 (HTTP ' + res.status + ')</p>';
      return;
    }
    const json = await res.json();
    timelineData = json.timeline || [];
    timelineUniqueCounts = json.unique_counts || {};
    renderTimeline();
  } catch (e) {
    console.error('Timeline load error:', e);
    document.getElementById('timelineGrid').innerHTML =
      '<p class="placeholder-text">타임라인 데이터를 불러올 수 없습니다.</p>';
  }
}

function renderTimeline() {
  const grid = document.getElementById('timelineGrid');
  const datesContainer = document.getElementById('timelineDates');
  const now = new Date();

  // 현재 시각을 15분 단위로 내림 (예: 15:50 → 15:45)
  const lastSlot = new Date(now);
  lastSlot.setMinutes(Math.floor(lastSlot.getMinutes() / 15) * 15, 0, 0);

  // 로컬 시간 기반 슬롯 키 생성 함수 (UTC 변환 없이 로컬 타임 사용)
  // → 백엔드에서 KST로 변환된 naive timestamp와 정확히 매칭됨
  function _slotKey(d) {
    const dt = d instanceof Date ? d : new Date(d);
    const pad = n => String(n).padStart(2, '0');
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate())
         + 'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }

  // 시간 단위(1h) 슬롯 생성 — 현재 시각 기준 정확히 168시간(7일)
  const hourSlots = [];
  const startHour = new Date(lastSlot);
  startHour.setHours(startHour.getHours() - 167); // lastSlot 포함 총 168칸

  for (let i = 0; i < 168; i++) {
    const s = new Date(startHour);
    s.setHours(s.getHours() + i);
    hourSlots.push(s);
  }

  // 타임라인 데이터를 맵으로 변환 (로컬 시간 기반 15분 단위 키)
  const dataMap = {};
  timelineData.forEach(item => {
    const key = _slotKey(item.time_slot);
    if (!dataMap[key]) dataMap[key] = {};
    if (!dataMap[key][item.job_name]) dataMap[key][item.job_name] = {};
    dataMap[key][item.job_name][item.status] = {
      cnt: item.cnt,
      total_new: item.total_new,
      target_range: item.target_range_sample
    };
  });

  // 날짜 헤더 생성 (시간 단위 기준)
  let prevDateKey = '';
  let daySpan = 0;
  const dayLabels = [];
  hourSlots.forEach(s => {
    const dk = _slotKey(s).substring(0, 10);
    if (dk !== prevDateKey) {
      if (prevDateKey) dayLabels.push({ label: prevDateKey, span: daySpan });
      prevDateKey = dk;
      daySpan = 1;
    } else {
      daySpan++;
    }
  });
  if (prevDateKey) dayLabels.push({ label: prevDateKey, span: daySpan });

  let datesHtml = '<div class="timeline-dates-row">';
  dayLabels.forEach(p => {
    const d = new Date(parseInt(p.label.substring(0, 4)), parseInt(p.label.substring(5, 7)) - 1, parseInt(p.label.substring(8, 10)));
    const formatted = d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' });
    datesHtml += '<div class="timeline-date-group" style="flex:' + p.span + ';">' + formatted + '</div>';
  });
  datesHtml += '</div>';

  // 시간 라벨 (시간 단위 슬롯이므로 3시간 간격으로 표시)
  datesHtml += '<div class="timeline-hours-row">';
  hourSlots.forEach(s => {
    const h = s.getHours();
    const showLabel = (h % 3 === 0);
    datesHtml += '<div class="timeline-hour-label">' + (showLabel ? h + 'h' : '') + '</div>';
  });
  datesHtml += '</div>';
  datesContainer.innerHTML = datesHtml;

  // 잡별 타임라인 행 생성 — 각 시간 컬럼 내부를 세로 4등분(15분 단위)
  let gridHtml = '';
  TIMELINE_JOBS.forEach(job => {
    const uniqueCount = timelineUniqueCounts[job.key] || 0;

    gridHtml += '<div class="timeline-row">';
    gridHtml += '<div class="timeline-row-label">' + job.label + '</div>';
    gridHtml += '<div class="timeline-cells">';

    hourSlots.forEach(hourDate => {
      gridHtml += '<div class="timeline-hour-col">';

      for (let q = 0; q < 4; q++) {
        const qDate = new Date(hourDate);
        qDate.setMinutes(q * 15);

        // lastSlot을 넘어선 미래 슬롯은 빈 블록 처리
        if (qDate > lastSlot) {
          gridHtml += '<div class="timeline-subcell tl-empty"></div>';
          continue;
        }

        const key = _slotKey(qDate);
        const jd = dataMap[key] && dataMap[key][job.key];
        let cellClass = 'tl-empty';
        const timeLabel = qDate.toLocaleString('ko-KR', {
          timeZone: 'Asia/Seoul',
          month: 'numeric', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });
        let tooltipText = timeLabel + ' | ' + job.label + '\n미실행';

        if (jd) {
          if (jd['success'] || jd['SUCCESS']) {
            const d = jd['success'] || jd['SUCCESS'];
            cellClass = 'tl-success';
            tooltipText = timeLabel + ' | ' + job.label
              + '\n상태: 성공'
              + '\n저장: ' + uniqueCount.toLocaleString() + '건'
              + '\n신규: ' + (d.total_new || 0) + '건';
          } else if (jd['no_data'] || jd['NO_DATA']) {
            cellClass = 'tl-no-data';
            tooltipText = timeLabel + ' | ' + job.label
              + '\n상태: 데이터 없음'
              + '\n저장: ' + uniqueCount.toLocaleString() + '건'
              + '\n신규: 0건';
          } else if (jd['failure'] || jd['FAILED']) {
            cellClass = 'tl-fail';
            tooltipText = timeLabel + ' | ' + job.label
              + '\n상태: 실패'
              + '\n저장: ' + uniqueCount.toLocaleString() + '건';
          }
          const hasSuccess = jd['success'] || jd['SUCCESS'];
          const hasFail = jd['failure'] || jd['FAILED'] || jd['no_data'] || jd['NO_DATA'];
          if (hasSuccess && hasFail) {
            const sd = jd['success'] || jd['SUCCESS'];
            cellClass = 'tl-mixed';
            tooltipText = timeLabel + ' | ' + job.label
              + '\n상태: 혼합 (성공+실패)'
              + '\n저장: ' + uniqueCount.toLocaleString() + '건'
              + '\n신규: ' + (sd ? (sd.total_new || 0) : 0) + '건';
          }
        }

        const escaped = tooltipText.replace(/"/g, '&quot;');
        gridHtml += '<div class="timeline-subcell ' + cellClass + '" data-tip="' + escaped + '" '
          + 'onmouseenter="showTimelineTooltip(event,this)" '
          + 'onmouseleave="hideTimelineTooltip()"></div>';
      }

      gridHtml += '</div>';
    });

    gridHtml += '</div></div>';
  });

  grid.innerHTML = gridHtml;
}

function showTimelineTooltip(e, el) {
  const tip = document.getElementById('timelineTooltip');
  const text = el.getAttribute('data-tip');
  if (!text) return;
  tip.textContent = text;
  tip.style.left = Math.min(e.clientX + 10, window.innerWidth - 300) + 'px';
  tip.style.top = (e.clientY + 14) + 'px';
  tip.classList.add('visible');
}

function hideTimelineTooltip() {
  document.getElementById('timelineTooltip').classList.remove('visible');
}

/* ═══════════════════════════════════════
   자동 새로고침 (Auto Refresh)
   ═══════════════════════════════════════ */

const AUTO_REFRESH = {
  dataInterval: 120000,      // 크롤링 데이터 탭: 2분
  monitorInterval: 30000,    // 시스템 모니터 탭: 30초
  summaryInterval: 60000,    // 요약 카드: 1분
};

let _autoRefreshTimers = {};
let _autoRefreshEnabled = true;
let _lastRefreshTime = {};

function initAutoRefresh() {
  // 페이지 visibility 변경 감지 (탭 비활성 시 중지, 활성 시 재개)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      _pauseAllTimers();
    } else {
      const activeTab = _getActiveTab();
      restartAutoRefresh(activeTab);
    }
  });

  // 자동 새로고침 토글 버튼 이벤트
  const toggleBtn = document.getElementById('auto-refresh-toggle');
  if (toggleBtn) {
    // 초기 상태 텍스트 설정
    toggleBtn.textContent = _autoRefreshEnabled ? '⏸ 자동갱신 ON' : '▶ 자동갱신 OFF';
    toggleBtn.classList.toggle('auto-refresh-off', !_autoRefreshEnabled);

    toggleBtn.addEventListener('click', () => {
      _autoRefreshEnabled = !_autoRefreshEnabled;
      toggleBtn.textContent = _autoRefreshEnabled ? '⏸ 자동갱신 ON' : '▶ 자동갱신 OFF';
      toggleBtn.classList.toggle('auto-refresh-off', !_autoRefreshEnabled);
      if (_autoRefreshEnabled) {
        restartAutoRefresh(_getActiveTab());
      } else {
        _pauseAllTimers();
      }
    });
  }

  // 초기 타이머 시작
  restartAutoRefresh(_getActiveTab());
}

function _getActiveTab() {
  const active = document.querySelector('.tab-panel.active');
  return active ? active.id : 'tab-data';
}

function _pauseAllTimers() {
  Object.keys(_autoRefreshTimers).forEach(key => {
    clearInterval(_autoRefreshTimers[key]);
    delete _autoRefreshTimers[key];
  });
}

function restartAutoRefresh(tabId) {
  _pauseAllTimers();
  if (!_autoRefreshEnabled || document.hidden) return;

  // 요약 카드는 항상 갱신
  _autoRefreshTimers['summary'] = setInterval(() => {
    loadSummary();
    _updateRefreshIndicator('summary');
  }, AUTO_REFRESH.summaryInterval);

  if (tabId === 'tab-data') {
    _autoRefreshTimers['data'] = setInterval(() => {
      _autoRefreshData();
      _updateRefreshIndicator('data');
    }, AUTO_REFRESH.dataInterval);
  } else if (tabId === 'tab-monitor') {
    _autoRefreshTimers['monitor'] = setInterval(() => {
      _autoRefreshMonitor();
      _updateRefreshIndicator('monitor');
    }, AUTO_REFRESH.monitorInterval);
  }
}

async function _autoRefreshData() {
  try {
    await loadAllPosts();
  } catch (e) {
    console.error('Auto refresh data error:', e);
  }
}

async function _autoRefreshMonitor() {
  try {
    await Promise.allSettled([
      loadSystemHealth(),
      loadProgress(),
      loadCrawlLogs(),
      loadTimeline(),
      loadFailureSummary(),
    ]);
    const channelFilter = document.getElementById('alert-channel-filter');
    if (channelFilter) {
      await loadAlerts(channelFilter.value);
    }
  } catch (e) {
    console.error('Auto refresh monitor error:', e);
  }
}

function _updateRefreshIndicator(source) {
  _lastRefreshTime[source] = new Date();
  const el = document.getElementById('last-refresh-time');
  if (el) {
    const now = new Date();
    el.textContent = '마지막 갱신: ' + now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}