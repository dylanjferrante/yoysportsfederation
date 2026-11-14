import Foundation

// Decoded replies from the ySF server's /api/mobile/ysf/* routes (and /api/leagues/ysf/myclub).

struct Club: Decodable, Hashable, Identifiable {
    let id: String; let name: String; let abbr: String
    let crest: String?; let crestOnColor: String?; let color: String?; let ink: String
}
struct LeagueMeta: Decodable, Hashable {
    let sport: String; let code: String; let key: String; let name: String; let color: String
    /// asset with a dark-mode variant (white page → black page)
    var symbolAsset: String { "\(key)_symbol" }
}
struct Tile: Decodable, Hashable { let bg: String; let img: String? }
struct Story: Decodable, Hashable, Identifiable {
    let id: String; let kicker: String; let headline: String; let dek: String; let by: String; let published: String
    let tiles: [Tile]; let body: [String]?
}

struct HomeData: Decodable {
    struct Week: Decodable { let num: Int; let live: Bool }
    struct Line: Decodable, Hashable { let sport: String; let status: String; let a: Double?; let b: Double?; let matchupId: String }
    struct Pair: Decodable, Hashable { let a: Club?; let b: Club?; let lines: [Line] }
    let leagues: [LeagueMeta]; let week: Week; let scoreboard: [Pair]; let topStories: [Story]; let headlines: [Story]
}

struct ScoresData: Decodable {
    struct Line: Decodable, Hashable { let sport: String; let label: String; let status: String; let a: Double?; let b: Double?; let matchupId: String }
    struct Pair: Decodable, Hashable { let a: Club?; let b: Club?; let lines: [Line] }
    let leagues: [LeagueMeta]; let week: Int; let prev: Int?; let next: Int?; let pairings: [Pair]
}

struct StandingsData: Decodable {
    struct CupRow: Decodable, Hashable { let rk: Int; let club: Club; let pts: Double; let w: Int; let l: Int; let cupPct: Double }
    struct Row: Decodable, Hashable { let rk: Int; let club: Club; let w: Int; let l: Int; let pf: Double; let po: Double }
    let season: String; let leagues: [LeagueMeta]; let cup: [CupRow]; let tables: [String: [Row]]
}

struct NewsData: Decodable {
    struct Section: Decodable, Hashable { let id: String; let label: String; let color: String }
    let sections: [Section]; let stories: [Story]
}

struct ClubsData: Decodable {
    struct Entry: Decodable, Hashable, Identifiable {
        let id: String; let name: String; let abbr: String; let crest: String?; let crestOnColor: String?; let color: String?; let ink: String
        let cupRank: Int; let cupPts: Double; let rec: String
    }
    let clubs: [Entry]
}

struct ClubData: Decodable {
    struct Cup: Decodable { let rk: Int; let pts: Double; let rec: String; let cupPct: Double }
    struct Trophy: Decodable, Hashable { let season: String; let scope: String; let name: String }
    struct Week: Decodable, Hashable { let sport: String; let label: String; let matchupId: String; let oppAb: String; let oppLogo: String?; let me: Double?; let them: Double?; let status: String }
    struct CalCol: Decodable, Hashable { let key: String; let label: String; let current: Bool; let season: String? }
    struct CalCell: Decodable, Hashable { let matchupId: String; let span: Int; let label: String; let opp: String; let result: String; let tone: String; let playoff: Bool; let round: String? }
    struct CalRow: Decodable, Hashable { let sport: String; let cells: [CalCell?] }
    struct Calendar: Decodable { let cols: [CalCol]; let rows: [CalRow] }
    struct Sched: Decodable, Hashable { let per: String; let dates: String; let ha: String; let crest: String?; let opp: String; let matchupId: String; let res: String; let score: String }
    struct LeagueSeason: Decodable, Hashable { let result: String?; let rankLabel: String; let rank: String; let rec: String; let pf: String; let fed: String; let po: String?; let title: String?; let sched: [Sched] }
    struct Pick: Decodable, Hashable { let kind: String; let ab: String?; let crest: String? }
    struct PickYear: Decodable, Hashable { let year: Int; let cells: [[Pick]] }
    struct LeagueSeasons: Decodable { let seasons: [String]; let bySeason: [String: LeagueSeason]; let rounds: [Int]; let picks: [PickYear] }
    struct DraftRow: Decodable, Hashable { let pk: String; let player: String; let team: String; let pos: String; let via: String }
    struct Draft: Decodable, Hashable { let title: String; let sport: String?; let when: String; let rows: [DraftRow] }
    struct Move: Decodable, Hashable { let when: String; let sport: String; let kind: String; let player: String; let team: String; let pos: String; let detail: String }
    struct H2H: Decodable, Hashable, Identifiable { let id: String; let name: String; let crest: String?; let rec: String; let pct: String; let pf: String; let pa: String }
    let club: Club; let owner: String?; let season: String; let cup: Cup; let bio: String?; let trophies: [Trophy]; let leagues: [LeagueMeta]
    let thisWeek: [Week]; let calendar: Calendar; let seasons: [String: LeagueSeasons]; let drafts: [Draft]; let moves: [Move]; let h2h: [H2H]
}

