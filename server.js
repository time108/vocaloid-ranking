/**
 * ボカロランキング バックエンドサーバー
 *
 * 役割:
 *   1. フロントエンド（HTML/CSS/JS）を http://localhost:3001 で配信
 *   2. ニコニコ動画のランキング RSS をサーバー側で取得して JSON で返す
 *      （ブラウザからは CORS 制限があるためサーバー経由で取得する）
 *
 * 起動方法:
 *   node server.js
 *
 * 依存: Node.js 標準モジュールのみ（npm install 不要）
 */

'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { URL } = require('url');

const PORT       = 3001;
const STATIC_DIR = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css',
  '.js'  : 'application/javascript',
  '.json': 'application/json',
  '.ico' : 'image/x-icon',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.svg' : 'image/svg+xml',
};

// ===== HTTP サーバー =====
const server = http.createServer(async (req, res) => {
  // CORS ヘッダー（localhost からのリクエストのみ）
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3001');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  let reqUrl;
  try {
    reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    res.writeHead(400); res.end('Bad Request'); return;
  }

  // ---- API エンドポイント ----
  if (reqUrl.pathname === '/health') {
    json(res, { ok: true, message: 'ボカロランキングサーバー稼働中' });
    return;
  }

  if (reqUrl.pathname === '/api/nicovideo/ranking') {
    await handleNicoRanking(res, reqUrl);
    return;
  }

  // ---- 静的ファイル配信 ----
  let filePath = path.join(STATIC_DIR, reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname);

  // ディレクトリトラバーサル防止
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const mime = MIME[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

// ===== ニコニコランキング取得 =====
async function handleNicoRanking(res, reqUrl) {
  const tag  = reqUrl.searchParams.get('tag')  || 'VOCALOID';
  const term = reqUrl.searchParams.get('term') || '24h';

  // 公開されているニコニコ動画のランキングRSS（利用規約に基づく参照）
  const nicoUrl =
    `https://www.nicovideo.jp/ranking/genre/all` +
    `?tag=${encodeURIComponent(tag)}&term=${term}&rss=2.0&lang=ja-jp`;

  try {
    const xml   = await fetchText(nicoUrl);
    const items = parseRSS(xml);
    json(res, { items });
  } catch (err) {
    console.error('[NicoNico]', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ニコニコRSSの取得に失敗しました: ' + err.message }));
  }
}

// ===== RSS パーサー =====
function parseRSS(xml) {
  const items   = [];
  const itemRe  = /<item>([\s\S]*?)<\/item>/g;
  let   match;

  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];

    // タイトル（"1位：曲名" → "曲名"）
    const rawTitle = getCdata(block, 'title') || getTag(block, 'title') || '';
    const title    = rawTitle.replace(/^\d+位[：:]\s*/, '').trim();
    if (!title) continue;

    // リンク
    const link = getCdata(block, 'link') || getTag(block, 'link') || '';

    // 動画ID
    const idMatch = link.match(/\/watch\/([a-zA-Z0-9]+)/);
    if (!idMatch) continue;
    const videoId = idMatch[1];

    // サムネイル
    const thumbMatch = block.match(/<media:thumbnail[^>]+url="([^"]+)"/);
    const thumbnail  = thumbMatch ? thumbMatch[1] : '';

    // 投稿日時
    const pubDate = getTag(block, 'pubDate') || '';

    // 説明文からの統計（HTML が含まれる場合も対応）
    const desc = getCdata(block, 'description') || getTag(block, 'description') || '';
    const viewCount    = parseStatNum(desc, /再生[：:]([\d,，]+)/);
    const commentCount = parseStatNum(desc, /コメント[：:]([\d,，]+)/);
    const mylistCount  = parseStatNum(desc, /マイリスト[：:]([\d,，]+)/);

    items.push({ videoId, title, link, thumbnail, pubDate, viewCount, commentCount, mylistCount });
  }

  return items;
}

function getTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m  = xml.match(re);
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim() : '';
}

function getCdata(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`);
  const m  = xml.match(re);
  return m ? m[1].trim() : '';
}

function parseStatNum(str, re) {
  const m = str.match(re);
  return m ? parseInt(m[1].replace(/[,，]/g, ''), 10) : 0;
}

// ===== HTTP 取得ヘルパー =====
function fetchText(urlStr) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VocaloidRanking/1.0; +local)',
        'Accept'    : 'application/rss+xml, text/xml, */*',
      },
      timeout: 8000,
    };

    const client = urlStr.startsWith('https') ? https : http;
    const req = client.get(urlStr, reqOptions, res => {
      // リダイレクト対応
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`)); return;
      }

      let buf = '';
      res.setEncoding('utf8');
      res.on('data', c => buf += c);
      res.on('end',  () => resolve(buf));
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('タイムアウト')); });
  });
}

// ===== JSON レスポンス =====
function json(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ===== 起動 =====
server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   ボカロランキング サーバー起動中      ║');
  console.log(`║   http://localhost:${PORT}               ║`);
  console.log('║   終了するには Ctrl+C を押してください  ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ポート ${PORT} はすでに使用中です。`);
    console.error('他のプロセスを停止するか、server.js の PORT を変更してください。');
  } else {
    console.error(err);
  }
  process.exit(1);
});
