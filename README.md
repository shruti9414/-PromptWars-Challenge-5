# Gatherly AI: Celebration & Event Planner

PromptWars Challenge 5 entry. **Phase 1** (UI and core workflow), **Phase 2** (GenAI planning) and **Phase 3** (full functionality on local persistence, deliberately with no database) are implemented. Everything — events, budgets, timelines, vendors, guests, AI plan history and preferences — lives in `localStorage` in the browser; there is no account system or server-side storage.

## Chosen vertical

**Celebration & Event Planner.** An assistant that helps people organise **weddings, birthdays and community events** with budgets, timelines, vendor checklists and personalised ideas.

## What it does

| Screen | What it does |
| --- | --- |
| Landing | Product story, event types, how it works, link into the demo |
| Event wizard | Type (wedding, birthday, anniversary, community), name, date, location, guests, budget, theme, venue status, priorities, preferences. Validated per step, progress indicator, draft preserved; also used to edit |
| Dashboard | Countdown, progress rings, budget donut, next tasks, vendor status, rule-based suggestions |
| **AI Planner** | Generate a full plan or regenerate one section, preview exactly what changes, apply with confirmation, restore from plan history, chat with a contextual assistant |
| My Events | Search, filter, sort, open, edit, delete |
| Budget | Totals, charts, expense add/edit/delete, paid toggle, over-budget warning, CSV export |
| Timeline | List or month-calendar view; tasks by overdue / month / done, priorities, prerequisites (loops and later-dated prerequisites are refused), booking deadlines, filters. Changing the event date previews every deadline that would move; completed tasks never move and tasks you edited move only if you tick them |
| Vendor Checklist | Needed, contacted, quote received, booked, completed, declined; requirements, search criteria, book-by dates; booking a vendor with a quote links (and keeps in sync with) one Budget expense |
| Vendor Directory | Fictional demo vendors; search, filter, star favourites (per event), add to checklist |
| Ideas Gallery | Curated ideas with filters; save favourites |
| Guests | RSVP status, plus-ones, dietary needs, live headcount, CSV import (with file-type/size validation) and export |
| Settings | Currency, reduce motion, JSON export, reset/delete data |

Three sample events are preloaded so reviewers can explore immediately. Sample dates are relative to today.

## AI architecture (Phase 2)

```
Browser (React)                         Server (Vercel Function / Vite dev middleware)
-----------------------------------     -----------------------------------------------
buildAiContext(event)  --- POST ---->   validate request (Zod, size limit, rate limit)
  only whitelisted fields               build prompt (user text fenced as data)
                                        Anthropic Messages API, forced tool call  <-- ANTHROPIC_API_KEY (server only)
                                        validate model output (Zod)
validate response (Zod)     <-------    { source: "live" | "demo", patch }
buildProposal(): app code recomputes
  every number and date, merges with
  the user's own data
Preview  ->  user confirms  ->  apply + snapshot (undo)
```

- **Server-side only.** `api/plan.ts`, `api/assistant.ts` and `api/status.ts` are Vercel Functions; during `npm run dev` the same handlers are served by a Vite plugin (`server/vitePlugin.ts`). The API key is read from `ANTHROPIC_API_KEY` in `server/` and never reaches the browser bundle.
- **Structured output.** The model must answer through a forced tool call whose input schema comes from the Zod schemas in `src/ai/schema.ts` (overview, recommendations, budget lines, timeline items, vendor requirements, risks, assumptions, follow-up questions). Output is validated on the server and again in the browser.
- **Numbers are never trusted.** `src/ai/budget.ts` and `src/ai/timeline.ts` drop invalid estimates, cap absurd ones, round to whole units, add a contingency reserve sized to the budget style (strict 10%, moderate 7%, flexible 5%), compute totals and cost per guest, detect budget overruns and build a trimmed alternative that fits (optional lines first, then essentials down to a floor). Due dates come from the real event date plus a "days before event" offset; short runways are compressed proportionally, dependencies are validated (unknown, self and circular ones are removed, dependencies are never due after their dependents) and a last-minute task is added if missing. Percentage and guest-count changes from the assistant ("reduce by 15%", "50 more guests") are computed by the app.
- **Nothing is overwritten silently.** Every result (full plan, section regeneration, assistant proposal) becomes a *proposal* with a preview and a confirmation dialog. Paid, billed, completed, booked or hand-edited items are always kept; stale previews are rejected. Each applied change stores a snapshot you can restore from "Plan history" (last 8 kept).
- **Privacy.** Only event type, date, location, guest count, budget, currency, theme, preferences, venue status, priorities, budget style and an optional instructions box are sent. The event name, notes, guest names and vendor contact details are never sent. The AI page shows the exact JSON that will be sent.
- **Honest labels.** Prices are always called estimates, not quotations. The AI only produces vendor *requirements and search criteria*; it never invents businesses, reviews or availability.
- **Demo mode.** With no API key, the server answers with a deterministic rule-based planner and a keyword assistant, labelled "Demo planner, not AI" everywhere. If the API cannot be reached at all, the same demo code runs in the browser and is labelled "Offline demo".
- **Failure handling.** Invalid or truncated model output, provider errors, rate limits (429 with retry hint) and timeouts (75s server, 90s browser) each produce a specific message and a **Try again** button. Event data is never changed by a failed request.
- **Rate limiting.** In-memory per-IP limits (8 plan requests and 20 assistant requests per minute per instance). This is a best-effort guard on serverless platforms, not a security boundary.