struct RulesData: Decodable {
    struct Item: Decodable, Hashable, Identifiable {
        let id: String; let title: String; let kind: String; let status: String?; let date: String?; let text: String?
        let yes: Int?; let no: Int?; let abstain: Int?; let needed: Int?; let emergency: Bool
        let approvedBy: [String]; let opposedBy: [String]
    }
    let items: [Item]
}

struct RosterData: Decodable {
    struct TeamInfo: Decodable { let id: String; let name: String; let abbreviation: String; let logo: String?; let altLogo: String?; let primaryColor: String?; let ink: String? }
    struct SportCode: Decodable, Hashable { let sport: String; let code: String }
    struct WeekRef: Decodable, Hashable { let week: Int; let label: String }
    struct Game: Decodable, Hashable { let opp: String?; let home: Bool?; let epoch: Double?; let status: String? }
    struct Note: Decodable, Hashable { let text: String }
    struct Taxi: Decodable, Hashable { let status: String }
    struct Proj: Decodable, Hashable { let pts: Double }
    struct Player: Decodable, Hashable, Identifiable {
        let rosterId: String; let name: String; let pos: String; let team: String?; let slot: String; let locked: Bool?
        let injury: String?; let wkPoints: Double?; let proj: Proj?; let game: Game?; let oppText: String?; let news: Note?; let taxi: Taxi?
        var id: String { rosterId }
    }
    struct Matchup: Decodable { let me: Double?; let them: Double?; let opp: TeamInfo? }
    let readOnly: Bool?; let team: TeamInfo; let sports: [SportCode]; let sport: String
    let week: Int?; let curWeek: Int?; let weeks: [WeekRef]; let past: Bool?; let future: Bool?
    let slots: [String: Int]; let roster: [Player]; let matchup: Matchup?
}

struct LoginReply: Decodable {
    struct User: Codable { let id: String; let name: String?; let email: String? }
    struct League: Codable { let id: String; let name: String?; let team: TeamRef? }
    struct TeamRef: Codable { let id: String; let name: String? }
    let token: String; let user: User; let leagues: [League]?
}

extension Double {
    /// 1,039.8 · 7.6 · 33
    var n1: String { formatted(.number.precision(.fractionLength(0...1))) }
}

struct MovesData: Decodable {
    struct Move: Decodable, Hashable, Identifiable { let id: String; let when: String; let sport: String; let kind: String; let club: Club?; let player: String; let team: String; let pos: String; let bid: Double?; let from: String? }
    struct Asset: Decodable, Hashable { let name: String; let sport: String?; let team: String?; let pos: String? }
    struct Side: Decodable, Hashable { let club: Club?; let gets: [Asset] }
    struct Trade: Decodable, Hashable, Identifiable { let id: String; let when: String; let sides: [Side] }
    let season: String; let moves: [Move]; let trades: [Trade]
}

struct InjuriesData: Decodable {
    struct Row: Decodable, Hashable { let name: String; let sport: String; let team: String?; let pos: String; let status: String?; let note: String?; let club: Club? }
    struct Change: Decodable, Hashable { let name: String; let sport: String; let team: String?; let pos: String; let status: String; let prev: String?; let note: String?; let at: String; let club: Club? }
    let injured: [Row]; let changes: [Change]
}

/// Free agents and pending claims ride along with your own roster (/api/leagues/ysf/myclub).
struct FreeAgentsData: Decodable {
    struct FA: Decodable, Hashable, Identifiable {
        let playerId: String; let name: String; let pos: String; let team: String?; let gp: Double?; let points: Double?; let injury: String?; let pending: Bool?; let clears: String?
        var id: String { playerId }
    }
    struct ClaimPlayer: Decodable, Hashable { let id: String; let name: String; let sport: String?; let team: String? }
    struct Claim: Decodable, Hashable, Identifiable { let id: String; let bid: Double?; let add: ClaimPlayer?; let drop: ClaimPlayer? }
    struct Mine: Decodable, Hashable, Identifiable { let rosterId: String; let playerId: String; let name: String; let pos: String; let slot: String; var id: String { rosterId } }
    struct Other: Decodable, Hashable, Identifiable { let id: String; let name: String; let abbreviation: String; let logo: String?; let altLogo: String?; let primaryColor: String?; let ink: String? }
    let readOnly: Bool?; let sport: String; let code: String?; let faab: Double?; let freeAgents: [FA]; let claims: [Claim]; let roster: [Mine]; let team: RosterData.TeamInfo; let clubs: [Other]?
}

