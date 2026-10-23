# Gatherly AI: Celebration & Event Planner

*Your dream event, planned with AI.* A web app for planning **weddings, birthdays, anniversaries and community events**: budgets, timelines, vendor checklists, guest lists and AI-assisted plans in one place. Built for PromptWars Challenge 5.

## Chosen vertical

**Celebration & Event Planner.** An assistant that helps people organise celebrations with budgets, timelines, vendor checklists and personalised ideas.

## The problem and who it is for

Planning a celebration means juggling a budget, dozens of dated tasks, vendors and a guest list, usually across chats and spreadsheets. Gatherly AI is for **families and friends organising a wedding, birthday or anniversary, and volunteers running community events**, who want a clear plan they can adjust, not a black box.

## Approach and logic

The assistant makes decisions from the user's own context rather than from a fixed script:

- **Event type decides the plan shape.** Weddings, birthdays, anniversaries and community events each have their own budget split, task list (with lead times in days before the event) and vendor categories.
- **Time left decides the schedule.** Task due dates are computed from the real event date. If the event is soon, lead times are shortened proportionally so nothing is due in the past; dependencies are validated (no loops, no prerequisite due after the task that needs it) and a last-minute task is always present.
- **Budget style decides the reserve.** Strict, moderate or flexible budgets keep a 10%, 7% or 5% contingency. Totals, cost per guest and over-budget amounts are always calculated by application code; if a plan is over budget, a trimmed alternative that fits is offered (optional lines are cut first).
- **Venue status, priorities and preferences shape the suggestions** (for example a much smaller venue budget line when the venue is already booked or owned, no venue vendor to chase, and indoor backups in the risk list for outdoor events).
- **Change requests are computed, not guessed.** "Reduce my budget by 15%" or "50 more guests" is turned into an exact change by the app, shown as a preview and applied only after confirmation.
- **AI is advisory.** A model proposes themes, ideas, budget lines, tasks, vendor requirements and risks. Its output is validated, its numbers and dates are recalculated, and it never overwrites paid, billed, finished or hand-edited items. Without an API key a rule-based demo planner does the same job and is labelled as such.

## How the solution works

1. **Describe the event** in a four-step wizard (type, date, place, guests, budget, theme, venue status, priorities, preferences). A starter plan is generated from templates.
2. **Run the AI Planner** (full plan or one section: theme, budget, timeline, vendors, ideas), or chat with the assistant about this event.
3. **Review the preview.** It lists exactly what would change, flags problems (such as impossible deadlines or an over-budget plan) and shows prices as estimates, never quotations.
4. **Confirm.** The change is applied, a restorable snapshot is saved, and every screen updates.
5. **Run the event** from the Budget, Timeline, Vendor and Guest pages. Booking a vendor with a quote links it to a budget expense; changing the event date previews which deadlines move.

## How it aligns with the challenge

| Challenge need | Where it lives |
| --- | --- |
| Budgets | Budget page: planned vs actual, remaining, over-budget warnings, category charts, cost per guest, CSV export |
| Timelines | Timeline page: dated tasks, priorities, prerequisites, overdue flags, list and calendar views, date-change preview |
| Vendor checklists | Vendor Checklist and Directory: statuses, requirements, quotes linked to Budget, favourites |
| Personalised ideas | AI Planner (themes, decor, activities, food, risks, savings) and the Ideas Gallery |
| Guests | RSVP tracking, plus-ones, dietary notes, CSV import and export |
| GenAI | Server-side AI route with validated structured output; a clearly labelled demo planner when no key is set |

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
                                        Anthropic or OpenAI API, forced tool call  <-- API key (server only)
                                        validate model output (Zod)
validate response (Zod)     <-------    { source: "live" | "demo", patch }
buildProposal(): app code recomputes
  every number and date, merges with
  the user's own data
