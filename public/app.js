let config;
let refreshTimer;
let refreshRemainingSeconds = 0;
let refreshRound = 0;
let selectedRefreshTask;
let audioContext;

const taskGrid = document.querySelector('#taskGrid');
const taskSelect = document.querySelector('#taskSelect');
const refreshTaskSelect = document.querySelector('#refreshTaskSelect');
const resultText = document.querySelector('#resultText');
const analysisResult = document.querySelector('#analysisResult');
const analyzeButton = document.querySelector('#analyzeButton');
const clearButton = document.querySelector('#clearButton');
const errorBox = document.querySelector('#error');
const korailLink = document.querySelector('#korailLink');
const refreshInterval = document.querySelector('#refreshInterval');
const startRefreshButton = document.querySelector('#startRefreshButton');
const stopRefreshButton = document.querySelector('#stopRefreshButton');
const markCheckedButton = document.querySelector('#markCheckedButton');
const autoRestartCheckbox = document.querySelector('#autoRestartCheckbox');
const notificationButton = document.querySelector('#notificationButton');
const refreshStatus = document.querySelector('#refreshStatus');
const refreshCountdown = document.querySelector('#refreshCountdown');
const refreshRoundText = document.querySelector('#refreshRoundText');
const refreshTaskText = document.querySelector('#refreshTaskText');
const refreshNextAction = document.querySelector('#refreshNextAction');

fetch('/api/state')
  .then((response) => response.json())
  .then((data) => {
    config = data.config;
    korailLink.href = config.korailTicketUrl;
    refreshInterval.value = config.refreshHelper?.defaultIntervalSeconds ?? 35;
    renderTasks();
    updateRefreshUi('대기 중', '반복 확인을 시작하면 다음 확인 시점을 알려드립니다.');
  })
  .catch((error) => setError(String(error)));

analyzeButton.addEventListener('click', () => {
  if (!config) return;
  const task = config.tasks.find((item) => item.id === taskSelect.value);
  const result = analyzeKorailText(resultText.value, task);
  renderAnalysis(result, task);

  if (result.status === 'found') {
    stopRefreshLoop('빈자리를 찾았습니다. KORAIL 화면으로 돌아가 예약을 진행하세요.');
    notifyUser('KTX 빈자리 후보 발견', `${task.label} 조건에서 예약 가능 후보가 보입니다.`);
    playAlertTone(true);
  } else if (autoRestartCheckbox.checked && refreshStatus.dataset.running === 'true') {
    scheduleNextRefresh('이번 결과에서는 빈자리를 찾지 못했습니다. 다음 수동 새로고침까지 대기합니다.');
  }
});

clearButton.addEventListener('click', () => {
  resultText.value = '';
  analysisResult.className = 'result muted';
  analysisResult.textContent = '아직 확인한 내용이 없습니다.';
});

startRefreshButton.addEventListener('click', () => {
  if (!config) return;
  selectedRefreshTask = config.tasks.find((item) => item.id === refreshTaskSelect.value);
  refreshRound = 0;
  refreshStatus.dataset.running = 'true';
  startRefreshButton.disabled = true;
  stopRefreshButton.disabled = false;
  markCheckedButton.disabled = false;
  scheduleNextRefresh('반복 확인을 시작했습니다. 타이머가 끝나면 KORAIL 탭에서 직접 새로고침/조회하세요.');
});

stopRefreshButton.addEventListener('click', () => stopRefreshLoop('반복 확인을 중지했습니다.'));
markCheckedButton.addEventListener('click', () => scheduleNextRefresh('방금 수동 확인한 것으로 기록했습니다. 다음 확인까지 대기합니다.'));

notificationButton.addEventListener('click', async () => {
  if (!('Notification' in window)) {
    updateRefreshUi('알림 미지원', '현재 브라우저는 데스크톱 알림을 지원하지 않습니다. 대신 화면 타이머와 알림음을 사용하세요.');
    return;
  }
  const permission = await Notification.requestPermission();
  updateRefreshUi(permission === 'granted' ? '알림 허용됨' : '알림 미허용', permission === 'granted' ? '타이머가 끝나면 브라우저 알림을 표시합니다.' : '브라우저 설정에서 알림을 허용해야 데스크톱 알림을 받을 수 있습니다.');
});