/// Your trades (/api/trades): proposed, received and settled.
struct MyTrade: Decodable, Identifiable {
    struct TeamRef: Decodable { let id: String; let name: String?; let abbreviation: String? }
    struct PlayerRef: Decodable { let name: String?; let sport: String?; let realTeamAbbr: String? }
    struct Item: Decodable { let playerId: String?; let pickId: String?; let fromTeamId: String?; let toTeamId: String?; let faabAmount: Double?; let faabSport: String?; let player: PlayerRef?; let fromTeam: TeamRef?; let toTeam: TeamRef? }
    let id: String; let status: String?; let createdAt: String?; let initiatorId: String; let recipientId: String?
    let items: [Item]; let initiatorTeam: TeamRef?; let recipientTeam: TeamRef?
}

// The Standings group: Cup Race, Playoffs, Power Rankings, Records, History (/api/mobile/ysf/…)
struct CupData: Decodable {
    struct Progress: Decodable, Hashable { let sport: String; let done: Int; let total: Int }
    struct Row: Decodable, Hashable { let rk: Int; let club: Club?; let pts: Double; let ranks: [String: Int?]?; let exp: Double; let cupPct: Double; let min: Double?; let max: Double?; let sd: Double?; let top3: Double?; let last: Double? }
    struct ModelRow: Decodable, Hashable { let club: Club?; let exp: Double; let sd: Double; let top3: Double; let win: Double; let titles: [String: Double] }
    struct Model: Decodable { let sims: Int; let generatedAt: String; let rows: [ModelRow] }
    let trials: Int; let updated: String?; let progress: [Progress]; let rows: [Row]; let model: Model?
}
struct PlayoffsData: Decodable {
    struct Side: Decodable, Hashable { let club: Club?; let seed: Int?; let score: Double?; let win: Bool }
    struct Game: Decodable, Hashable { let bye: Bool; let home: Side; let away: Side? }
    struct Round: Decodable, Hashable { let name: String; let period: Int?; let place: Bool; let games: [Game] }
    struct Seed: Decodable, Hashable { let seed: Int; let club: Club?; let rec: String; let gb: Double?; let po: Double; let title: Double? }
    let sport: String; let season: String; let seasons: [String]; let trophy: String; let trophyArt: String?; let champion: Club?; let status: String; let rounds: [Round]; let picture: [Seed]
}
struct PowerData: Decodable {
    struct Row: Decodable, Hashable {
        let rk: Int; let club: Club?
        let value: Double?; let byLeague: [String: Double]?                                         // this season
        let sport: String?; let season: String?; let live: Bool?; let rec: String?; let ppg: Double?; let fin: String?  // all-time
        let won: Double?; let projected: Double?; let thisSeason: Double?                           // dynasty
    }
    let tab: String; let year: Int?; let of: Int?; let rows: [Row]
}
struct RecordsData: Decodable {
    struct Item: Decodable, Hashable { let club: Club?; let text: String; let sub: String; let value: Double; let matchupId: String }
    struct List: Decodable, Hashable { let title: String; let rows: [Item] }
    struct AllTime: Decodable, Hashable { let club: Club?; let w: Int; let l: Int; let t: Int; let pct: Double; let pf: Double; let ppg: Double }
    let sport: String; let games: Int; let lists: [List]; let allTime: [AllTime]
}
struct HistoryData: Decodable {
    struct CurLeague: Decodable, Hashable { let sport: String; let label: String; let club: Club?; let rec: String? }
    struct Current: Decodable { let season: String; let leader: Club?; let leaderPts: Double; let leagues: [CurLeague] }
    struct PrevLeague: Decodable, Hashable { let sport: String; let trophy: String; let art: String?; let champion: Club?; let runnerUp: Club? }
    struct Previous: Decodable { let season: String; let inaugural: Bool; let fedChampion: Club?; let fedPts: Double?; let fedArt: String?; let leagues: [PrevLeague] }
    struct Title: Decodable, Hashable { let scope: String; let season: String; let name: String; let art: String? }
    struct Row: Decodable, Hashable { let id: String; let club: Club?; let w: Int; let l: Int; let pct: Double; let per: [String: String?]; let cup: Double; let titles: [Title] }
    struct Book: Decodable, Hashable { let k: String; let v: String }
    let current: Current; let previous: Previous; let allTime: [Row]; let book: [Book]
}
