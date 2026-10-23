# Manual testing checklist

Run the app first (see README, "Setup"). Everything below starts as **To Test**; tick it only after you have seen it work.

```powershell
npm install
npm run dev          # open http://localhost:5173 (stop with Ctrl+C)
```

Open the browser console with **F12 → Console** and keep the terminal visible. Note any red errors.

## A. Initial setup
- [ ] To Test: `npm run dev` starts and prints `http://localhost:5173/`
- [ ] To Test: landing page loads, no red errors in console or terminal
- [ ] To Test: "Explore the demo" opens the dashboard; every sidebar item opens its page
- [ ] To Test: browser Back / Forward move between pages correctly
- [ ] To Test: narrow window (about 375 px, or F12 → device toolbar): menu button opens the sidebar, no sideways page scroll, text not clipped
- [ ] To Test: desktop width (1280 px+) looks correct

## B. Event management
- [ ] To Test: My Events → new event (try each type: wedding, birthday, anniversary, community); finish the 4-step wizard
- [ ] To Test: submit with blanks, a past date, 0 guests, a negative budget → clear errors, nothing saved
- [ ] To Test: leave the wizard half-filled and come back → draft is restored; "Clear draft" clears it
- [ ] To Test: edit an event (name, guests, budget) → dashboard and other pages update
- [ ] To Test: change the event **date** → preview lists task deadlines that would move; Cancel changes nothing
- [ ] To Test: delete an event → confirmation appears; it disappears from lists
- [ ] To Test: refresh (F5) → events and edits are still there
- [ ] To Test: Settings → Delete all events → empty states appear with a way forward ("Plan an event" / "Load sample events")
- [ ] To Test: Settings → Reset to sample events shows a confirmation, then restores the three samples

## C. AI planning (AI Planner page)
- [ ] To Test: **Without an API key:** banner says "Demo mode"; results are labelled "Demo planner, not AI"
- [ ] To Test: "Generate full plan" → loading text, then a preview; nothing changes until "Apply changes" → "Confirm and apply"
- [ ] To Test: Discard / Cancel leaves the event untouched
- [ ] To Test: refresh a single section (theme, budget, timeline, vendors, ideas); your finished tasks, paid and hand-edited items are kept
- [ ] To Test: Plan history → "Restore previous version" works (with confirmation)
- [ ] To Test: assistant chat: "Reduce my budget by 15%", "Plan for 50 more guests" → proposals appear with a preview, never applied silently
- [ ] To Test: "What is sent to the AI" shows no event name, notes or guest names
- [ ] To Test: stop the dev server while the page is open, click Generate → "Offline demo" fallback or a clear retry message, existing plan intact
- [ ] To Test (optional, needs your own key): create `.env.local` with `ANTHROPIC_API_KEY=...`, restart `npm run dev` → banner says "Live AI is on"; a generated plan is labelled with the model name. Never paste the key anywhere else.

## D. Budget and expenses
- [ ] To Test: add an expense (planned and actual); totals, remaining and charts update immediately
- [ ] To Test: decimals (e.g. 1234.56), `abc`, `-5`, a huge number → sensible validation messages
- [ ] To Test: push spending over the budget → over-budget warning and suggestions
- [ ] To Test: mark paid, edit, delete (with confirmation)
- [ ] To Test: search and filter expenses; Export CSV downloads a readable file
- [ ] To Test: dashboard budget numbers match the Budget page

## E. Timeline, tasks, vendors, guests
- [ ] To Test: add, edit, complete and delete a task; overdue tasks are flagged
- [ ] To Test: List ↔ Calendar toggle; a calendar task opens for editing; month buttons work
- [ ] To Test: task prerequisites: pick one; try a loop (A needs B, B needs A) → refused with a message
- [ ] To Test: vendors: add, edit, change status through Needed → Contacted → Quote received → Booked → Completed; booking with a quote creates a linked expense
- [ ] To Test: Vendor Directory: search, category filter, ★ favourite, "Favourites only", "Add to checklist"
- [ ] To Test: guests: add, edit, delete, RSVP filter, plus-ones, headcount summary
- [ ] To Test: guest CSV export, then import the same file → duplicates are ignored; a non-CSV file is rejected
- [ ] To Test: switch events with the sidebar switcher → each event shows only its own tasks, vendors, guests and expenses
- [ ] To Test: refresh → all of the above persists

## F. Error handling and accessibility
- [ ] To Test: Tab through a page: a visible focus ring on every control, logical order, "Skip to main content" works
- [ ] To Test: open a dialog → focus moves inside; Esc closes it; focus returns to the button
- [ ] To Test: every form field has a visible label; errors appear next to the field
- [ ] To Test: icon-only buttons (edit, delete, close) have tooltips or names when focused
- [ ] To Test: Settings → Reduce motion; animations calm down
- [ ] To Test: no red errors in the console during all of the above; terminal shows no stack traces

## G. Final checks
- [ ] To Test: reload and repeat one main workflow end to end
- [ ] To Test: `npm test` → all tests pass
- [ ] To Test: `npm run build` → succeeds; `npm run preview` serves the build at `http://localhost:4173`
- [ ] To Test: search the built files for secrets: `Select-String -Path dist\assets\*.js -Pattern "ANTHROPIC|x-api-key|api.anthropic"` → no results
- [ ] To Test: README steps work on a clean copy (clone the repo into a new folder, follow README)
- [ ] To Test (GitHub, your account): repository is **Public**, **Branches** shows exactly one branch, size is under 10 MB

## Known limits to keep in mind while testing
- Data lives only in this browser (localStorage). A different browser or a private window starts empty.
- Live AI has only been tested against a mocked provider, never a real API key.
- Layout, focus rings and screen-reader behaviour have not been checked by the author in a real browser.
