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

/** 主催者 PIN */
const HOST_PIN = "1234";

const fbApp = initializeApp(firebaseConfig);
const db    = initializeFirestore(fbApp, { localCache: memoryLocalCache() });

// ── 回答送信 DOM refs ─────────────────────────────────────────────────────────
const nameInput      = document.getElementById('name-input');
const questionSelect = document.getElementById('question-select');
const answerInput    = document.getElementById('answer-input');
const submitBtn      = document.getElementById('submit-btn');
const errorMsg       = document.getElementById('error-msg');
const toast          = document.getElementById('toast');

// ── 回答確認 DOM refs ─────────────────────────────────────────────────────────
const viewPinInput    = document.getElementById('view-pin-input');
const viewToggleBtn   = document.getElementById('view-toggle-btn');
const viewCountDisplay = document.getElementById('view-count-display');
const viewGroupedList = document.getElementById('view-grouped-list');

// ── 回答確認 State ────────────────────────────────────────────────────────────
let viewAuthenticated = false;
let viewRevealed      = false;
/** @type {{ id: string, name: string, questionNumber: number, answer: string }[]} */
let allResponses      = [];

// ── Submit（REST API で書き込み） ─────────────────────────────────────────────
async function postResponse(name, questionNumber, answer) {
  const { projectId, apiKey } = fbApp.options;
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/responses?key=${apiKey}`;

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        name:           { stringValue: name },
        questionNumber: { integerValue: questionNumber },
        answer:         { stringValue: answer },
        createdAt:      { timestampValue: new Date().toISOString() },
      },
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `HTTP ${resp.status}`);
  }
}

submitBtn.addEventListener('click', async () => {
  const name           = nameInput.value.trim();
  const questionNumber = parseInt(questionSelect.value, 10);
  const answer         = answerInput.value.trim();

  errorMsg.textContent = '';

  if (!name || !answer) {
    errorMsg.textContent = '名前と回答を入力してください';
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = '送信中…';

  try {
    await postResponse(name, questionNumber, answer);
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
  viewToggleBtn.disabled = !viewAuthenticated;

  if (!viewAuthenticated && viewRevealed) {
    viewRevealed = false;
    updateViewToggleLabel();
  }

  renderViewList();
});

// ── Toggle reveal ─────────────────────────────────────────────────────────────
viewToggleBtn.addEventListener('click', () => {
  if (!viewAuthenticated) return;
  viewRevealed = !viewRevealed;
  updateViewToggleLabel();
  renderViewList();
});

function updateViewToggleLabel() {
  viewToggleBtn.textContent = viewRevealed ? '回答をすべて隠す' : '回答をすべて表示';
}

// ── Realtime listener ─────────────────────────────────────────────────────────
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

  viewCountDisplay.textContent = `${allResponses.length} 件`;
  renderViewList();
}, (err) => {
  console.error('[app] onSnapshot error:', err);
});

// ── Render（設問グループ別） ──────────────────────────────────────────────────
function renderViewList() {
  while (viewGroupedList.firstChild) {
    viewGroupedList.removeChild(viewGroupedList.firstChild);
  }

  if (!viewAuthenticated) {
    const msg = document.createElement('p');
    msg.className   = 'empty-state';
    msg.textContent = 'PINを入力してください';
    viewGroupedList.appendChild(msg);
    return;
  }

  if (allResponses.length === 0) {
    const empty = document.createElement('p');
    empty.className   = 'empty-state';
    empty.textContent = 'まだ投稿がありません';
    viewGroupedList.appendChild(empty);
    return;
  }

  const groups = new Map();
  for (const r of allResponses) {
    const qn = r.questionNumber;
    if (!groups.has(qn)) groups.set(qn, []);
    groups.get(qn).push(r);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => a - b);
  const shouldReveal = viewRevealed;

  for (const qNum of sortedKeys) {
    const responses = groups.get(qNum);

    const groupEl = document.createElement('div');
    groupEl.className = 'question-group';

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
    viewGroupedList.appendChild(groupEl);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
updateViewToggleLabel();
