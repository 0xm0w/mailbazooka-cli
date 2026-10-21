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

Commands: `status`, `plan`, `metrics`, `sender [status|pause|resume]` (your own sender only), `list`, `broadcast create|edit`, `arm`, `pause`, `sends`, `install`, `enroll`, `subscribers [list|remove <email> --yes]`, `replies`, `reply`, `logs`, `events`, `domains`. API keys are managed in the dashboard. `mailbazooka --help` lists everything.

Override the API host with `MAILBAZOOKA_BASE_URL`.

## Develop

```sh
npm install   # builds dist/ via the prepare script
npm test      # Node 22+
```

MIT licensed.
