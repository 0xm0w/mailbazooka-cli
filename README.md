# mailbazooka CLI

Command-line client for [Mailbazooka](https://justfuckinguseburnaddress.com).

## Use

```sh
npx github:0xm0w/mailbazooka-cli connect <key>
# or install globally
npm i -g github:0xm0w/mailbazooka-cli
mailbazooka --help
```

`connect` stores your API key and writes MAILBAZOOKA.md (agent instructions) plus an MCP config into your project.

Override the API host with `MAILBAZOOKA_BASE_URL`.

## Develop

```sh
npm install   # builds dist/ via the prepare script
npm test      # Node 22+
```

MIT licensed.
