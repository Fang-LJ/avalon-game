class Socket {
  constructor(wx, config, session) {
    Object.assign(this, { wx, config, session, generation: 0 });
  }
  close() {
    this.generation++;
    clearTimeout(this.retry);
    this.retry = null;
    const old = this.task;
    this.task = null;
    if (old) old.close({});
  }
  connect(onEvent) {
    this.close();
    const generation = this.generation;
    const open = () => {
      if (
        generation !== this.generation ||
        !this.session.get() ||
        !this.config.socket
      )
        return;
      let task;
      const retry = () => {
        if (generation !== this.generation || this.retry) return;
        if (task && this.task !== task) return;
        this.task = null;
        this.retry = setTimeout(() => {
          this.retry = null;
          open();
        }, 2000);
        if (task) task.close({});
      };
      try {
        task = this.wx.connectSocket({
          url: this.config.socket,
          header: { Authorization: "Bearer " + this.session.get() },
          fail: retry,
        });
        this.task = task;
        task.onOpen(() => {
          if (generation === this.generation && this.task === task) onEvent();
        });
        task.onMessage(() => {
          if (generation === this.generation && this.task === task) onEvent();
        });
        task.onClose(retry);
        task.onError(retry);
      } catch (_) {
        retry();
      }
    };
    open();
  }
}
module.exports = Socket;
