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

const fbApp = initializeApp(firebaseConfig);
initializeFirestore(fbApp, { localCache: memoryLocalCache() });

// ── DOM refs ─────────────────────────────────────────────────────────────────
const nameInput      = document.getElementById('name-input');
const questionSelect = document.getElementById('question-select');
const answerInput    = document.getElementById('answer-input');
const submitBtn      = document.getElementById('submit-btn');
const errorMsg       = document.getElementById('error-msg');
const toast          = document.getElementById('toast');

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
