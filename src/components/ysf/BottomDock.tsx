'use client'
// The ticker + phone tab bar, fixed to the very bottom of the screen (under the iPhone home indicator
// too). The page gets matching bottom padding so nothing is hidden behind it.
import { useEffect, useRef } from 'react'

export default function BottomDock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => { document.body.style.paddingBottom = `${el.offsetHeight}px` }
    fit()
    const ro = new ResizeObserver(fit); ro.observe(el)
    return () => { ro.disconnect(); document.body.style.paddingBottom = '' }
  }, [])
  return (
    <div ref={ref} className="fixed inset-x-0 bottom-0 z-40 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {children}
    </div>
  )
}
