"use strict";

const { setTimeout } = require("timers/promises");
const { PeerRPCServer, PeerRPCClient } = require("grenache-nodejs-http");
const Link = require("grenache-nodejs-link");
const OrderBook = require("./orderBook");
const Mutex = require("./mutex");
const d = require("debug")("bfx:client");
const debug = (...args) => d(`${new Date().toISOString()}:`, ...args);

const networkIp = "127.0.0.1";
const link = new Link({
  grape: `http://${networkIp}:30001`
});
link.start();

const peerServer = new PeerRPCServer(link, { timeout: 300000 });
peerServer.init();
const peerClient = new PeerRPCClient(link, {});
peerClient.init();

const port = 1024 + Math.floor(Math.random() * 1000);
const clientId = `${networkIp}:${port}`; // use address/port as clientId as it is unique in the network
const service = peerServer.transport("server");
service.listen(port);
debug(`Client listening on port ${port}`);

const orderBook = new OrderBook();
const mutex = new Mutex();
service.on("request", (rid, key, payload, handler) => {
  //debug(rid, key, payload);
  switch (key) {
    case "mutex:lock":
      mutex.lockClient(payload);
      handler.reply(null, { success: true });
      break;
    case "mutex:unlock":
      mutex.unlockClient(payload);
      handler.reply(null, { success: true });
      break;
    case "book:sync":
      handler.reply(null, { orderBook: orderBook.getAllOrders() });
      break;
    case "order:new":
      debug("Receive new order:", payload.price, payload.amount);
      const order = {
        ...payload,
        id: rid
      };
      const isFulfilled = orderBook.placeMarketOrder(order);
      debug(`Market order fulfilled?`, isFulfilled);
      debug(`Order book length: ${orderBook.getLength()}`);
      handler.reply(null, { success: true, isFulfilled, nbOrders: orderBook.getLength() });
      break;
    default:
      debug(`Unknown request type: ${key}`);
  }
});

const askMutexLock = async (clientId) => {
  return new Promise((resolve, reject) => {
    debug("Ask mutex lock to all connected nodes");
    peerClient.map("mutex:lock", clientId, { timeout: 10000 }, (err, data) => {
      if (err) {
        if (err.message === "ERR_GRAPE_LOOKUP_EMPTY") {
          //We are the first node of the grape
          resolve();
          return;
        } else {
          console.error("mutex:lock error:", err.message);
          reject(err);
          return;
        }
      }
      debug("mutex:lock response:", data);
      resolve();
    });
  });
};

const releaseMutexLock = async (clientId) => {
  return new Promise((resolve, reject) => {
    debug("Release mutex lock for all connected nodes");
    peerClient.map("mutex:unlock", clientId, { timeout: 10000 }, (err, data) => {
      if (err) {
        if (err.message === "ERR_GRAPE_LOOKUP_EMPTY") {
          //We are the first node of the grape
          resolve();
          return;
        } else {
          console.error("mutex:unlock error:", err.message);
          reject(err);
          return;
        }
      }
      debug("mutex:unlock response:", data);
      resolve();
    });
  });
};

const syncOrderBook = async () => {
  return new Promise((resolve, reject) => {
    debug("Sync order book");
    peerClient.request("book:sync", {}, { timeout: 10000 }, (err, data) => {
      if (err) {
        if (err.message === "ERR_GRAPE_LOOKUP_EMPTY") {
          //We are the first node of the grape
          //No orders to sync
          resolve();
          return;
        } else {
          console.error("book:sync error:", err.message);
          reject(err);
          return;
        }
      }
      //debug("book:sync response:", data);
      orderBook.init(data.orderBook);
      resolve();
    });
  });
};

const submitNewOrder = async (price, amount) => {
  //Wait for all lock to be release
  while (mutex.isLocked()) {
    debug("Waiting for clients lock to be released...");
    await setTimeout(100);
  }

  //Broadcast new order to all nodes
  return new Promise((resolve, reject) => {
    debug("Submit new order:", price, amount);
    peerClient.map("order:new", { price, amount }, { timeout: 10000 }, (err, data) => {
      if (err) {
        console.error("order:new error:", err.message);
        reject(err);
        return;
      }
      debug("order:new response:", data);
      resolve();
    });
  });
};

/**
 * Randomly submit a new order:
 * - every 1 to 10 second,
 * - with a price between 10000 and 10100,
 * - and amount between -0.5 and 0.5,
 *
 * Price and amount are rounded to 4 decimals.
 */
const randomlySubmitNewOrders = async () => {
  try {
    const random = Math.random();
    const delay = 1000 + Math.floor(random * 9000);
    const price = parseFloat((10000 + random * 100).toFixed(4));
    const amount = parseFloat((random < 0.5 ? -random : random / 2).toFixed(4));
    await setTimeout(delay);
    await submitNewOrder(price, amount);
  } catch (err) {
    console.error("submitNewOrder error:", err.message);
  }
  randomlySubmitNewOrders();
};

const waitForClientToBeRegistered = async (clientId) => {
  let isClientRegistered = false;
  let nbTry = 0;
  do {
    try {
      await new Promise((resolve, reject) => {
        debug(`lookup for current client #${nbTry}`);
        link.lookup("order:new", { timeout: 10000 }, (err, data) => {
          if (err) {
            console.error("lookup error:", err.message);
            reject(err);
            return;
          }
          debug("lookup response:", data);
          isClientRegistered = data.includes(clientId);
          resolve();
        });
      });
    } catch (e) {
      debug("error in lookup", e.message);
    }
    nbTry++;
    await setTimeout(10000); //Can take long time for a new node to be discoverable by the network
  } while (!isClientRegistered && nbTry < 100);

  if (!isClientRegistered) throw new Error("Unable to find client registered on the Grape");
};

//Start Client
(async () => {
  try {
    //Ask all nodes to lock order submission while our clients is synchronizing on the network
    await askMutexLock(clientId);

    //Announce client on all services
    link.startAnnouncing("order:new", service.port, {});
    link.startAnnouncing("mutex:lock", service.port, {});
    link.startAnnouncing("mutex:unlock", service.port, {});
    //And ensure our client is accessible to others
    await waitForClientToBeRegistered(clientId);

    //Sync order book from another node on startup
    await syncOrderBook();
    debug(`Initial order book length: ${orderBook.getLength()}`);

    //Release lock as our client is fully connected and sync now
    await releaseMutexLock(clientId);

    //Client can now be requested by other for synchronizing order book
    link.startAnnouncing("book:sync", service.port, {});

    //Then we can start trading by randomly submitting new orders
    randomlySubmitNewOrders();
  } catch (e) {
    console.error("Error while starting trading client", e);
    process.exit(1);
  }
})();

//Handler to stop announcing on the grape when exiting
process.on("SIGINT", async () => {
  debug("Stopping client...");
  link.stopAnnouncing("order:new", service.port);
  link.stopAnnouncing("book:sync", service.port);
  link.stop();
  //Did not find a way to get stop confirmation before exiting so waiting 2 seconds instead
  await setTimeout(2000);
  process.exit(0);
});
