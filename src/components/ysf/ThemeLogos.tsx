'use client'
// Dark mode logos. Brand files are named for the background they sit on (`_white` = made for a white
// background, `_black` = for black). When the device is in dark mode the page background is dark, so a
// logo made for white swaps to its `_black` partner — only where that partner exists. Logos made for a
// color (league or club primaries) and club crests are left alone. Switches back in light mode.
import { useEffect } from 'react'

const PAIRS: [RegExp, string][] = [
  [/(\/ysf\/leagues\/(?:fl|hl|ba|lb)_symbol_)white\.svg$/, '$1black.svg'],
  [/(\/ysf\/fed\/(?:primary|wordmark|cup_horiz)_)white\.svg$/, '$1black.svg'],
]
const darkSrc = (src: string) => { for (const [re, to] of PAIRS) if (re.test(src)) return src.replace(re, to); return null }

export default function ThemeLogos() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = mq.matches
      for (const img of Array.from(document.images)) {
        const light = img.dataset.lightSrc ?? img.getAttribute('src') ?? ''
        const want = dark ? darkSrc(light) : null
        if (want) { if (img.getAttribute('src') !== want) { img.dataset.lightSrc = light; img.setAttribute('src', want) } }
        else if (img.dataset.lightSrc) { img.setAttribute('src', img.dataset.lightSrc); delete img.dataset.lightSrc }
      }
    }
    let raf = 0
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply) }
    apply()
    mq.addEventListener('change', apply)
    // new content (tabs, client navigation) brings new images
    const mo = new MutationObserver(later)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => { mq.removeEventListener('change', apply); mo.disconnect(); cancelAnimationFrame(raf) }
  }, [])
  return null
}
