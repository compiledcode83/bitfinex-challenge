"use strict";

const d = require("debug")("bfx:orderBook");
const debug = (...args) => d(`${new Date().toISOString()}:`, ...args);

class OrderBook {
  buys = [];
  sells = [];

  constructor() {}

  init(book) {
    book.forEach((o) => this.addOrderToBook(o));
  }

  insertSorted(array, order, direction = 1) {
    //TODO: Should use a binary sort (running out of time)
    let index;
    for (index = 0; index < array.length; index++) {
      if (array[index].price < direction * order.price) {
        continue;
      } else {
        break;
      }
    }
    array.splice(index, 0, order);
  }

  addOrderToBook(order) {
    if (order.amount > 0) {
      this.insertSorted(this.buys, order, -1);
    } else {
      this.insertSorted(this.sells, order, 1);
    }
    debug("buy orders", this.buys);
    debug("sell orders", this.sells);
  }

  fulfillOrder(order) {
    const fulfilledOrders = [];
    let amountToFind = order.amount;
    if (amountToFind > 0) {
      debug(`Buy lookup for ${amountToFind} at ${order.price}`);
      debug("First Selling order:", this.sells[0]);
      while (amountToFind > 0 && this.sells.length > 0 && order.price >= this.sells[0].price) {
        const matchingOrder = this.sells.shift();

        debug("Matching order:", matchingOrder);
        if (amountToFind === -matchingOrder.amount) {
          debug("amount =");
          fulfilledOrders.push(matchingOrder);
          amountToFind = 0;
        } else if (amountToFind < -matchingOrder.amount) {
          debug("amount <");
          //Need to replace the remaining part of the sell order, reduces by the amount of the fulfilled order
          matchingOrder.amount += amountToFind;
          this.sells.unshift(matchingOrder);
          amountToFind = 0;
        } else {
          debug("amount >");
          amountToFind += matchingOrder.amount;
          fulfilledOrders.push(matchingOrder);
        }
        debug("amount missing to find", amountToFind);
      }

      if (amountToFind === 0) {
        fulfilledOrders.push(order);
      }
    } else {
      debug(`Sell lookup for ${amountToFind} at ${order.price}`);
      debug("First Buying order:", this.buys[0]);
      while (amountToFind < 0 && this.buys.length > 0 && order.price <= this.buys[0].price) {
        const matchingOrder = this.buys.shift();

        debug("Matching order:", matchingOrder);
        if (amountToFind === -matchingOrder.amount) {
          debug("amount =");
          fulfilledOrders.push(matchingOrder);
          amountToFind = 0;
        } else if (amountToFind > -matchingOrder.amount) {
          debug("amount >");
          //Need to replace the remaining part of the sell order, reduces by the amount of the fulfilled order
          matchingOrder.amount += amountToFind;
          this.buys.unshift(matchingOrder);
          amountToFind = 0;
        } else {
          debug("amount <");
          amountToFind += matchingOrder.amount;
          fulfilledOrders.push(matchingOrder);
        }
        debug("amount missing to find", amountToFind);
      }

      if (amountToFind === 0) {
        fulfilledOrders.push(order);
      }
    }
    return { fulfilledOrders, amountToFind };
  }

  placeMarketOrder(o) {
    const { fulfilledOrders, amountToFind } = this.fulfillOrder(o);
    debug("Fulfilled orders:", fulfilledOrders);

    if (amountToFind !== 0) {
      //Place the rest of the order that has not been fulfilled in the book
      o.amount = amountToFind;
      this.addOrderToBook(o);
    }

    return fulfilledOrders.length > 0;
  }

  getLength() {
    return this.buys.length + this.sells.length;
  }

  getAllOrders() {
    return [...this.buys, ...this.sells];
  }
}

module.exports = OrderBook;
