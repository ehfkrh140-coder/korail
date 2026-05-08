import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { appConfig } from './config.js';

const PROFILE_DIR = path.resolve(process.cwd(), 'data/browser-profile');
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'data/screenshots');

export class KorailBot {
  #context;
  #page;

  constructor(events) {
    this.events = events;
  }

  async openLoginBrowser() {
    const page = await this.#ensurePage();
    await page.goto(appConfig.korailHomeUrl, { waitUntil: 'domcontentloaded' });
    this.events.log('info', '로그인용 브라우저를 열었습니다. KORAIL 로그인은 직접 완료해 주세요.');
  }

  async runOnce(task) {
    const page = await this.#ensurePage();
    this.events.log('info', `${task.label} 조회를 시작합니다.`, task.id);

    try {
      await this.#searchTicket(page, task);
      const candidates = await this.#collectCandidates(page, task);
      if (candidates.length === 0) {
        this.events.log('info', '조건에 맞는 예약 가능 좌석을 찾지 못했습니다.', task.id);
        return { found: false };
      }

      const candidate = candidates[0];
      this.events.log('success', `좌석 발견: ${candidate.result.departTime} ${candidate.result.trainName} / ${candidate.result.status}. 예약 버튼을 클릭합니다.`, task.id);
      await candidate.reserveButton.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
      await this.#clickUntilPaymentBarrier(page, task.id);
      this.events.log('success', '예약 진행 화면으로 이동했습니다. 결제/본인확인 단계는 직접 확인해 주세요.', task.id);
      return { found: true, result: candidate.result };
    } catch (error) {
      const screenshot = await this.#saveScreenshot(page, task.id);
      const message = error instanceof Error ? error.message : String(error);
      this.events.log('error', `자동화 중 오류가 발생했습니다: ${message}`, task.id);
      return { found: false, screenshot };
    }
  }

  async close() {
    await this.#context?.close();
    this.#context = undefined;
    this.#page = undefined;
  }

