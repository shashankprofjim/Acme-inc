# Acme Connector Sandbox

A minimal Next.js (App Router, TypeScript) scaffold to exercise the connectors
service. No tests, no extra tooling — just enough to make live calls and see
responses.

## What's here

```
app/
  layout.tsx              root layout
  page.tsx                status panel — runs a probe against /connectors
  globals.css             minimal styles
  api/
    health/route.ts       liveness for the sandbox itself
    connectors/route.ts   server-side proxy to the connectors service
lib/
  connectorClient.ts      thin fetch wrapper (reads env, no browser exposure)
.env.example              config template
```

## Run

```bash
npm install
cp .env.example .env.local   # then set CONNECTOR_SERVICE_URL
npm run dev
```

Open http://localhost:3000 and hit **Run probe**. The browser calls the local
`/api/connectors` route, which forwards to `CONNECTOR_SERVICE_URL/connectors`
server-side, so the service URL and token never reach the client.

## Point it at your service

- `CONNECTOR_SERVICE_URL` — base URL of the connectors service.
- `CONNECTOR_SERVICE_TOKEN` — optional bearer token, forwarded on every call.

To hit a different endpoint, edit the path in `app/api/connectors/route.ts` (or
add new routes) and reuse `connectorClient.request(...)`.

## Adding this to the Acme-inc repo

From the repo root (assuming you drop this folder in as `sandbox/`):

```bash
git checkout -b add-connector-sandbox
git add sandbox/
git commit -m "Add minimal Next.js sandbox for connectors service"
git push -u origin add-connector-sandbox
```

Or to make it the whole repo, copy these files into the repo root instead of a
subfolder, then commit.
