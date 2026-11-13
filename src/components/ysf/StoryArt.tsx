// A story's picture: the club's crest on its colour. Two clubs split the tile on the diagonal, one crest
// in each half; three or more sit side by side in equal panels. Works on the server and in the browser.
export type ArtTile = { bg: string; img: string }

export default function StoryArt({ tiles, className = '' }: { tiles: ArtTile[]; className?: string }) {
  const t = tiles.length ? tiles : [{ bg: '#000', img: '' }]
  if (t.length === 1) return (
    <div className={`relative flex items-center justify-center rounded overflow-hidden ${className}`} style={{ background: t[0].bg }}>
      {t[0].img && <img src={t[0].img} alt="" className="h-[62%] w-auto max-w-[60%] object-contain" />}
    </div>
  )
  if (t.length === 2) return (
    <div className={`relative rounded overflow-hidden ${className}`}>
      <div className="absolute inset-0" style={{ background: t[0].bg, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
      <div className="absolute inset-0" style={{ background: t[1].bg, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><line x1="100" y1="0" x2="0" y2="100" stroke="#fff" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg>
      {/* each crest sits on the centre of its triangle (a third of the way in from its corner) */}
      {t[0].img && <img src={t[0].img} alt="" className="absolute left-[33.3%] top-[33.3%] -translate-x-1/2 -translate-y-1/2 h-[40%] w-[28%] object-contain" />}
      {t[1].img && <img src={t[1].img} alt="" className="absolute left-[66.7%] top-[66.7%] -translate-x-1/2 -translate-y-1/2 h-[40%] w-[28%] object-contain" />}
    </div>
  )
  return (
    <div className={`relative flex rounded overflow-hidden ${className}`}>
      {t.slice(0, 4).map((x, i) => (
        <div key={i} className={`flex-1 min-w-0 flex items-center justify-center ${i ? 'border-l-2 border-white' : ''}`} style={{ background: x.bg }}>
          {x.img && <img src={x.img} alt="" className="w-[70%] max-h-[55%] object-contain" />}
        </div>
      ))}
    </div>
  )
}
