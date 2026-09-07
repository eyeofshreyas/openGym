# Contributing to openGym

Thanks for taking a look! openGym is intentionally small and dependency-light, and the goal is
to keep it that way — easy to read, easy to self-host.

## Project layout

```
frontend/  React + Vite app (src/views, src/components, src/store, src/lib). Builds to static files.
           android/ + ios/ are the Capacitor shells for the standalone mobile app (docs/MOBILE.md).
api/       backend — server.js (Node, no framework), one dependency (@simplewebauthn/server).
web/       multi-stage Dockerfile (builds frontend → nginx) + nginx.conf (serves app, proxies /api).
media/     exercise img/gif (gitignored, fetched at runtime).
docs/      self-hosting guide.
```

## Running for development

```bash
./start.sh                        # api :3000 + media :8888 + vite :5173 — ctrl-c stops all
cd frontend && npm test           # training logic (progression rules, 1RM, reading a session back)
```

`start.sh` is the whole dev stack and needs no Docker. It points passkeys at `localhost`
rather than whatever `.env` deploys to, serves `./media` on the port Vite's proxy expects, and
keeps its profiles in `./data-dev` so it never writes the deployment's `./data`. Override any
of that with `DEV_WEB_PORT`, `DEV_RP_ID`, `DATA_DIR` and friends.

To run it the way it actually ships instead:

```bash
cp .env.example .env
docker compose up -d --build      # app on :8080
```

Note that compose only publishes `:8080` — the API and media stay inside its network — so
`npm run dev` on its own has nothing to proxy `/api` and `/gif` to. That's what `start.sh` is
for; if you'd rather point Vite at a running stack, set `API_TARGET=http://localhost:8080`.

## Guidelines

- **Keep it dependency-light.** The frontend uses React + Router + Zustand and nothing else;
  new deps (front or back) are a hard sell. `api/` has two (`@simplewebauthn/server` for passkeys,
  `web-push` for notifications) — keep it near that.
- **Match the style.** Small components, clear names, comments only where the "why" isn't obvious.
  State lives in the Zustand store (`src/store`); pure helpers in `src/lib`.
- **Don't commit** the exercise media (`media/`) or `data/` — they're gitignored.
- **Test the flow** you touched — click through the affected screens (and the workout flow) in a
  browser before opening a PR.
- **Training logic gets a unit test.** Anything deciding what you lift next, or reading a logged
  session back, belongs in a pure helper in `src/lib` with tests beside it (`npm test`). These
  rules are easy to get subtly wrong and nearly impossible to verify by clicking — the
  progression engine grew two real bugs that only a test pinned down.

## Good first issues

- Additional starter plans (upper/lower, full-body, 5×5…)
- More languages for the exercise instructions (the dataset ships several)
- Percentage / training-max programming (5/3/1-style) on top of the progression engine in
  `src/lib/progression.js` — the policy interface is already there
- Accessibility passes on the workout and chart screens

## Where to ask what

| You have | Goes to |
| --- | --- |
| A question, or self-hosting that won't behave | [Discussions → Q&A](https://github.com/DuarteSantos8/openGym/discussions/categories/q-a) |
| An idea you're not sure about yet | [Discussions → Ideas](https://github.com/DuarteSantos8/openGym/discussions/categories/ideas) |
| A reproducible bug | [Issues](https://github.com/DuarteSantos8/openGym/issues) |
| A change you've already built | A pull request |

An answered question in Q&A is worth more than the same answer buried in a closed issue — the
next person searching "passkey login fails behind my reverse proxy" actually finds it.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, and your browser/OS. If it's
about login/passkeys, include your `RP_ID`/`ORIGIN` (not the `data/` contents) — most login
issues are an origin mismatch.

By contributing you agree your work is licensed under the project's [GNU AGPL v3.0](LICENSE).
