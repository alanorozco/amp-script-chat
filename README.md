# [`amp-script`](https://amp.dev/documentation/components/amp-script/) chat client

`amp-script` ES5 code lives on [`static/client.js`](./static/client.js), talking to a simple broadcast/session-keeping server on [`ws.js`](./ws.js).

## ⚠️ Compatibility

Current binaries (as of October 4th, 2019) the [AMP](https://amp.dev) runtime (`1909181902540` prod & `1909241711100` canary/RC) ship a version of [`worker-dom`](https://github.com/ampproject/worker-dom) inside `amp-script` for which `HTMLInputElement.value` getters are broken.

In order to run this demo, custom AMP binaries need to be built and mapped to run this demo until `amp-script` ships `worker-dom` version ≥ `0.21.0`.
