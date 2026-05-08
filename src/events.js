export class EventBus {
  #clients = new Set();
  #nextLogId = 1;
  #logs = [];

  connect(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    this.#clients.add(res);
    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    for (const log of this.#logs.slice(-50)) {
      res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
    }
    res.on('close', () => this.#clients.delete(res));
  }

  log(level, message, taskId) {
    const entry = {
      id: this.#nextLogId++,
      time: new Date().toISOString(),
      level,
      message,
      taskId,
    };
    this.#logs.push(entry);
    this.#logs = this.#logs.slice(-200);
    this.broadcast('log', entry);
  }

  state(data) {
    this.broadcast('state', data);
  }

  getLogs() {
    return this.#logs;
  }

  broadcast(eventName, data) {
    const body = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.#clients) client.write(body);
  }
}