function renderTasks() {
  const options = config.tasks.map((task) => `<option value="${task.id}">${escapeHtml(task.label)}</option>`).join('');
  taskSelect.innerHTML = options;
  refreshTaskSelect.innerHTML = options;
  taskGrid.innerHTML = config.tasks.map((task) => `
    <article class="card">
      <div class="card-header">
        <div>
          <p class="date">${task.date}</p>
          <h2>${escapeHtml(task.from)} → ${escapeHtml(task.to)}</h2>
        </div>
        <span class="pill">수동 반복 확인</span>
      </div>
      <dl class="details">
        <div><dt>시간대</dt><dd>${task.startTime} ~ ${task.endTime}</dd></div>
        <div><dt>승객</dt><dd>성인 ${task.adultCount}명</dd></div>
        <div><dt>좌석</dt><dd>${escapeHtml(task.seatPreference)}</dd></div>
        <div><dt>방식</dt><dd>직접 새로고침 후 붙여넣기</dd></div>
      </dl>
      <p class="message">KORAIL에서 이 조건으로 직접 조회하고, 매진이면 반복 확인 타이머에 맞춰 직접 새로고침하세요.</p>
      <div class="actions">
        <button class="secondary" data-copy="${task.id}">조건 복사</button>
      </div>
    </article>`).join('');

  taskGrid.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const task = config.tasks.find((item) => item.id === button.dataset.copy);
      await copyTask(task);
      button.textContent = '복사됨';
      setTimeout(() => { button.textContent = '조건 복사'; }, 1200);
    });
  });
}

function scheduleNextRefresh(message) {
  clearInterval(refreshTimer);
  selectedRefreshTask = config.tasks.find((item) => item.id === refreshTaskSelect.value) ?? selectedRefreshTask;
  const interval = getRefreshInterval();
  refreshRemainingSeconds = interval;
  refreshRound += 1;
  refreshStatus.dataset.running = 'true';
  updateRefreshUi('대기 중', message);
  updateCountdown();
  refreshTimer = setInterval(() => {
    refreshRemainingSeconds -= 1;
    updateCountdown();
    if (refreshRemainingSeconds <= 0) {
      clearInterval(refreshTimer);
      updateRefreshUi('지금 확인', 'KORAIL 탭에서 직접 새로고침 또는 조회 버튼을 누른 뒤, 결과를 복사해서 아래에 붙여 넣으세요.');
      notifyUser('KTX 수동 새로고침 시간', `${selectedRefreshTask?.label ?? '선택한 조건'}을 다시 확인하세요.`);
      playAlertTone(false);
    }
  }, 1000);
}

function stopRefreshLoop(message) {
  clearInterval(refreshTimer);
  refreshStatus.dataset.running = 'false';
  startRefreshButton.disabled = false;
  stopRefreshButton.disabled = true;
  markCheckedButton.disabled = true;
  refreshRemainingSeconds = 0;
  updateRefreshUi('중지됨', message);
  updateCountdown();
}

function updateRefreshUi(status, nextAction) {
  refreshStatus.textContent = status;
  refreshNextAction.textContent = nextAction;
  refreshRoundText.textContent = `${refreshRound}회차`;
  refreshTaskText.textContent = selectedRefreshTask?.label ?? '선택 전';
}

function updateCountdown() {
  refreshCountdown.textContent = formatSeconds(refreshRemainingSeconds);
}

function getRefreshInterval() {
  const min = config.refreshHelper?.minIntervalSeconds ?? 20;
  const value = Number(refreshInterval.value || config.refreshHelper?.defaultIntervalSeconds || 35);
  return Math.max(min, Math.floor(value));
}

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function notifyUser(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

function playAlertTone(isFound) {
  try {
    audioContext ??= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = isFound ? 880 : 520;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + (isFound ? 0.8 : 0.25));
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + (isFound ? 0.85 : 0.3));
  } catch {
    // Audio can be blocked by browser policy; the visual timer still works.
  }
}

