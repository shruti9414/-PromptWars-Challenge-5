import { useEffect, useRef, useState } from 'react'
import { AiError, requestAssistant } from '../../ai/client'
import type { AiMode } from '../../ai/client'
import { buildAiContext, buildSnapshot } from '../../ai/context'
import type { Flexibility } from '../../ai/context'
import { demoAssistant } from '../../ai/demo'
import { proposalFromReply } from '../../ai/proposal'
import type { Proposal } from '../../ai/proposal'
import { AiContextSchema, AssistantReplySchema } from '../../ai/schema'
import type { AssistantReply, Source } from '../../ai/schema'
import { Button } from '../../components/ui/Button'
import { DemoTag } from '../../components/ui/Display'
import { useSettings } from '../../state/store'
import type { EventPlan } from '../../types'
import { SourceBadge } from './ProposalPreview'

interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  source?: Source
  model?: string
  reply?: AssistantReply
  proposal?: Proposal | null
}

const SUGGESTIONS = [
  'Reduce my budget by 15%',
  'Adjust the plan for 50 additional guests',
  'I have only seven days left. What should I prioritize?',
  'Suggest an indoor backup plan',
  'Create a vegetarian-friendly menu',
  'Explain why the venue expense is necessary',
]

interface Props {
  event: EventPlan
  mode: AiMode
  flexibility: Flexibility
  today: string
  onPropose: (p: Proposal) => void
}

/** Chat assistant that always works from the selected event and only ever *proposes* changes. */
export function AssistantPanel({ event, mode, flexibility, today, onPropose }: Props) {
  const { currency } = useSettings()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ err: AiError; text: string } | null>(null)
  const seq = useRef(0)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight })
  }, [messages, busy])

  const send = async (raw: string, isRetry = false) => {
    const text = raw.trim()
    if (!text || busy) return
    if (text.length > 600) {
      setError({ err: new AiError('invalid_request', 'Please keep messages under 600 characters.'), text })
      return
    }
    const context = buildAiContext(event, currency, flexibility)
    const valid = AiContextSchema.safeParse(context)
    if (!valid.success) {
      setError({ err: new AiError('invalid_request', 'Some event details are missing or invalid. Edit the event first, then ask again.'), text })
      return
    }
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 600) }))
    if (!isRetry) setMessages((m) => [...m, { id: ++seq.current, role: 'user', content: text }])
    setInput('')
    setError(null)
    setBusy(true)
    try {
      const current = buildSnapshot(event)
      let source: Source
      let model: string | undefined
      let reply: AssistantReply
      if (mode === 'unreachable') {
        source = 'demo'
        reply = AssistantReplySchema.parse(demoAssistant(text, context, current, today))
      } else {
        const res = await requestAssistant({ context, current, message: text, history })
        source = res.source
        model = res.model
        reply = res.reply
      }
      const proposal = proposalFromReply(event, reply, source, model, flexibility, today)
      setMessages((m) => [...m, { id: ++seq.current, role: 'assistant', content: reply.reply, source, model, reply, proposal }])
    } catch (e) {
      setError({ err: e instanceof AiError ? e : new AiError('server', 'Something went wrong. Please try again.'), text })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card assistant" aria-labelledby="assistant-title">
      <div className="card__head">
        <h2 id="assistant-title" className="card__title">Ask the assistant</h2>
        {mode === 'live' ? <SourceBadge source="live" /> : <DemoTag>{mode === 'demo' ? 'Demo assistant: keyword rules, not AI' : 'Offline demo assistant, not AI'}</DemoTag>}
      </div>
      <p className="muted">It knows this event&rsquo;s type, date, place, guests, budget and current plan. It proposes changes; you confirm them.</p>

      <div className="chat" ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 && <p className="muted chat__empty">Try one of the suggestions below, or type your own request.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`msg msg--${m.role}`}>
            <p className="msg__who">{m.role === 'user' ? 'You' : 'Assistant'}</p>
            <p className="msg__text">{m.content}</p>
            {m.reply && (
              <>
                {m.reply.known.length > 0 && <p className="msg__meta"><strong>Known from your event:</strong> {m.reply.known.join(' · ')}</p>}
                {m.reply.assumptions.length > 0 && <p className="msg__meta"><strong>Assumptions:</strong> {m.reply.assumptions.join(' ')}</p>}
                {m.reply.clarifyingQuestions.length > 0 && (
                  <div className="msg__meta"><strong>To refine this, tell me:</strong>
                    <ul className="plain-list">{m.reply.clarifyingQuestions.map((q) => <li key={q}>{q}</li>)}</ul></div>
                )}
              </>
            )}
            {m.proposal && (
              <Button size="sm" variant="primary" onClick={() => onPropose(m.proposal!)}>Review proposed changes</Button>
            )}
          </div>
        ))}
        {busy && <p className="muted" role="status">Thinking&hellip;</p>}
      </div>

      {error && (
        <div className="form-alert" role="alert">
          {error.err.message}{' '}
          {error.err.retryable && <Button size="sm" onClick={() => void send(error.text, true)}>Retry</Button>}
        </div>
      )}

      <div className="chips chips--wrap suggestions" role="group" aria-label="Suggested requests">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip" disabled={busy} onClick={() => void send(s)}>{s}</button>
        ))}
      </div>

      <form className="chat__form" onSubmit={(e) => { e.preventDefault(); void send(input) }}>
        <label htmlFor="assistant-input" className="sr-only">Message to the assistant</label>
        <input id="assistant-input" className="input" value={input} maxLength={600} autoComplete="off" placeholder="e.g. Reduce my budget by 15%" onChange={(e) => setInput(e.target.value)} />
        <Button type="submit" variant="primary" icon="arrow" disabled={busy || !input.trim()}>Send</Button>
      </form>
    </section>
  )
}
