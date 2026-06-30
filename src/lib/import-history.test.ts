import { describe, it, expect } from 'vitest'
import { collectClubNames, planClubResolution, legacyEmail, abbrFor } from './import-history'

describe('collectClubNames', () => {
  it('gathers every referenced name across clubs, records, champions and runners-up', () => {
    const names = collectClubNames({
      clubs: [{ name: 'Rats' }],
      seasons: [{
        season: '2022-23',
        records: [{ club: 'Rats', sport: 'NFL' }, { club: 'Owls', sport: 'NBA' }],
        champions: [{ scope: 'OVERALL', champion: 'Rats', runnerUp: 'Bears' }],
      }],
    })
    expect(new Set(names)).toEqual(new Set(['Rats', 'Owls', 'Bears']))
  })

  it('trims whitespace, de-duplicates by identity, and drops empties', () => {
    const names = collectClubNames({
      seasons: [{
        season: '2021-22',
        records: [{ club: ' Rats ', sport: 'NFL' }, { club: 'Rats', sport: 'NBA' }, { club: '   ', sport: 'NHL' }],
        champions: [{ scope: 'NFL', champion: 'Rats' }],
      }],
    })
    expect(names).toEqual(['Rats'])
  })
})

describe('planClubResolution', () => {
  it('matches existing clubs case-insensitively and flags the rest for creation', () => {
    const { matched, toCreate } = planClubResolution(['Rats', 'Owls', 'Bears'], ['rats', 'BEARS'])
    expect(new Set(matched)).toEqual(new Set(['Rats', 'Bears']))
    expect(toCreate).toEqual(['Owls'])
  })
})

describe('legacyEmail', () => {
  it('is deterministic and disambiguates against used emails', () => {
    const used = new Set<string>()
    const a = legacyEmail('River City Rats', 'abcdef123456', used)
    expect(a).toBe('legacy+river-city-rats-abcdef@nexus.local')
    used.add(a)
    const b = legacyEmail('River City Rats', 'abcdef123456', used)
    expect(b).toBe('legacy+river-city-rats-abcdef-1@nexus.local')
  })
})

describe('abbrFor', () => {
  it('prefers a given abbreviation, else derives from the name', () => {
    expect(abbrFor('River City Rats', 'rcr')).toBe('RCR')
    expect(abbrFor('River City Rats')).toBe('RIVE')
    expect(abbrFor('!!!')).toBe('LEG')
  })
})
