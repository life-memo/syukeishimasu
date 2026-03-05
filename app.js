/**
 * app.js — 回答者用
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
// ▼ Firebase 設定
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

/** 管理PIN */
const HOST_PIN = "1234";

const fbApp = initializeApp(firebaseConfig);
const db    = initializeFirestore(fbApp, { localCache: memoryLocalCache() });

// ── 回答送信 DOM refs ─────────────────────────────────────────────────────────
const nameInput   = document.getElementById('name-input');
const answerInput = document.getElementById('answer-input');
const submitBtn   = document.getElementById('submit-btn');
const errorMsg    = document.getElementById('error-msg');
const toast       = document.getElementById('toast');

// ── 回答一覧 DOM refs ─────────────────────────────────────────────────────────
const viewPinInput     = document.getElementById('view-pin-input');
const viewDeleteBtn    = document.getElementById('view-delete-btn');
const viewCountDisplay = document.getElementById('view-count-display');
const viewGroupedList  = document.getElementById('view-grouped-list');

// ── State ─────────────────────────────────────────────────────────────────────
let viewAuthenticated = false;
/** @type {{ id: string, name: string }[]} */
let allResponses      = [];

// ── Submit（REST API で書き込み） ─────────────────────────────────────────────
async function postResponse(name, answer) {
  const { projectId, apiKey } = fbApp.options;
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/responses?key=${apiKey}`;

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        name:      { stringValue: name },
        answer:    { stringValue: answer },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `HTTP ${resp.status}`);
  }
}

submitBtn.addEventListener('click', async () => {
  const name   = nameInput.value.trim();
  const answer = answerInput.value.trim();

  errorMsg.textContent = '';

  if (!name || !answer) {
    errorMsg.textContent = '名前と回答を入力してください';
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = '送信中…';

  try {
    await postResponse(name, answer);
    answerInput.value = '';
    showToast();
  } catch (err) {
    errorMsg.textContent = `送信に失敗しました（${err.message}）`;
    console.error('[app] postResponse error:', err);
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = '送信';
  }
});

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast() {
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── PIN validation ────────────────────────────────────────────────────────────
viewPinInput.addEventListener('input', () => {
  viewAuthenticated = (viewPinInput.value === HOST_PIN);
  viewDeleteBtn.disabled = !viewAuthenticated;
});

// ── Delete all ────────────────────────────────────────────────────────────────
viewDeleteBtn.addEventListener('click', async () => {
  if (!viewAuthenticated) return;
  if (!confirm('全件削除しますか？この操作は取り消せません。')) return;

  viewDeleteBtn.disabled = true;

  try {
    const snap = await getDocs(collection(db, 'responses'));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'responses', d.id))));
  } catch (err) {
    alert('削除に失敗しました。');
    console.error('[app] deleteDoc error:', err);
  } finally {
    viewDeleteBtn.disabled = !viewAuthenticated;
  }
});

// ── Realtime listener ─────────────────────────────────────────────────────────
const q = query(
  collection(db, 'responses'),
  orderBy('createdAt', 'asc'),
);

onSnapshot(q, (snapshot) => {
  allResponses = snapshot.docs.map(d => ({
    id:     d.id,
    name:   d.data().name   ?? '',
    answer: d.data().answer ?? '',
  }));

  viewCountDisplay.textContent = `${allResponses.length} 件`;
  renderViewList();
}, (err) => {
  console.error('[app] onSnapshot error:', err);
});

// ── Render（名前のみ、設問グループなし） ──────────────────────────────────────
function renderViewList() {
  while (viewGroupedList.firstChild) {
    viewGroupedList.removeChild(viewGroupedList.firstChild);
  }

  if (allResponses.length === 0) {
    const empty = document.createElement('p');
    empty.className   = 'empty-state';
    empty.textContent = 'まだ回答がありません';
    viewGroupedList.appendChild(empty);
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

    const answerEl = document.createElement('div');
    answerEl.className   = 'card-answer-blur';
    answerEl.textContent = r.answer || '（回答あり）';

    card.append(numEl, nameEl, answerEl);
    list.appendChild(card);
  });

  viewGroupedList.appendChild(list);
}
