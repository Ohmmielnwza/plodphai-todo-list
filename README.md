# Plod Phai Todo — Todo List workload

A small, self-contained task manager used as a **demo workload** for the
Plod Phai Cloud DevSecOps pipeline. CI in this repository tests, scans, builds
and pushes the image to ECR; the infrastructure that runs it is deployed from
the separate `prodpai_cloud` repository (see [CI pipeline](#ci-pipeline)).

It is a static web app: HTML, CSS and vanilla JavaScript served by Nginx. It
has no backend, no database, no external API calls, and loads nothing from a CDN.

## Features

- Dashboard layout with a sidebar (status views and data actions), a greeting, and summary cards for **total / completed / pending** tasks plus a progress bar
- **Add tasks** with a title (required, trimmed, max 120 chars), an optional description, a priority (Low / Medium / High), and an optional due date
- **Edit** a task in a dialog that is pre-filled with its current values. Completion status is kept
- **Complete / reopen** tasks with a checkbox button. Counters update immediately
- **Delete** tasks after a confirmation dialog
- **Filter** by All / Pending / Completed and **search** title + description. The filters and search can be combined
- **Sort** by newest, oldest, priority, or due date (tasks without a due date go last)
- Badges for overdue and due-today tasks
- Empty states for "no tasks" and "no matches", inline validation errors, and toast feedback
- **Load sample tasks** (never duplicated) and **Clear all tasks** (with confirmation)
- Responsive from 360 px phones to desktop, with light and dark themes, visible focus rings, a skip link, and reduced-motion support

## Technologies

| Layer | Choice |
|---|---|
| UI | HTML5, CSS (custom properties, grid/flex), vanilla JavaScript (ES5-compatible), inline SVG icons |
| Storage | Browser `localStorage` (key `plodphai.todo.tasks.v1`) |
| Server | Nginx `nginxinc/nginx-unprivileged:1.30.6-alpine3.24-slim`, non-root (uid 101), port 8080 |
| Tests | Node.js ≥ 22 built-in test runner (`node:test`). There are **no npm dependencies** |

## Directory structure

```text
plodphai-todo-list/
├── index.html            # markup, icon sprite, dialogs
├── css/style.css         # theme + responsive layout
├── js/core.js            # pure logic: validation, filter/sort, storage (unit-tested)
├── js/app.js             # DOM rendering and event handling
├── assets/favicon.svg
├── nginx.conf            # full Nginx config (non-root, /health, security headers)
├── Dockerfile
├── .dockerignore
├── package.json          # test scripts only, no dependencies
├── .github/
│   ├── config.env        # ECR_REPOSITORY, read by the CI workflow
│   └── workflows/ci.yml  # test → security → build, scan and push to ECR
└── tests/
    ├── core.test.js      # unit tests for js/core.js
    ├── static.test.js    # file/markup/security/Dockerfile checks
    ├── e2e.test.js       # real-browser tests (headless Chrome/Edge)
    └── helpers/browser.js
```

## Run locally without Docker

Any static file server works. For example, from this directory:

```bash
python -m http.server 8081
# or: npx --yes http-server -p 8081   (needs internet the first time)
```

Open <http://localhost:8081>. Note that `/health` exists only in the Nginx
container. A plain static server returns 404 for it.

## Build and run with Docker

From this directory:

```bash
docker build -t todo-list:local .
docker run --rm -p 8081:8080 todo-list:local
```

- App: <http://localhost:8081>
- Health check: <http://localhost:8081/health>

```bash
curl -i http://localhost:8081/health    # HTTP/1.1 200 OK ... "ok"
```

The image also defines a Docker `HEALTHCHECK` that calls `/health`. For an
AWS ALB target group, use path `/health`, success code `200`, and port `8080`.

## Run the tests

You need Node.js 22 or newer. Nothing has to be installed.

```bash
npm test               # all tests (same as: node --test)
npm run test:unit      # core + static checks only
npm run test:e2e       # browser tests only
```

- **Unit tests** (`core.test.js`) cover validation, trimming, create/edit/toggle/delete, counters, filters plus search, sorting, sample de-duplication, and recovery from malformed or throwing storage.
- **Static checks** (`static.test.js`) confirm that the required UI elements exist and that there is no `innerHTML`, `eval`, inline handlers or external URLs. They also check that Nginx listens on 8080 with `/health` and that the Dockerfile is pinned and non-root.
- **Browser tests** (`e2e.test.js`) start a local server and drive headless Chrome/Edge over the DevTools protocol. They create, edit, complete and delete tasks, check filters and search, and confirm persistence across reloads and that malformed `localStorage` doesn't crash the app. They are **skipped automatically** when no Chromium-based browser is found. Set `CHROME_PATH` to point at one.

## CI pipeline

`.github/workflows/ci.yml` runs on every push and pull request to `main`, and
can also be started by hand. **There is no CD workflow here**: the `Deploy` and
`Destroy` workflows live in the `prodpai_cloud` repository and are run by
whoever owns the AWS account. This repository only produces an image.

| Job | What it does |
|---|---|
| `Test` | `npm test` on Node 22, with `timeout-minutes: 10` so a stuck browser can't hang the run for hours |
| `Security checks` | Semgrep (`p/javascript`, `p/dockerfile`, `p/secrets`) and a Trivy filesystem scan (vuln, misconfig, secret — CRITICAL/HIGH fail the job) |
| `Build, scan and push image` | `docker build` → smoke test `/health` and `/` against the running container → Trivy image scan → CycloneDX SBOM artifact → push to ECR |

The image that gets pushed is the exact one that was just built, smoke tested
and scanned, never a rebuild. It is pushed under two tags: the commit SHA and
`latest`. The target repository name comes from `ECR_REPOSITORY` in
`.github/config.env`, and the region is `us-east-1` (`AWS_REGION` at the top of
the workflow).

**Pull requests are tested and scanned but never push.** The three AWS steps
all carry `if: github.event_name != 'pull_request'`, so nothing from a PR can
reach the registry. Note that this also means a **manual run (`workflow_dispatch`)
from any branch does push**, and will move `latest` onto that branch's build —
run it from `main` unless that is what you want.

### Secrets

Settings → Secrets and variables → Actions:

| Secret | Why |
|---|---|
| `AWS_ACCESS_KEY_ID` | ECR push credentials |
| `AWS_SECRET_ACCESS_KEY` | ECR push credentials |
| `AWS_SESSION_TOKEN` | AWS Academy sessions expire roughly every 4 hours, so all three need replacing that often |

These credentials only need permission to push to the one ECR repository.
Nothing in this repository touches infrastructure.

After a green run on `main`, the run's summary shows the full image reference
that was pushed — hand that tag to whoever runs `Deploy` in `prodpai_cloud`.

## Where data is stored

Tasks are stored **only in the visitor's browser** in `localStorage`. They are
not stored in Docker, AWS, or any database, and they never leave the browser.
Each browser and each origin (host + port) has its own separate list.

## Resetting data

- In the app, click **Clear all tasks** and confirm.
- Or, in the browser DevTools console, run `localStorage.removeItem('plodphai.todo.tasks.v1')`.
- Clearing site data for the origin also removes the tasks.

## Known limitations

- No sync between devices or browsers, and no accounts (by design).
- Data is lost if the user clears site data. Private windows discard it on close.
- If storage is blocked, the app still works in memory and shows a warning.
- Dates use the browser's local time zone.
- The Content-Security-Policy and other security headers are sent by Nginx only, not by a plain static server.
