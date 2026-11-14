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
    let club: Club; let cup: Cup; let bio: String?; let trophies: [Trophy]; let leagues: [LeagueMeta]
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
