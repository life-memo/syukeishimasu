/**
 * host.js — 主催者用
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

// ════════════════════════════════════════════════════════════════════════════
// ▼ Firebase 設定（ここを Firebase Console の値に書き換えてください）
// ════════════════════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "AIzaSyCFZpA_Js2i7gwdAPWMytn5g2z9UO7werU",
  authDomain:        "syukeishimasu.firebaseapp.com",
  projectId:         "syukeishimasu",
  storageBucket:     "syukeishimasu.firebasestorage.app",
  messagingSenderId: "644450424989",
  appId:             "1:644450424989:web:cb5af754ddbaf0838f5c74",
};
// ════════════════════════════════════════════════════════════════════════════

/** 主催者 PIN（必要に応じて変更）*/
const HOST_PIN = "1234";

const fbApp = initializeApp(firebaseConfig);
const db    = initializeFirestore(fbApp, { localCache: memoryLocalCache() });

// ── State ────────────────────────────────────────────────────────────────────
let isAuthenticated = false;
let isRevealed      = false;
/** @type {{ id: string, name: string, questionNumber: number, answer: string }[]} */
let allResponses    = [];

// ── DOM refs ─────────────────────────────────────────────────────────────────
const pinInput     = document.getElementById('pin-input');
const toggleBtn    = document.getElementById('toggle-btn');
const deleteAllBtn = document.getElementById('delete-all-btn');
const groupedList  = document.getElementById('grouped-list');
const countDisplay = document.getElementById('count-display');

// ── PIN validation ───────────────────────────────────────────────────────────
pinInput.addEventListener('input', () => {
  isAuthenticated = (pinInput.value === HOST_PIN);

  toggleBtn.disabled    = !isAuthenticated;
  deleteAllBtn.disabled = !isAuthenticated;

  if (!isAuthenticated && isRevealed) {
    isRevealed = false;
    updateToggleLabel();
  }

  renderList();
});

// ── Toggle reveal ────────────────────────────────────────────────────────────
toggleBtn.addEventListener('click', () => {
  if (!isAuthenticated) return;
  isRevealed = !isRevealed;
  updateToggleLabel();
  renderList();
});

function updateToggleLabel() {
  toggleBtn.textContent = isRevealed ? '回答をすべて隠す' : '回答をすべて表示';
}

// ── Delete all ───────────────────────────────────────────────────────────────
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

// ── Realtime listener ────────────────────────────────────────────────────────
const q = query(
  collection(db, 'responses'),
  orderBy('createdAt', 'asc'),
);

onSnapshot(q, (snapshot) => {
  allResponses = snapshot.docs.map(d => ({
    id:             d.id,
    name:           d.data().name           ?? '',
    questionNumber: d.data().questionNumber ?? 1,
    answer:         d.data().answer         ?? '',
  }));

  countDisplay.textContent = `${allResponses.length} 件`;
  renderList();
}, (err) => {
  console.error('[host] onSnapshot error:', err);
});

// ── Render（設問グループ別） ──────────────────────────────────────────────────
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

  // 設問番号でグループ化
  const groups = new Map();
  for (const r of allResponses) {
    const qn = r.questionNumber;
    if (!groups.has(qn)) groups.set(qn, []);
    groups.get(qn).push(r);
  }

  // 設問番号順にレンダリング
  const sortedKeys = [...groups.keys()].sort((a, b) => a - b);
  const shouldReveal = isAuthenticated && isRevealed;

  for (const qNum of sortedKeys) {
    const responses = groups.get(qNum);

    // ── グループコンテナ ──
    const groupEl = document.createElement('div');
    groupEl.className = 'question-group';

    // ── グループヘッダー ──
    const header = document.createElement('div');
    header.className = 'group-header';

    const titleEl = document.createElement('span');
    titleEl.className   = 'group-title';
    titleEl.textContent = `Q${qNum}`;

    const badge = document.createElement('span');
    badge.className   = 'count-badge';
    badge.textContent = `${responses.length} 件`;

    header.append(titleEl, badge);
    groupEl.appendChild(header);

    // ── カードリスト ──
    const cardList = document.createElement('div');
    cardList.className = 'response-list';

    responses.forEach((r, i) => {
      const card = document.createElement('article');
      card.className = 'response-card';
      if (shouldReveal) card.classList.add('is-revealed');

      const cardHeader = document.createElement('div');
      cardHeader.className = 'card-header';

      const numEl = document.createElement('span');
      numEl.className   = 'card-num';
      numEl.textContent = String(i + 1);

      const nameEl = document.createElement('div');
      nameEl.className   = 'card-name';
      nameEl.textContent = r.name;

      cardHeader.append(numEl, nameEl);

      const answerWrap = document.createElement('div');
      answerWrap.className = 'card-answer-wrap';

      const answerEl = document.createElement('div');
      if (shouldReveal) {
        answerEl.className   = 'card-answer revealed';
        answerEl.textContent = r.answer;
      } else {
        answerEl.className = 'card-answer hidden';
        answerEl.setAttribute('aria-label', '回答は非表示');
        answerEl.setAttribute('aria-hidden', 'true');
      }

      answerWrap.appendChild(answerEl);
      card.append(cardHeader, answerWrap);
      cardList.appendChild(card);
    });

    groupEl.appendChild(cardList);
    groupedList.appendChild(groupEl);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
updateToggleLabel();