async function copyTask(task) {
  const text = [
    `날짜: ${task.date}`,
    `출발: ${task.from}`,
    `도착: ${task.to}`,
    `시간대: ${task.startTime} ~ ${task.endTime}`,
    `승객: 성인 ${task.adultCount}명`,
    `좌석: ${task.seatPreference}`,
  ].join('\n');
  await navigator.clipboard.writeText(text).catch(() => undefined);
}

function analyzeKorailText(text, task) {
  const normalized = text.replace(/\u00a0/g, ' ').replace(/\t/g, ' ');
  if (!normalized.trim()) {
    return { status: 'empty', matches: [], message: '붙여 넣은 내용이 없습니다.' };
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const rows = buildCandidateRows(lines);
  const matches = rows
    .map((row) => ({ row, time: findTime(row), train: findTrainName(row), available: isAvailable(row), blocked: isBlocked(row) }))
    .filter((item) => item.time && isInRange(item.time, task.startTime, task.endTime))
    .filter((item) => /KTX|산천|청룡|KTX-이음/i.test(item.row))
    .filter((item) => item.available);

  if (matches.length > 0) {
    return {
      status: 'found',
      matches,
      message: `${matches.length}개의 예약 가능 후보를 찾았습니다. KORAIL 화면으로 돌아가 직접 예약 버튼을 눌러 주세요.`,
    };
  }

  const timeRows = rows
    .map((row) => ({ row, time: findTime(row), train: findTrainName(row), blocked: isBlocked(row) }))
    .filter((item) => item.time && isInRange(item.time, task.startTime, task.endTime))
    .filter((item) => /KTX|산천|청룡|KTX-이음/i.test(item.row));

  if (timeRows.length > 0) {
    return {
      status: 'none',
      matches: timeRows.slice(0, 8),
      message: '조건 시간대의 KTX는 보이지만 예약 가능 문구는 찾지 못했습니다. 매진이면 위 반복 확인 타이머에 맞춰 직접 새로고침하세요.',
    };
  }

  return {
    status: 'unknown',
    matches: [],
    message: '조건에 맞는 KTX 행을 자동으로 판독하지 못했습니다. KORAIL 화면에서 Ctrl+F로 예약/예매/특실을 직접 검색해 보세요.',
  };
}

function buildCandidateRows(lines) {
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/\b\d{1,2}:\d{2}\b/.test(line) || /KTX|산천|청룡|KTX-이음/i.test(line)) {
      rows.push([lines[index - 1], line, lines[index + 1], lines[index + 2]].filter(Boolean).join(' '));
    }
  }
  return [...new Set(rows)];
}

function findTime(row) {
  const match = row.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : undefined;
}

function findTrainName(row) {
  const match = row.match(/KTX(?:-[^\s]+)?|KTX_산천|산천|청룡|KTX-이음/i);
  return match?.[0] ?? 'KTX';
}

function isAvailable(row) {
  if (/예약대기|대기|입석|자유석/.test(row) && !/예약하기|예매하기|좌석선택/.test(row)) return false;
  return /예약하기|예매하기|좌석선택|선택가능|가능/.test(row);
}

function isBlocked(row) {
  return /매진|입석|자유석|대기|불가|없음|예약대기/.test(row);
}

function isInRange(time, startTime, endTime) {
  const value = toMinutes(time);
  return value >= toMinutes(startTime) && value <= toMinutes(endTime);
}

function toMinutes(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function renderAnalysis(result, task) {
  analysisResult.className = `result result-${result.status}`;
  const rows = result.matches.map((match) => `
    <li>
      <strong>${escapeHtml(match.time ?? '')} ${escapeHtml(match.train ?? '')}</strong>
      <span>${escapeHtml(match.row)}</span>
    </li>`).join('');

  analysisResult.innerHTML = `
    <strong>${escapeHtml(task.label)}</strong>
    <p>${escapeHtml(result.message)}</p>
    ${rows ? `<ul>${rows}</ul>` : ''}`;
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
