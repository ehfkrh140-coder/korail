import { appConfig, getTaskConfig } from './config.js';
import { KorailBot } from './korailBot.js';

export class TaskManager {
  #states = new Map();
  #running = new Map();
  #bot;

  constructor(events) {
    this.events = events;
    this.#bot = new KorailBot(events);
    for (const task of appConfig.tasks) {
      this.#states.set(task.id, {
        id: task.id,
        status: 'idle',
        attempts: 0,
        lastMessage: '대기 중',
      });
    }
  }

  getSnapshot() {
    return {
      config: appConfig,
      states: Array.from(this.#states.values()),
      logs: this.events.getLogs(),
    };
  }

  async openLoginBrowser() {
    await this.#bot.openLoginBrowser();
    this.#emitState();
  }

  start(taskId) {
    const task = getTaskConfig(taskId);
    if (!task) throw new Error('알 수 없는 작업입니다.');
    if (this.#running.has(taskId)) throw new Error('이미 실행 중인 작업입니다.');

    const abortController = new AbortController();
    const promise = this.#loop(task, abortController.signal).finally(() => {
      this.#running.delete(taskId);
      this.#emitState();
    });
    this.#running.set(taskId, { abortController, promise });
    this.#update(taskId, { status: 'running', lastMessage: '감시 시작' });
    this.events.log('info', `${task.label} 감시를 시작했습니다.`, task.id);
  }

  stop(taskId) {
    const running = this.#running.get(taskId);
    if (!running) throw new Error('실행 중인 작업이 아닙니다.');
    running.abortController.abort();
    this.#update(taskId, { status: 'stopped', lastMessage: '사용자가 중지함' });
    this.events.log('warning', '사용자 요청으로 감시를 중지했습니다.', taskId);
  }

  async stopAll() {
    for (const taskId of this.#running.keys()) this.stop(taskId);
    await this.#bot.close();
  }

  async #loop(task, signal) {
    while (!signal.aborted) {
      const current = this.#states.get(task.id);
      this.#update(task.id, {
        attempts: (current?.attempts ?? 0) + 1,
        status: 'running',
        lastRunAt: new Date().toISOString(),
        lastMessage: '조회 중',
      });

      const result = await this.#bot.runOnce(task);
      if (result.found) {
        this.#update(task.id, {
          status: 'found',
          lastMessage: '좌석 발견 및 예약 화면 진입',
          foundResult: result.result,
        });
        return;
      }

      if (result.screenshot) {
        this.#update(task.id, {
          status: 'error',
          lastMessage: '오류 발생. 다음 주기에 재시도합니다.',
          screenshot: result.screenshot,
        });
      } else {
        this.#update(task.id, {
          status: 'running',
          lastMessage: `${appConfig.pollIntervalSeconds}초 후 재조회`,
        });
      }

      await delay(appConfig.pollIntervalSeconds * 1000, signal);
    }
  }

  #update(taskId, patch) {
    const previous = this.#states.get(taskId);
    if (!previous) return;
    this.#states.set(taskId, { ...previous, ...patch });
    this.#emitState();
  }

  #emitState() {
    this.events.state(this.getSnapshot());
  }
}

const delay = (ms, signal) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
});