### Live AI vs demo mode

| Feature | With `ANTHROPIC_API_KEY` | Without a key |
| --- | --- | --- |
| Full plan, section regeneration | Live model | Rule-based demo planner |
| Assistant | Live model | Keyword rules (6 request types) |
| Budget, timeline and date maths, validation, merging, preview, undo | App code (same) | App code (same) |
| Starter plan in the wizard, dashboard suggestions | Rule-based (not AI) | Rule-based (not AI) |

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | No (enables live AI) | Server-side only. Put it in `.env.local` locally, or in your hosting provider's environment settings |
| `AI_MODEL` | No | Overrides the default model (`claude-sonnet-5-5`) |

Copy `.env.example` to `.env.local` and fill it in. `.env*` files are git-ignored (only `.env.example` is committed).

## Setup

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY for live AI
npm run dev                  # http://localhost:5173 (UI and /api together)
npm run build                # type-check + production build into dist/
```

Deploying to Vercel works with no configuration: `dist/` is served statically and `api/*.ts` become functions. Add `ANTHROPIC_API_KEY` in the project's environment variables.

## Testing

```bash
npm test           # Vitest + Testing Library, runs once
npm run typecheck  # strict TypeScript
```

The suite (about 340 tests) covers Phase 1 (form validation, budget maths, planner, flows through every screen), Phase 2, and Phase 3 (CSV encode/decode and file validation, task dependencies, date-change rescheduling, calendar helpers, favourites, anniversary events):

- AI schema validation, including malformed, truncated and out-of-range model output
- budget limits: cost per guest, over-budget detection, trimmed alternatives, contingency, guest/percentage changes
- timeline dates, compression, dependency repair, booking deadlines, past events
- missing or invalid event details, request size and unknown-field rejection
- API failures: provider errors, 429, timeouts, network loss, unreadable bodies, key never present in responses
- prompt fencing against injected tags
- proposal validation, no change before confirmation, preserved user data, undo, stale-preview protection
- UI flows for generation, retry, offline demo fallback, regeneration, history restore and the assistant

Live-model calls are tested against a mocked provider; no test uses the network or a real key.

## Security notes

- The API key is read only in `server/` and `api/` from `ANTHROPIC_API_KEY`; the browser bundle contains no key or provider URL.
- API routes accept only `POST` with `application/json` (`GET` for status), refuse requests whose `Origin` is another site, cap the body at 24 KB (measured in bytes), validate every field with Zod (unknown fields are rejected), rate-limit per client, and return generic error messages with no stack traces or provider bodies. Nothing is logged.
- Model output is validated with Zod on the server and again in the browser; React renders it as text (no `dangerouslySetInnerHTML`), and user text in prompts is fenced as data.
- `vercel.json` sets a Content-Security-Policy (same-origin scripts, no framing), `nosniff`, `no-referrer` and a restrictive Permissions-Policy for deployed builds.
- localStorage is not secure storage and the app has no accounts, so there are no multi-user guarantees. Stored data is validated on load: a damaged event is skipped (the rest load), the original text is copied to a backup key before anything can overwrite it, and a notice explains what happened. If the browser refuses a write, the app says so instead of failing silently.

## Assumptions and limits

- By design, there is no database or login: all data lives in the browser's `localStorage`, scoped to one browser on one device. Clearing site data, using a different browser, or going incognito starts fresh. "Export as JSON" (Settings) is the only way to move data elsewhere.
- Vendors, guests and prices in the sample data are fictional. No availability or real bookings exist.
- A vendor's linked Budget expense is created the moment it's booked with a quote, and its planned amount tracks later quote edits; it is never deleted automatically, and any actual/paid amount you enter against it is yours to manage from the Budget page.
- Guest CSV import accepts `Name, Group, RSVP, Plus-ones, Dietary` columns (any order, case-insensitive); rows need at least a name, unrecognised Group/RSVP values fall back to a default, and out-of-range plus-ones are clamped rather than rejecting the row.
- Currency (default INR) changes display only; it does not convert values.
- There is no ESLint configuration; quality gates are strict TypeScript (`noUnusedLocals`, `noUnusedParameters`) and the test suite. Layout at different screen sizes and screen-reader behaviour have not been checked in a real browser; the automated accessibility checks cover structure only (headings, names, ids, alt text).
- Live-AI behaviour depends on the provider and could not be exercised in this repository without a key: the request/response path is verified with a mocked provider, not a real one.
- Photography is from Unsplash, served as small WebP files from `public/img`.

## Accessibility

Semantic landmarks and headings, skip link, labelled controls with `aria-describedby` errors, `aria-pressed` filters, visible focus, focus moved after navigation, focus-trapped dialogs that restore focus, live regions for AI status and chat, text beside every colour-coded chart, and reduced motion from both the OS setting and an in-app toggle.

## Project layout

```
api/            Vercel Functions (thin adapters)
server/         handlers, prompts, provider client, rate limiter, Vite dev plugin
src/ai/         schemas, context builder, budget and timeline engines, proposals, demo planner, API client
src/features/   one folder per screen (ai/ is the AI Planner)
src/lib/        pure logic: budget, planner, insights, validation, dates
src/state/      store, reducer, persistence
src/test/       integration tests
```