Preview  ->  user confirms  ->  apply + snapshot (undo)
```

- **Server-side only.** `api/plan.ts`, `api/assistant.ts` and `api/status.ts` are Vercel Functions; during `npm run dev` the same handlers are served by a Vite plugin (`server/vitePlugin.ts`). The API key is read from `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` in `server/` and never reaches the browser bundle. Each key is used only with its own provider (an `sk-ant-` key is Anthropic, other `sk-` keys in `OPENAI_API_KEY` are OpenAI), and a mismatched key is ignored. DeepSeek is called in JSON mode with a one-time retry; every answer is checked against the same schemas.
- **Structured output.** The model must answer through a forced tool call whose input schema comes from the Zod schemas in `src/ai/schema.ts` (overview, recommendations, budget lines, timeline items, vendor requirements, risks, assumptions, follow-up questions). Output is validated on the server and again in the browser.
- **Numbers are never trusted.** `src/ai/budget.ts` and `src/ai/timeline.ts` drop invalid estimates, cap absurd ones, round to whole units, add a contingency reserve sized to the budget style (strict 10%, moderate 7%, flexible 5%), compute totals and cost per guest, detect budget overruns and build a trimmed alternative that fits (optional lines first, then essentials down to a floor). Due dates come from the real event date plus a "days before event" offset; short runways are compressed proportionally, dependencies are validated (unknown, self and circular ones are removed, dependencies are never due after their dependents) and a last-minute task is added if missing. Percentage and guest-count changes from the assistant ("reduce by 15%", "50 more guests") are computed by the app.
- **Nothing is overwritten silently.** Every result (full plan, section regeneration, assistant proposal) becomes a *proposal* with a preview and a confirmation dialog. Paid, billed, completed, booked or hand-edited items are always kept; stale previews are rejected. Each applied change stores a snapshot you can restore from "Plan history" (last 8 kept).
- **Privacy.** Only event type, date, location, guest count, budget, currency, theme, preferences, venue status, priorities, budget style and an optional instructions box are sent. The event name, notes, guest names and vendor contact details are never sent. The AI page shows the exact JSON that will be sent.
- **Honest labels.** Prices are always called estimates, not quotations. The AI only produces vendor *requirements and search criteria*; it never invents businesses, reviews or availability.
- **Demo mode.** With no API key, the server answers with a deterministic rule-based planner and a keyword assistant, labelled "Demo planner, not AI" everywhere. If the API cannot be reached at all, the same demo code runs in the browser and is labelled "Offline demo".
- **Failure handling.** Invalid or truncated model output, provider errors, rate limits (429 with retry hint) and timeouts (75s server, 90s browser) each produce a specific message and a **Try again** button. Event data is never changed by a failed request.
- **Rate limiting.** In-memory per-IP limits (8 plan requests and 20 assistant requests per minute per instance). This is a best-effort guard on serverless platforms, not a security boundary.

### Live AI vs demo mode

| Feature | With an API key | Without a key |
| --- | --- | --- |
| Full plan, section regeneration | Live model | Rule-based demo planner |
| Assistant | Live model | Keyword rules (6 request types) |
| Budget, timeline and date maths, validation, merging, preview, undo | App code (same) | App code (same) |
| Starter plan in the wizard, dashboard suggestions | Rule-based (not AI) | Rule-based (not AI) |

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` | No (enables live AI; use one) | Server-side only. Put it in `.env.local` locally, or in your hosting provider environment settings |
| `AI_PROVIDER` | No | `anthropic`, `openai` or `deepseek`, only needed when several keys are set
| `DEEPSEEK_MODEL` | No | DeepSeek model (default `deepseek-chat`) | |
| `AI_MODEL` | No | Overrides the default model (`claude-sonnet-5-5` for Anthropic, `gpt-4.1` for OpenAI, `deepseek-chat` for DeepSeek) |

Copy `.env.example` to `.env.local` and fill it in. `.env*` files are git-ignored (only `.env.example` is committed).

## Setup

Requires **Node.js 20.19+ or 22.12+** (a Vite requirement) and npm. Run every command from the project folder (the one containing `package.json`).

```powershell
npm install
copy .env.example .env.local   # optional: add one provider key for live AI (macOS/Linux: cp)
npm run dev                  # open http://localhost:5173 (UI and /api together); stop with Ctrl+C
npm run build                # type-check + production build into dist/
npm run preview              # serve the build at http://localhost:4173
```

Without a key the app runs fully in labelled demo mode. See [MANUAL_TESTING.md](MANUAL_TESTING.md) for a browser checklist.