  async #ensurePage() {
    if (!this.#context) {
      const { chromium } = await import('playwright').catch(() => {
        throw new Error('Playwright가 설치되어 있지 않습니다. 먼저 `npm install`을 실행해 주세요.');
      });
      await mkdir(PROFILE_DIR, { recursive: true });
      this.#context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        viewport: { width: 1366, height: 900 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
      });
    }

    if (!this.#page || this.#page.isClosed()) {
      this.#page = this.#context.pages()[0] ?? (await this.#context.newPage());
    }
    return this.#page;
  }

  async #searchTicket(page, task) {
    await page.goto(appConfig.korailTicketUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);

    await this.#fillStation(page, ['txtGoStart', 'start', '출발'], task.from);
    await this.#fillStation(page, ['txtGoEnd', 'get', '도착'], task.to);
    await this.#selectDate(page, task.date);
    await this.#selectHour(page, task.startTime);
    await this.#setAdultCount(page, task.adultCount);
    await this.#chooseKtxOnly(page);

    const searchButton = page.getByRole('button', { name: /조회|열차조회|검색/ })
      .or(page.locator('input[type="submit"], input[type="button"], button').filter({ hasText: /조회|검색/ }))
      .first();
    await searchButton.click();
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
  }

  async #fillStation(page, hints, station) {
    const locators = [
      page.locator(`input[name*="${hints[0]}" i]`).first(),
      page.locator(`input[id*="${hints[0]}" i]`).first(),
      page.getByLabel(new RegExp(hints[2])).first(),
    ];
    const input = await firstVisible(locators);
    await input.fill(station);
    await input.press('Tab').catch(() => undefined);
  }

  async #selectDate(page, isoDate) {
    const [year, month, day] = isoDate.split('-');
    await this.#selectOptionByHints(page, ['selGoYear', 'year'], year);
    await this.#selectOptionByHints(page, ['selGoMonth', 'month'], String(Number(month)));
    await this.#selectOptionByHints(page, ['selGoDay', 'day'], String(Number(day)));
  }

  async #selectHour(page, time) {
    await this.#selectOptionByHints(page, ['selGoHour', 'hour', 'time'], String(Number(time.slice(0, 2))));
  }

  async #setAdultCount(page, count) {
    const select = await firstVisible([
      page.locator('select[name*="adult" i]').first(),
      page.locator('select[id*="adult" i]').first(),
      page.locator('select[name*="psg" i]').first(),
    ]).catch(() => undefined);
    if (select) await select.selectOption(String(count)).catch(() => undefined);
  }

  async #chooseKtxOnly(page) {
    const ktx = page.getByLabel(/KTX|케이티엑스/).first();
    if (await ktx.isVisible().catch(() => false)) await ktx.check().catch(() => undefined);
  }

  async #selectOptionByHints(page, hints, value) {
    const selectors = hints.flatMap((hint) => [`select[name*="${hint}" i]`, `select[id*="${hint}" i]`]);
    const select = await firstVisible(selectors.map((selector) => page.locator(selector).first()));
    await select.selectOption(value).catch(async () => {
      const option = select.locator('option').filter({ hasText: new RegExp(`^0?${value}`) }).first();
      await select.selectOption(await option.getAttribute('value') ?? value);
    });
  }

  async #collectCandidates(page, task) {
    const rows = page.locator('tr');
    const count = await rows.count();
    const candidates = [];

    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const text = normalize(await row.innerText().catch(() => ''));
      const departTime = extractTime(text);
      if (!departTime || !isTimeInRange(departTime, task.startTime, task.endTime)) continue;
      if (!/(KTX|케이티엑스)/i.test(text)) continue;
      if (/(매진|좌석없음|예약대기|입석|자유석)/.test(text)) continue;

      const reserveButton = row.getByRole('button', { name: /예약|예매|선택|신청/ })
        .or(row.locator('a, input[type="button"], button').filter({ hasText: /예약|예매|선택|신청/ }))
        .first();
      if (!(await reserveButton.isVisible().catch(() => false))) continue;

      candidates.push({
        reserveButton,
        result: {
          trainName: extractTrainName(text),
          departTime,
          arriveTime: extractSecondTime(text),
          status: summarizeStatus(text),
        },
      });
    }
    return candidates;
  }

  async #clickUntilPaymentBarrier(page, taskId) {
    for (let step = 0; step < 4; step += 1) {
      const text = normalize(await page.locator('body').innerText().catch(() => ''));
      if (/결제|신용카드|간편결제|승차권 결제|예약내역/.test(text)) return;
      const button = page.getByRole('button', { name: /다음|좌석선택|선택완료|예약하기|예매하기|결제하기/ })
        .or(page.locator('a, input[type="button"], button').filter({ hasText: /다음|좌석선택|선택완료|예약하기|예매하기|결제하기/ }))
        .first();
      if (!(await button.isVisible().catch(() => false))) return;
      this.events.log('info', '결제 직전 단계까지 진행하기 위해 다음 예약 버튼을 클릭합니다.', taskId);
      await button.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(700);
    }
  }

  async #saveScreenshot(page, taskId) {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    const filePath = path.join(SCREENSHOT_DIR, `${taskId}-${Date.now()}.png`);
    await page.screenshot({ path: filePath, fullPage: true }).catch(() => undefined);
    return filePath;
  }
}

async function firstVisible(locators) {
  for (const locator of locators) {
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  throw new Error('필수 입력 요소를 찾지 못했습니다. KORAIL 화면 구조가 바뀌었을 수 있습니다.');
}

const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const toMinutes = (value) => {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};
const extractTime = (text) => text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)?.[0];
const extractSecondTime = (text) => text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)?.[1];
const isTimeInRange = (value, start, end) => toMinutes(value) >= toMinutes(start) && toMinutes(value) <= toMinutes(end);
const extractTrainName = (text) => text.match(/KTX[-산천이음\w]*/i)?.[0] ?? 'KTX';
const summarizeStatus = (text) => {
  if (/특실/.test(text) && /예약|예매|선택|가능/.test(text)) return '특실 또는 일반실 예약 가능';
  if (/일반실/.test(text) && /예약|예매|선택|가능/.test(text)) return '일반실 예약 가능';
  return '예약 가능';
};
