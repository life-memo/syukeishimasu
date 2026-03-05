/**
 * app.js — 回答入力・共有システム
 *
 * Firebase Firestore (v10 CDN / ES module) でリアルタイム共有。
 * XSS 対策: DOM 操作はすべて textContent のみ使用 (innerHTML 禁止)。
 */

// ── Firebase SDK (CDN / ES Module) ──────────────────────────────────────────
import { initializeApp } from
  'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';

import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  getDocs,
  doc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';

// ════════════════════════════════════════════════════════════════════════════
// ▼ Firebase 設定（ここを Firebase Console の値に書き換えてください）
// ════════════════════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
// ════════════════════════════════════════════════════════════════════════════

/** 主催者 PIN（必要に応じて変更）*/
const HOST_PIN = "1234";

// ── Firebase 初期化 ──────────────────────────────────────────────────────────
const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// ── State ────────────────────────────────────────────────────────────────────
let isAuthenticated = false;   // 正しい PIN が入力されているか
let isRevealed      = false;   // 回答を表示中か
/** @type {{ id: string, name: string, answer: string }[]} */
let allResponses    = [];

// ── DOM refs ─────────────────────────────────────────────────────────────────
const nameInput     = document.getElementById('name-input');
const answerInput   = document.getElementById('answer-input');
const submitBtn     = document.getElementById('submit-btn');
const errorMsg      = document.getElementById('error-msg');
const successMsg    = document.getElementById('success-msg');
const pinInput      = document.getElementById('pin-input');
const toggleBtn     = document.getElementById('toggle-btn');
const deleteAllBtn  = document.getElementById('delete-all-btn');
const responseList  = document.getElementById('response-list');
const countDisplay  = document.getElementById('count-display');
const toast         = document.getElementById('toast');

// ── PIN validation ───────────────────────────────────────────────────────────
pinInput.addEventListener('input', () => {
  isAuthenticated = (pinInput.value === HOST_PIN);

  toggleBtn.disabled    = !isAuthenticated;
  deleteAllBtn.disabled = !isAuthenticated;

  // PIN を外したら強制的に非表示に戻す
  if (!isAuthenticated && isRevealed) {
    isRevealed = false;
    updateToggleLabel();
  }

  renderList();
});

// ── Submit ───────────────────────────────────────────────────────────────────
submitBtn.addEventListener('click', async () => {
  const name   = nameInput.value.trim();
  const answer = answerInput.value.trim();

  clearMessages();

  if (!name || !answer) {
    errorMsg.textContent = '入力者名と回答を入力してください';
    return;
  }

  submitBtn.disabled = true;

  try {
    await addDoc(collection(db, 'responses'), {
      name,
      answer,
      createdAt: serverTimestamp(),
    });

    // 回答欄だけクリア（名前は残して次の送信を楽に）
    answerInput.value = '';
    answerInput.focus();
    showToast();

  } catch (err) {
    errorMsg.textContent = '送信に失敗しました。ネットワークを確認してください。';
    console.error('[app] addDoc error:', err);
  } finally {
    submitBtn.disabled = false;
  }
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
    // 並列削除
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'responses', d.id))));
  } catch (err) {
    alert('削除に失敗しました。');
    console.error('[app] deleteDoc error:', err);
  } finally {
    deleteAllBtn.disabled = !isAuthenticated;
  }
});

// ── Realtime listener ────────────────────────────────────────────────────────
const q = query(
  collection(db, 'responses'),
  orderBy('createdAt', 'desc'),
);

onSnapshot(q, (snapshot) => {
  allResponses = snapshot.docs.map(d => ({
    id:     d.id,
    name:   d.data().name   ?? '',
    answer: d.data().answer ?? '',
  }));

  countDisplay.textContent = `${allResponses.length} 件`;
  renderList();

}, (err) => {
  console.error('[app] onSnapshot error:', err);
});

// ── Render ───────────────────────────────────────────────────────────────────
function renderList() {
  // DOM を安全にクリア（innerHTML 不使用）
  while (responseList.firstChild) {
    responseList.removeChild(responseList.firstChild);
  }

  if (allResponses.length === 0) {
    const empty = document.createElement('p');
    empty.className   = 'empty-state';
    empty.textContent = 'まだ投稿がありません';
    responseList.appendChild(empty);
    return;
  }

  const shouldReveal = isAuthenticated && isRevealed;
  const total        = allResponses.length;

  allResponses.forEach((r, i) => {
    const card = document.createElement('article');
    card.className = 'response-card';
    card.setAttribute('role', 'listitem');

    // ── 番号 (#001, #002 …) ────────────────────────────
    const numEl = document.createElement('span');
    numEl.className   = 'card-num';
    numEl.textContent = `#${String(total - i).padStart(3, '0')}`;

    // ── 入力者名 ───────────────────────────────────────
    const nameEl = document.createElement('div');
    nameEl.className   = 'card-name';
    nameEl.textContent = r.name;

    // ── 回答（表示 or 非表示） ─────────────────────────
    const answerEl = document.createElement('div');

    if (shouldReveal) {
      answerEl.className   = 'card-answer revealed';
      answerEl.textContent = r.answer;   // XSS: textContent のみ
    } else {
      answerEl.className = 'card-answer hidden';
      // テキストなし：CSS のハッチパターンで視覚的に隠す
      answerEl.setAttribute('aria-label', '回答は非表示');
      answerEl.setAttribute('aria-hidden', 'true');
    }

    card.append(numEl, nameEl, answerEl);
    responseList.appendChild(card);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function clearMessages() {
  errorMsg.textContent   = '';
  successMsg.textContent = '';
}

let toastTimer = null;
function showToast() {
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Init ─────────────────────────────────────────────────────────────────────
updateToggleLabel();
