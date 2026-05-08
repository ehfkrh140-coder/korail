const statusLabel = {
  idle: '대기 중',
  running: '검색 중',
  found: '좌석 발견',
  stopped: '중지됨',
  error: '오류 후 재시도',
};

let snapshot;
const taskGrid = document.querySelector('#taskGrid');
const logList = document.querySelector('#logList');
const logCount = document.querySelector('#logCount');
const errorBox = document.querySelector('#error');
const loginButton = document.querySelector('#loginButton');

loginButton.addEventListener('click', async () => {
  setError();
  loginButton.disabled = true;
  loginButton.textContent = '브라우저 여는 중...';
  try {
    await post('/api/login-browser');
  } catch (error) {
    setError(error.message);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = '로그인 브라우저 열기';
  }
});

fetch('/api/state')
  .then((response) => response.json())
  .then((data) => {
    snapshot = data;
    render();
  })
  .catch((error) => setError(String(error)));

const events = new EventSource('/events');
events.addEventListener('state', (event) => {
  snapshot = JSON.parse(event.data);
  render();
});
events.addEventListener('log', (event) => {
  if (!snapshot) return;
  snapshot.logs = [...snapshot.logs, JSON.parse(event.data)].slice(-200);
  renderLogs();
});
events.onerror = () => setError('서버 이벤트 연결이 끊겼습니다. 서버가 실행 중인지 확인해 주세요.');

function render() {
  if (!snapshot) return;
  const statesById = new Map(snapshot.states.map((state) => [state.id, state]));
  taskGrid.innerHTML = snapshot.config.tasks.map((task) => taskCard(task, statesById.get(task.id))).join('');
  taskGrid.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      setError();
      try {
        await post(`/api/tasks/${button.dataset.taskId}/${button.dataset.action}`);
      } catch (error) {
        setError(error.message);
      }
    });
  });
  renderLogs();
}

function taskCard(task, state = { status: 'idle', attempts: 0, lastMessage: '대기 중' }) {
  const isRunning = state.status === 'running' || state.status === 'error';
  const found = state.foundResult
    ? `<div class="found"><strong>${state.foundResult.departTime} ${state.foundResult.trainName}</strong><span>${state.foundResult.status}</span></div>`
    : '';
  const lastRun = state.lastRunAt ? `<p class="muted">마지막 조회: ${new Date(state.lastRunAt).toLocaleString()}</p>` : '';
  const screenshot = state.screenshot ? `<p class="muted">오류 화면 저장: ${escapeHtml(state.screenshot)}</p>` : '';

  return `
    <article class="card status-${state.status}">
      <div class="card-header">
        <div>
          <p class="date">${task.date}</p>
          <h2>${task.from} → ${task.to}</h2>
        </div>
        <span class="pill">${statusLabel[state.status]}</span>
      </div>
      <dl class="details">
        <div><dt>시간대</dt><dd>${task.startTime} ~ ${task.endTime}</dd></div>
        <div><dt>승객</dt><dd>성인 ${task.adultCount}명</dd></div>
        <div><dt>좌석</dt><dd>일반실/특실 아무 좌석</dd></div>
        <div><dt>조회 횟수</dt><dd>${state.attempts ?? 0}회</dd></div>
      </dl>
      ${found}
      <p class="message">${escapeHtml(state.lastMessage ?? '대기 중')}</p>
      ${lastRun}
      ${screenshot}
      <div class="actions">
        <button class="primary" data-task-id="${task.id}" data-action="start" ${isRunning ? 'disabled' : ''}>감시 시작</button>
        <button class="secondary" data-task-id="${task.id}" data-action="stop" ${!isRunning ? 'disabled' : ''}>중지</button>
      </div>
    </article>`;
}

function renderLogs() {
  const logs = snapshot?.logs ?? [];
  logCount.textContent = `${logs.length}개`;
  if (logs.length === 0) {
    logList.innerHTML = '<p class="muted">아직 로그가 없습니다.</p>';
    return;
  }
  logList.innerHTML = logs.slice().reverse().map((log) => `
    <div class="log level-${log.level}">
      <time>${new Date(log.time).toLocaleTimeString()}</time>
      <span>${escapeHtml(log.message)}</span>
    </div>`).join('');
}

async function post(url) {
  const response = await fetch(url, { method: 'POST' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? '요청 처리에 실패했습니다.');
  return payload;
}

function setError(message) {
  if (!message) {
    errorBox.classList.add('hidden');
    errorBox.textContent = '';
    return;
  }
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[char]));
}
