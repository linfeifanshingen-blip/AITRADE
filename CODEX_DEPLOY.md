# 林非凡交易研究中心 Codex Deploy Notes

This package is intended for handoff to another Codex workspace.

## Contents

- Full 林非凡交易研究中心 source code
- `node_modules` for offline/local startup
- `.env.local` with the configured API environment variables
- Market data integrations for US/HK/A-share workflows

## Start Locally

```bash
cd silicon-trader
npm run dev -- --hostname 127.0.0.1
```

Then open:

```text
http://127.0.0.1:3000/
```

## Notes

- Keep `.env.local` private. It contains local API configuration.
- Futu OpenD data requires a local Futu OpenD process listening on the configured host/port.
- If Futu OpenD is unavailable, the app falls back to public sources where implemented.
- The package intentionally excludes `.next` build output; Next.js will rebuild it on first run.
