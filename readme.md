**Installations**

- run `npm i -g grenache-grape` to install grenache globally
- Pull the repo and run `npm install`

**Steps to Run**

- start up grape servers using the command

```
grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'
```

- start up multiple instances of the exchange service by running `npm start` in multiple terminals.
- Trigger the exchange service by calling the matchOrder function with different orders.