Deploying to Vercel works with no configuration: `dist/` is served statically and `api/*.ts` become functions. Add one provider key in the project environment variables.

## Testing

```powershell
npm test               # Vitest + Testing Library, runs once
npm run typecheck      # strict TypeScript
npm run lint           # ESLint (typescript-eslint, react-hooks)
npm run test:coverage  # same tests with a coverage report (about 90% of statements)
npm run build          # type-check + production build
```

The suite (about 390 tests) covers Phase 1 (form validation, budget maths, planner, flows through every screen), Phase 2, and Phase 3 (CSV encode/decode and file validation, task dependencies, date-change rescheduling, calendar helpers, favourites, anniversary events), plus:

- accessibility: every screen (and the open add-dialogs, with and without events) is run through the axe-core rule set (WCAG 2 A/AA and best practices; colour contrast cannot run in jsdom), plus structural checks
- server hardening: origin and content-type checks, body size in bytes, generic errors, provider failures for Anthropic, OpenAI and DeepSeek, and repair of slightly malformed JSON-mode output
- storage reliability: corrupted, partial, tampered and unavailable localStorage


- AI schema validation, including malformed, truncated and out-of-range model output
- budget limits: cost per guest, over-budget detection, trimmed alternatives, contingency, guest/percentage changes
- timeline dates, compression, dependency repair, booking deadlines, past events
- missing or invalid event details, request size and unknown-field rejection
- API failures: provider errors, 429, timeouts, network loss, unreadable bodies, key never present in responses
- prompt fencing against injected tags
- proposal validation, no change before confirmation, preserved user data, undo, stale-preview protection
- UI flows for generation, retry, offline demo fallback, regeneration, history restore and the assistant

Automated tests mock every provider; none uses the network or a real key. The live path was also exercised by hand against the DeepSeek API during development; that is not part of the test suite.

## Security notes

- The API key is read only in `server/` and `api/` from `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `DEEPSEEK_API_KEY`; the browser bundle contains no key or provider URL.
- API routes accept only `POST` with `application/json` (`GET` for status), refuse requests whose `Origin` is another site, cap the body at 24 KB (measured in bytes), validate every field with Zod (unknown fields are rejected), rate-limit per client, and return generic error messages with no stack traces or provider bodies. Nothing is logged.
- Model output is validated with Zod on the server and again in the browser; React renders it as text (no `dangerouslySetInnerHTML`), and user text in prompts is fenced as data.
- `vercel.json` sets a Content-Security-Policy (same-origin scripts, no framing), `nosniff`, `no-referrer` and a restrictive Permissions-Policy for deployed builds.
- localStorage is not secure storage and the app has no accounts, so there are no multi-user guarantees. Stored data is validated on load: a damaged event is skipped (the rest load), the original text is copied to a backup key before anything can overwrite it, and a notice explains what happened. If the browser refuses a write, the app says so instead of failing silently.

## Assumptions and limitations

- By design, there is no database or login: all data lives in the browser's `localStorage`, scoped to one browser on one device. Clearing site data, using a different browser, or going incognito starts fresh. "Export as JSON" (Settings) is the only way to move data elsewhere.
- Vendors, guests and prices in the sample data are fictional. No availability or real bookings exist.
- A vendor's linked Budget expense is created the moment it's booked with a quote, and its planned amount tracks later quote edits; it is never deleted automatically, and any actual/paid amount you enter against it is yours to manage from the Budget page.
- Guest CSV import accepts `Name, Group, RSVP, Plus-ones, Dietary` columns (any order, case-insensitive); rows need at least a name, unrecognised Group/RSVP values fall back to a default, and out-of-range plus-ones are clamped rather than rejecting the row.
- Currency (default INR) changes display only; it does not convert values.
- Layout at different screen sizes, keyboard use, focus rings and screen-reader behaviour were not checked in a real browser by the author; automated checks cover structure and axe-core rules only, and text colour contrast was calculated from the design tokens, not measured on screen.
- Live-AI quality depends on the provider and model. Only DeepSeek (`deepseek-chat`) was tried against its real API (plan sections, a full plan and the assistant, with occasional invalid answers that the app rejects or retries once); Anthropic and OpenAI are covered by mocked tests only.
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
