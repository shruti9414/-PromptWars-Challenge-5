import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../../components/layout/Logo'
import { ButtonLink } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { IMG } from '../../data/constants'
import { useDocumentTitle, useReveal } from '../../hooks'
import './landing.css'

const VERTICALS = [
  { title: 'Weddings', text: 'Multi-day rituals, big guest lists and vendors who book out a year ahead. Keep every moving part in one calm place.', image: IMG.weddingRings, stat: '13 starter tasks' },
  { title: 'Birthdays', text: 'From a first-birthday garden party to a 30th on the rooftop. Themes, cake, music and the all-important RSVP count.', image: IMG.cake, stat: '9 starter tasks' },
  { title: 'Community events', text: 'Fundraisers, festivals and neighbourhood meetups run on volunteers and tight budgets. Plan both with confidence.', image: IMG.communityHall, stat: '9 starter tasks' },
]

const STEPS = [
  { n: '01', title: 'Describe your event', text: 'Pick the type, date, place, guest count, budget and theme in a four-step wizard.' },
  { n: '02', title: 'Get a starter plan', text: 'A budget split, dated tasks and a vendor checklist are laid out from built-in templates.' },
  { n: '03', title: 'Make it yours', text: 'Edit expenses, tick off tasks, shortlist vendors and track every RSVP.' },
  { n: '04', title: 'Stay on track', text: 'The dashboard flags overdue tasks, unbooked essentials and budget pressure.' },
]

const FEATURES: { icon: IconName; title: string; text: string; to: string }[] = [
  { icon: 'wallet', title: 'Budget that adds up', text: 'Planned vs. committed spend, live charts and over-budget warnings.', to: '/app/budget' },
  { icon: 'tasks', title: 'A timeline you can trust', text: 'Dated, prioritised tasks grouped by month with overdue tracking.', to: '/app/timeline' },
  { icon: 'store', title: 'Vendor checklist', text: 'Move each supplier from research to booked, with quotes and notes.', to: '/app/vendors' },
  { icon: 'sparkles', title: 'Ideas gallery', text: 'Filter curated decor, food and entertainment ideas, then save favourites.', to: '/app/ideas' },
  { icon: 'users', title: 'Guest management', text: 'RSVP status, plus-ones and dietary needs, with a live headcount.', to: '/app/guests' },
  { icon: 'compass', title: 'Vendor directory', text: 'Browse clearly labelled demo vendors and add them to your checklist.', to: '/app/vendors/directory' },
]

function Section({ id, className, children, label }: { id?: string; className?: string; children: ReactNode; label: string }) {
  const { ref, className: reveal } = useReveal<HTMLElement>()
  return (
    <section id={id} ref={ref} aria-label={label} className={`${className ?? ''} ${reveal}`}>
      {children}
    </section>
  )
}

export function LandingPage() {
  useDocumentTitle('Your dream event, planned')
  return (
    <div className="landing">
      <a href="#top-content" className="skip-link">Skip to main content</a>
      <header className="l-nav">
        <Logo tone="light" />
        <nav aria-label="Landing" className="l-nav__links">
          <a href="#events">Events</a>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
        </nav>
        <div className="l-nav__cta">
          <ButtonLink to="/app/dashboard" variant="ghost" size="sm" className="btn--on-dark">Explore demo</ButtonLink>
          <ButtonLink to="/app/events/new" variant="light" size="sm">Plan an event</ButtonLink>
        </div>
      </header>

      <main id="top-content">
        <section className="l-hero" aria-labelledby="hero-title">
          <div className="l-hero__copy">
            <p className="l-chip"><Icon name="sparkles" size={15} /> Phase 1 preview &middot; demo data</p>
            <h1 id="hero-title" className="l-hero__title">
              Your dream event,<br />planned with <em>Gatherly</em>.
            </h1>
            <p className="l-hero__lead">
              One calm workspace for weddings, birthdays and community events: budgets that add up, timelines that keep you moving, and vendor checklists you can actually finish.
            </p>
            <div className="l-hero__actions">
              <ButtonLink to="/app/dashboard" variant="primary" size="lg" iconAfter="arrow">Explore the demo</ButtonLink>
              <ButtonLink to="/app/events/new" variant="light" size="lg">Plan your event</ButtonLink>
            </div>
            <p className="l-hero__fine">No sign-up. Sample events are preloaded and saved only in your browser.</p>
          </div>

          <div className="l-hero__stage" aria-hidden="true">
            <div className="stage__tilt">
              <img className="stage__img stage__img--a" src={IMG.weddingBouquet} alt="" width="900" height="600" fetchPriority="high" />
              <img className="stage__img stage__img--b" src={IMG.cake} alt="" width="900" height="821" />
              <img className="stage__img stage__img--c" src={IMG.communityFriends} alt="" width="900" height="506" />
              <div className="stage__card stage__card--budget">
                <span className="stage__k">Budget committed</span>
                <strong>87%</strong>
                <span className="stage__bar"><span /></span>
                <span className="stage__sample">sample data</span>
              </div>
              <div className="stage__card stage__card--task">
                <span className="stage__k">Next up</span>
                <strong>Finalise caterer</strong>
                <span className="stage__sample">due in 3 days</span>
              </div>
              <div className="stage__card stage__card--rsvp">
                <span className="stage__k">RSVPs</span>
                <strong>14 / 20 replied</strong>
              </div>
            </div>
          </div>
        </section>

        <Section id="events" className="l-section" label="Event types">
          <p className="eyebrow eyebrow--violet">Made for the moments that matter</p>
          <h2 className="l-h2">Three kinds of celebration, one planner.</h2>
          <ul className="l-verticals">
            {VERTICALS.map((v) => (
              <li key={v.title} className="l-vertical">
                <img src={v.image} alt="" loading="lazy" width="400" height="260" />
                <div className="l-vertical__body">
                  <h3>{v.title}</h3>
                  <p>{v.text}</p>
                  <span className="l-vertical__stat">{v.stat}</span>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="how" className="l-section l-section--tint" label="How it works">
          <p className="eyebrow eyebrow--violet">How it works</p>
          <h2 className="l-h2">From first idea to final headcount.</h2>
          <ol className="l-steps">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="l-steps__n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="features" className="l-section" label="Features">
          <p className="eyebrow eyebrow--violet">Everything in one place</p>
          <h2 className="l-h2">Every screen is built for the event in front of you.</h2>
          <ul className="l-features">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <Link to={f.to} className="l-feature">
                  <span className="l-feature__icon"><Icon name={f.icon} size={22} /></span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                  <span className="l-feature__go">Open <Icon name="arrow" size={16} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section className="l-cta" label="Try the demo">
          <div className="l-cta__inner">
            <div>
              <h2 className="l-h2 l-h2--light">Walk through a fully planned wedding.</h2>
              <p>Aarav &amp; Meera&rsquo;s sample wedding has a budget, timeline, vendors and 20 guests ready to explore. Edit anything; reset any time from Settings.</p>
            </div>
            <ButtonLink to="/app/dashboard" variant="light" size="lg" iconAfter="arrow">Open the sample event</ButtonLink>
          </div>
        </Section>
      </main>

      <footer className="l-foot">
        <Logo tone="light" />
        <p>
          Phase 1 demo. Events, vendors and guests shown are sample data. The planning suggestions are rule-based templates; no live AI, authentication, vendor availability or database is connected yet. Photography from Unsplash.
        </p>
      </footer>
    </div>
  )
}
