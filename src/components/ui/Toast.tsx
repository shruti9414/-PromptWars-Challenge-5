import { useEffect, useState } from 'react'

interface ToastItem {
  id: number
  message: string
}

let seq = 0
let items: ToastItem[] = []
const listeners = new Set<(t: ToastItem[]) => void>()

function emit() {
  listeners.forEach((l) => l(items))
}

/** Shows a short confirmation message. Rendered by <ToastHost /> inside an aria-live region. */
export function toast(message: string): void {
  const item = { id: ++seq, message }
  items = [...items, item].slice(-3)
  emit()
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== item.id)
    emit()
  }, 4000)
}

export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>(items)
  useEffect(() => {
    listeners.add(setList)
    return () => {
      listeners.delete(setList)
    }
  }, [])
  return (
    <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
      {list.map((t) => (
        <p key={t.id} className="toast">{t.message}</p>
      ))}
    </div>
  )
}
