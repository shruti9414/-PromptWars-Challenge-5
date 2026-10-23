import { useEffect, useRef, useState } from 'react'
import { todayISO } from './lib/dates'

/** Adds `is-visible` once the element scrolls into view, for the landing page's entrance animations. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, className: visible ? 'reveal is-visible' : 'reveal' }
}

/** Keeps `today` fresh if the tab stays open across midnight. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO())
  useEffect(() => {
    const id = window.setInterval(() => setToday(todayISO()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return today
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} - Gatherly AI`
  }, [title])
}
