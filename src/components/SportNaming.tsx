'use client'

import { createContext, useContext } from 'react'
import { sportAbbrLabel, sportLabel } from '@/lib/utils'

type Naming = { sportAbbr: Record<string, string>; sportNames: Record<string, string> }

const Ctx = createContext<Naming>({ sportAbbr: {}, sportNames: {} })

export function SportNamingProvider({ value, children }: { value: Naming; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// Returns a labeller for the league's custom sport abbreviations (falls back to
// the raw code). Use in any client component under the league layout.
export function useSportAbbr() {
  const { sportAbbr } = useContext(Ctx)
  return (sport: string) => sportAbbrLabel(sport, sportAbbr)
}

export function useSportName() {
  const { sportNames } = useContext(Ctx)
  return (sport: string) => sportLabel(sport, sportNames)
}
