/**
 * host.js — 管理者用
 * Firebase Firestore (v10 CDN / ES module) でリアルタイム共有。
 * XSS 対策: DOM 操作はすべて textContent のみ使用。
 */

import { initializeApp } from
  'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';
import {
  initializeFirestore,
  memoryLocalCache,
  collection,
  deleteDoc,
  getDocs,
  doc,
  onSnapshot,
  query,
  orderBy,
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCFZpA_Js2i7gwdAPWMytn5g2z9UO7werU",
  authDomain:        "syukeishimasu.firebaseapp.com",
  projectId:         "syukeishimasu",
  storageBucket:     "syukeishimasu.firebasestorage.app",
  messagingSenderId: "644450424989",
  appId:             "1:644450424989:web:cb5af754ddbaf0838f5c74",
};

const HOST_PIN = "1234";

const fbApp = initializeApp(firebaseConfig);
const db    = initializeFirestore(fbApp, { localCache: memoryLocalCache() });

// ── DOM refs ──────────────────────────────────────────────────────────────────
const pinInput     = document.getElementById('pin-input');
const toggleBtn    = document.getElementById('toggle-btn');
const deleteAllBtn = document.getElementById('delete-all-btn');
const groupedList  = document.getElementById('grouped-list');
const countDisplay = document.getElementById('count-display');

// ── State ─────────────────────────────────────────────────────────────────────
let isAuthenticated = false;
let isRevealed      = false;
let revealedIds     = new Set(); // 個別に表示したカードのID
/** @type {{ id: string, name: string, answer: string }[]} */
let allResponses    = [];

// ── PIN validation ────────────────────────────────────────────────────────────
pinInput.addEventListener('input', () => {
  isAuthenticated = (pinInput.value === HOST_PIN);
  toggleBtn.disabled    = !isAuthenticated;
  deleteAllBtn.disabled = !isAuthenticated;

  if (!isAuthenticated) {
    isRevealed = false;
    revealedIds.clear();
    updateToggleLabel();
    renderList();
  }
});

// ── Toggle reveal ─────────────────────────────────────────────────────────────
toggleBtn.addEventListener('click', () => {
  if (!isAuthenticated) return;
  isRevealed = !isRevealed;
  updateToggleLabel();
  renderList();
});

function updateToggleLabel() {
  toggleBtn.textContent = isRevealed ? '回答を隠す' : '回答を表示';
}

// ── Delete all ────────────────────────────────────────────────────────────────
deleteAllBtn.addEventListener('click', async () => {
  if (!isAuthenticated) return;
  if (!confirm('全件削除しますか？この操作は取り消せません。')) return;

  deleteAllBtn.disabled = true;

  try {
    const snap = await getDocs(collection(db, 'responses'));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'responses', d.id))));
  } catch (err) {
    alert('削除に失敗しました。');
    console.error('[host] deleteDoc error:', err);
  } finally {
    deleteAllBtn.disabled = !isAuthenticated;
  }
});

// ── Realtime listener ─────────────────────────────────────────────────────────
const q = query(collection(db, 'responses'), orderBy('createdAt', 'asc'));

onSnapshot(q, (snapshot) => {
  allResponses = snapshot.docs.map(d => ({
    id:     d.id,
    name:   d.data().name   ?? '',
    answer: d.data().answer ?? '',
  }));

  countDisplay.textContent = `${allResponses.length} 件`;
  renderList();
}, (err) => {
  console.error('[host] onSnapshot error:', err);
});

// ── Render ────────────────────────────────────────────────────────────────────
function renderList() {
  while (groupedList.firstChild) {
    groupedList.removeChild(groupedList.firstChild);
  }

  if (allResponses.length === 0) {
    const empty = document.createElement('p');
    empty.className   = 'empty-state';
    empty.textContent = 'まだ投稿がありません';
    groupedList.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'response-list';

  allResponses.forEach((r, i) => {
    const card = document.createElement('article');
    card.className = 'response-card';

    const numEl = document.createElement('span');
    numEl.className   = 'card-num';
    numEl.textContent = String(i + 1);

    const nameEl = document.createElement('div');
    nameEl.className   = 'card-name';
    nameEl.textContent = r.name;

    const cardRevealed = isAuthenticated && (isRevealed || revealedIds.has(r.id));

    const answerEl = document.createElement('div');
    if (cardRevealed) {
      answerEl.className   = 'card-answer-reveal';
      answerEl.textContent = r.answer || '（空白）';
    } else {
      answerEl.className   = 'card-answer-mask';
      answerEl.textContent = '回答済み ✓';
    }

    if (isAuthenticated && !isRevealed) {
      card.classList.add('response-card--selectable');
      card.addEventListener('click', () => {
        if (revealedIds.has(r.id)) {
          revealedIds.delete(r.id);
        } else {
          revealedIds.add(r.id);
        }
        renderList();
      });
    }

    card.append(numEl, nameEl, answerEl);
    list.appendChild(card);
  });

  groupedList.appendChild(list);
}

// ── Init ──────────────────────────────────────────────────────────────────────
updateToggleLabel();
