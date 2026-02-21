'use strict';

const YT_API   = 'https://www.googleapis.com/youtube/v3';
const KEY_STORE = 'vocaloid_yt_apikey';
const FAV_STORE = 'vocaloid_favorites';

let apiKey        = '';
let currentView   = 'ranking'; // 'ranking' | 'favorites'
let searchMode    = false;
let currentQuery  = '';
let nextPageToken = null;
let isLoading     = false;
let favorites     = [];
let modalVideo    = null;

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
  favorites = loadFavs();

  // GitHub Actions がデプロイ時に注入したAPIキーを優先使用
  // （ローカル開発時は空文字になるため localStorage にフォールバック）
  const deployedKey =
    typeof DEPLOY_API_KEY !== 'undefined' && DEPLOY_API_KEY ? DEPLOY_API_KEY : '';
  const saved = deployedKey || localStorage.getItem(KEY_STORE);

  if (saved) {
    apiKey = saved;
    showApp();
    loadRanking();
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
});

// ===== APIキー管理 =====
function saveApiKey() {
  const val = document.getElementById('api-key-input').value.trim();
  if (!val) { alert('APIキーを入力してください'); return; }
  apiKey = val;
  localStorage.setItem(KEY_STORE, apiKey);
  showApp();
  loadRanking();
}

function resetApiKey() {
  localStorage.removeItem(KEY_STORE);
  location.reload();
}

function showApp() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('main-app').style.display     = 'block';
}

// ===== 表示切り替え =====
function switchView(view) {
  currentView = view;
  document.getElementById('fav-notice').style.display =
    view === 'favorites' ? 'block' : 'none';

  if (view === 'favorites') {
    document.getElementById('load-more-btn').style.display = 'none';
    showFavorites();
  } else {
    searchMode = false;
    document.getElementById('search-input').value = '';
    loadRanking();
  }
}

// ===== ランキング読み込み =====
function loadRanking() {
  if (currentView !== 'ranking') return;
  searchMode    = false;
  nextPageToken = null;
  currentQuery  = document.getElementById('char-select').value;
  clearGrid();
  fetchYT(currentQuery, document.getElementById('order-select').value, publishedAfter());
}

function publishedAfter() {
  const p = document.getElementById('period-select').value;
  if (p === 'all') return '';
  const d = new Date();
  if (p === 'week')  d.setDate(d.getDate() - 7);
  if (p === 'month') d.setMonth(d.getMonth() - 1);
  if (p === 'year')  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

// ===== 検索 =====
function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  searchMode    = true;
  currentQuery  = q + ' ボカロ VOCALOID';
  nextPageToken = null;
  currentView   = 'ranking';
  document.getElementById('view-select').value         = 'ranking';
  document.getElementById('fav-notice').style.display = 'none';
  clearGrid();
  fetchYT(currentQuery, 'relevance', '');
}

function resetSearch() {
  document.getElementById('search-input').value = '';
  loadRanking();
}

// ===== もっと見る =====
function loadMore() {
  if (!nextPageToken || isLoading) return;
  const order = document.getElementById('order-select').value;
  const after = searchMode ? '' : publishedAfter();
  fetchYT(currentQuery, order, after, true);
}

// ===== YouTube API 取得 =====
async function fetchYT(query, order, after, append = false) {
  if (isLoading) return;
  isLoading = true;
  setLoading(true);
  hideError();

  try {
    // Step 1: search
    const sp = new URLSearchParams({
      part: 'snippet', q: query, type: 'video',
      videoCategoryId: '10', maxResults: '24',
      order, key: apiKey,
    });
    if (after)          sp.set('publishedAfter', after);
    if (nextPageToken)  sp.set('pageToken', nextPageToken);

    const sr = await fetch(`${YT_API}/search?${sp}`);
    const sd = await sr.json();
    if (sd.error) throw new Error(ytErrorMsg(sd.error));

    nextPageToken = sd.nextPageToken || null;
    document.getElementById('load-more-btn').style.display = nextPageToken ? 'block' : 'none';

    const items = sd.items || [];
    if (!items.length) { if (!append) showEmpty(); return; }

    // Step 2: statistics
    const ids = items.map(i => i.id.videoId).join(',');
    const vr  = await fetch(`${YT_API}/videos?${new URLSearchParams({ part: 'statistics', id: ids, key: apiKey })}`);
    const vd  = await vr.json();
    const statsMap = {};
    (vd.items || []).forEach(v => { statsMap[v.id] = v.statistics; });

    renderCards(items, statsMap, append);

  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
    isLoading = false;
  }
}

