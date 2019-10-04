# [`amp-script`](https://amp.dev/documentation/components/amp-script/) chat client

`amp-script` ES5 code lives on [`static/client.js`](./static/client.js), talking to a simple broadcast/session-keeping server on [`ws.js`](./ws.js).

## Running

`npm run serve` starts:

- an HTTP server for the [`static`](./static) client on port `8000`
- a WebSocket server for chat communication on port `8080`.

## ⚠️ Compatibility

Current binaries (as of October 4th, 2019) the [AMP](https://amp.dev) runtime (`1909181902540` prod & `1909241711100` canary/RC) ship a version of [`worker-dom`](https://github.com/ampproject/worker-dom) inside `amp-script` for which `HTMLInputElement.value` getters are broken.

In order to run this demo, custom AMP binaries need to be built and mapped until `amp-script` ships with `worker-dom` version ≥ `0.21.0`.
