# Bitfinex Challenge

**Clone projet**

```
git clone https://github.com/residentevil0803/bitfinex-challenge.git
```

**Install Project Dependencies**

Retreive all project dependencies using `npm`.

```
npm install
```

**Setting up the DHT**

```
npm i -g grenache-grape
```

```
# boot two grape servers on two different bash windows

grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'
```

**Start the exchange clients**

Boot two or more clients on different tab window they will automatically synchronize the order book and randomly submit new orders.

```
npm run client
npm run client
npm run client
...
```

Alternatively, you can run the client in debug mode to show more outputs:

```
npm run client:debug
```

## Implementation details

Here are some notes on my submission :

- I've implemented a solution where every node is both client and server.
- The idea is to maintain a synchronized order book on every node of the network.
- As new nodes can join the network at different times, we need a synchronization mechanism, to ensure new nodes work on the same copy of the order book.
- When a node joins the network, we use a mutex to temporarily lock all writes to the order book while the new node is not fully synchronized and not discovered by other participants of the network (this process can take a few seconds).
- As a node submits a new order, it broadcasts it to all other nodes.
- As all nodes operate on the same order book copy and with the same matching algorithm, they match the same orders.

## Known issues: 

- the sync and discovering of a new node is taking up to 10 seconds... that seems quite slow, but I did not find a way to improve it.
- in case multiple orders are inserted simultaneously with the same price, they may not be inserted at the same order on each copy of the book, we need to add a second dimension sorting on the order ids which is unique to ensure consistent sorting on all nodes
- order insertion in the order book is using a linear sorting while a binary sorting will be more efficient
- the source code need to be split in more files to make it more readable and maintainable
- when aborting a client, it's IP stay in cache in the DHT, and this generates network errors for other clients, I did not find a way to correctly and completely disconnect a client from th DHT, thus when restarting, it needs a restart of the grapes too to flush cache