function renderCards(items, statsMap, append) {
  const grid   = document.getElementById('songs-grid');
  const offset = append ? grid.children.length : 0;
  if (!append) grid.innerHTML = '';

  items.forEach((item, i) => {
    const vid   = item.id.videoId;
    const sn    = item.snippet;
    const stats = statsMap[vid] || {};
    const rank  = offset + i + 1;
    const isFav = favorites.some(f => f.id === vid);
    const url   = `https://www.youtube.com/watch?v=${vid}`;
    const thumb = sn.thumbnails.medium?.url || sn.thumbnails.default?.url || '';

    const card = document.createElement('article');
    card.className = 'song-card';
    card.onclick   = () => openModal(vid, sn.title, url, thumb, sn.channelTitle);

    card.innerHTML = `
      <span class="rank-badge${rank <= 3 ? ' top3' : ''}">
        ${rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : '#'+rank}
      </span>
      <button class="fav-btn${isFav ? ' active' : ''}"
        onclick="event.stopPropagation(); toggleFav('${esc(vid)}','${esc(sn.title)}','${esc(thumb)}','${esc(sn.channelTitle)}','${esc(url)}')"
        aria-label="お気に入り">♥</button>
      <div class="thumb-wrap">
        <img src="${esc(thumb)}" alt="" loading="lazy" />
        <div class="play-overlay"><span class="play-icon">▶</span></div>
      </div>
      <div class="card-body">
        <h2 class="song-title">${esc(sn.title)}</h2>
        <p class="ch-name">${esc(sn.channelTitle)}</p>
        <div class="card-stats">
          <span title="再生数">▶ ${fmtNum(stats.viewCount)}</span>
          <span title="高評価">♥ ${fmtNum(stats.likeCount)}</span>
        </div>
        <p class="pub-date">${fmtDate(sn.publishedAt)}</p>
      </div>
      <div class="card-footer">
        <a href="${esc(url)}" target="_blank" rel="noopener"
           onclick="event.stopPropagation()" class="ext-link">
          YouTubeで開く ↗
        </a>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ===== お気に入り =====
function loadFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_STORE) || '[]'); }
  catch { return []; }
}

function saveFavs() {
  localStorage.setItem(FAV_STORE, JSON.stringify(favorites));
}

function toggleFav(id, title, thumbnail, channel, url) {
  const idx = favorites.findIndex(f => f.id === id);
  if (idx >= 0) {
    favorites.splice(idx, 1);
  } else {
    favorites.push({ id, title, thumbnail, channel, url });
  }
  saveFavs();

  // カードのハートを更新
  const isFav = favorites.some(f => f.id === id);
  document.querySelectorAll('.fav-btn').forEach(btn => {
    if ((btn.getAttribute('onclick') || '').includes(`'${id}'`)) {
      btn.classList.toggle('active', isFav);
    }
  });

  // お気に入り一覧表示中なら再描画
  if (currentView === 'favorites') showFavorites();

  // モーダルのボタンも更新
  if (modalVideo?.id === id) updateModalFavBtn();
}

function showFavorites() {
  clearGrid();
  document.getElementById('load-more-btn').style.display = 'none';

  if (!favorites.length) {
    document.getElementById('songs-grid').innerHTML =
      '<p style="color:var(--muted);padding:48px 0;text-align:center;grid-column:1/-1">' +
      'お気に入りはまだありません。各曲の ♥ ボタンで登録できます。</p>';
    return;
  }

  favorites.forEach((item, i) => {
    const { id, title, thumbnail, channel, url } = item;
    const card = document.createElement('article');
    card.className = 'song-card';
    card.onclick   = () => openModal(id, title, url, thumbnail, channel);

    card.innerHTML = `
      <span class="rank-badge">${i + 1}</span>
      <button class="fav-btn active"
        onclick="event.stopPropagation(); toggleFav('${esc(id)}','${esc(title)}','${esc(thumbnail)}','${esc(channel)}','${esc(url)}')"
        aria-label="お気に入りから削除">♥</button>
      <div class="thumb-wrap">
        <img src="${esc(thumbnail)}" alt="" loading="lazy" />
        <div class="play-overlay"><span class="play-icon">▶</span></div>
      </div>
      <div class="card-body">
        <h2 class="song-title">${esc(title)}</h2>
        <p class="ch-name">${esc(channel)}</p>
      </div>
      <div class="card-footer">
        <a href="${esc(url)}" target="_blank" rel="noopener"
           onclick="event.stopPropagation()" class="ext-link">
          YouTubeで開く ↗
        </a>
      </div>
    `;
    document.getElementById('songs-grid').appendChild(card);
  });
}

// ===== モーダル =====
function openModal(id, title, url, thumbnail, channel) {
  modalVideo = { id, title, url, thumbnail, channel };

  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-iframe').src = `https://www.youtube.com/embed/${id}?rel=0`;
  document.getElementById('modal-ext-link').href = url;

  updateModalFavBtn();

  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.getElementById('modal-iframe').src = '';
  document.body.style.overflow = '';
  modalVideo = null;
}

function toggleFavFromModal() {
  if (!modalVideo) return;
  const { id, title, thumbnail, channel, url } = modalVideo;
  toggleFav(id, title, thumbnail, channel, url);
}

function updateModalFavBtn() {
  if (!modalVideo) return;
  const isFav = favorites.some(f => f.id === modalVideo.id);
  const btn   = document.getElementById('modal-fav-btn');
  btn.textContent = isFav ? '♥ お気に入り済み' : '♡ お気に入り';
  btn.classList.toggle('active', isFav);
}

// ===== UI ヘルパー =====
function setLoading(show)  { document.getElementById('loading').style.display   = show ? 'flex' : 'none'; }
function hideError()       { document.getElementById('error-box').style.display = 'none'; }
function clearGrid()       { document.getElementById('songs-grid').innerHTML    = ''; }

function showError(msg) {
  document.getElementById('error-msg').textContent = msg;
  document.getElementById('error-box').style.display = 'block';
}

function showEmpty() {
  document.getElementById('songs-grid').innerHTML =
    '<p style="color:var(--muted);padding:48px 0;text-align:center;grid-column:1/-1">動画が見つかりませんでした</p>';
}

function ytErrorMsg(e) {
  if (e.code === 400) return 'APIキーが無効です。正しいキーを確認してください。';
  if (e.code === 403) return 'APIの制限に達したか、YouTube Data API v3が有効化されていません。';
  return `APIエラー ${e.code}: ${e.message}`;
}

// ===== ユーティリティ =====
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtNum(n) {
  const v = parseInt(n || 0, 10);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K';
  return v.toLocaleString('ja-JP');
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}
