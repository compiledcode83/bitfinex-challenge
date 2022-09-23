"use strict";

const d = require("debug")("bfx:mutex");
const debug = (...args) => d(`${new Date().toISOString()}:`, ...args);

class Mutex {
  lockClientIds = new Set();

  constructor() {}

  lockClient(clientId) {
    this.lockClientIds.add(clientId);
    debug("lock => lockClientIds", this.lockClientIds);
  }

  unlockClient(clientId) {
    this.lockClientIds.delete(clientId);
    debug("unlock => lockClientIds", this.lockClientIds);
  }

  isLocked() {
    debug("lockClientIds", this.lockClientIds);
    return this.lockClientIds.size > 0;
  }
}

module.exports = Mutex;
