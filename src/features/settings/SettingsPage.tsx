import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Badge, DemoTag, PageHeader } from '../../components/ui/Display'
import { useAiStatus } from '../ai/useAiStatus'
import { SelectField, TextField } from '../../components/ui/Fields'
import { Icon } from '../../components/ui/Icon'
import { ConfirmDialog } from '../../components/ui/Modal'
import { toast } from '../../components/ui/Toast'
import { CURRENCIES } from '../../lib/format'
import { cleanText } from '../../lib/validation'
import { useDocumentTitle } from '../../hooks'
import { store, useStore } from '../../state/store'
import type { Currency } from '../../types'
import './settings.css'

type Pending = 'reset' | 'clear' | null

function downloadJson() {
  const { events, settings } = store.getState()
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), settings, events }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'gatherly-events.json'
  a.click()
  URL.revokeObjectURL(url)
}

export function SettingsPage() {
  useDocumentTitle('Settings')
  const settings = useStore((s) => s.settings)
  const ai = useAiStatus()
  const events = useStore((s) => s.events)
  const [name, setName] = useState(settings.displayName)
  const [pending, setPending] = useState<Pending>(null)

  return (
    <div className="settings">
      <PageHeader eyebrow="Preferences" title="Settings">Everything here is stored only in this browser.</PageHeader>

      <section className="card" aria-labelledby="s-profile">
        <h2 id="s-profile" className="card__title">Profile & display</h2>
        <div className="form-grid">
          <TextField
            label="Display name" value={name} maxLength={40} autoComplete="off"
            hint="Used for greetings. Not sent anywhere."
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const clean = cleanText(name).slice(0, 40) || 'Guest planner'
              setName(clean)
              if (clean !== settings.displayName) store.dispatch({ type: 'settings/update', patch: { displayName: clean } })
            }}
          />
          <SelectField label="Currency" value={settings.currency} onChange={(e) => store.dispatch({ type: 'settings/update', patch: { currency: e.target.value as Currency } })}
            >
            {CURRENCIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </SelectField>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={settings.reduceMotion} onChange={(e) => store.dispatch({ type: 'settings/update', patch: { reduceMotion: e.target.checked } })} />
          <span><strong>Reduce motion</strong><span className="muted"> Turns off animations and tilt effects. Your system setting is respected automatically too.</span></span>
        </label>
        <p className="muted settings__note">Changing the currency only changes how amounts are shown. It does not convert values.</p>
      </section>

      <section className="card" aria-labelledby="s-data">
        <h2 id="s-data" className="card__title">Your data</h2>
        <p className="muted">{events.length} {events.length === 1 ? 'event is' : 'events are'} saved in this browser&rsquo;s local storage. There is no account and no database, so clearing site data or switching browser starts fresh. Do not enter passwords or card details anywhere in the app.</p>
        <div className="settings__buttons">
          <Button icon="download" onClick={() => { downloadJson(); toast('Exported gatherly-events.json') }} disabled={events.length === 0}>Export as JSON</Button>
          <Button onClick={() => setPending('reset')}>Reset to sample events</Button>
          <Button variant="danger" icon="trash" onClick={() => setPending('clear')} disabled={events.length === 0}>Delete all events</Button>
        </div>
      </section>

      <section className="card" aria-labelledby="s-ai">
        <h2 id="s-ai" className="card__title"><Icon name="sparkles" size={18} /> AI assistant {ai === null ? null : ai.mode === 'live' ? <Badge tone="ok">Live AI</Badge> : <DemoTag>Demo mode</DemoTag>}</h2>
        <p className="muted">
          {ai?.mode === 'live' ? 'A live AI model is configured on the server. Plans it writes are checked by the app, and every number is recalculated before you review it.' : 'No AI key is configured on the server, so the AI Planner uses a built-in rule-based demo planner. It is clearly labelled and is not an AI model.'} Vendor availability and real quotations are never invented.
        </p>
      </section>

      <ConfirmDialog
        open={pending === 'reset'}
        title="Reset to sample events?"
        message="Your current events will be replaced by the three sample events."
        confirmLabel="Reset"
        onCancel={() => setPending(null)}
        onConfirm={() => { store.resetToDemo(); setName(store.getState().settings.displayName); toast('Sample events restored'); setPending(null) }}
      />
      <ConfirmDialog
        open={pending === 'clear'}
        title="Delete all events?"
        message="Every event, budget, task, vendor and guest will be removed from this browser."
        confirmLabel="Delete all"
        onCancel={() => setPending(null)}
        onConfirm={() => { store.clearAll(); toast('All events deleted'); setPending(null) }}
      />
    </div>
  )
}
