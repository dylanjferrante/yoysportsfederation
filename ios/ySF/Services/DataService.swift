import Foundation

/// Reads for each screen (the server's /api/mobile/ysf/* routes, built from the same code as the site).
final class DataService: @unchecked Sendable {
    static let shared = DataService()
    private let api = APIClient.shared

    func home() async throws -> HomeData { try await api.get("/api/mobile/ysf/home") }
    func scores(week: Int? = nil) async throws -> ScoresData { try await api.get("/api/mobile/ysf/scores" + (week.map { "?week=\($0)" } ?? "")) }
    func standings() async throws -> StandingsData { try await api.get("/api/mobile/ysf/standings") }
    func news(section: String?) async throws -> NewsData { try await api.get("/api/mobile/ysf/news" + (section.map { "?s=\($0)" } ?? "")) }
    func story(_ id: String) async throws -> Story { try await api.get("/api/mobile/ysf/news/\(id)") }
    func clubs() async throws -> ClubsData { try await api.get("/api/mobile/ysf/clubs") }
    func club(_ id: String) async throws -> ClubData { try await api.get("/api/mobile/ysf/club/\(id)") }
    func rules() async throws -> RulesData { try await api.get("/api/mobile/ysf/rules") }
    /// A roster for one league and week: your club (signed in) or any club view-only (teamId).
    func roster(teamId: String?, sport: String?, week: Int?) async throws -> RosterData {
        var q: [String] = []
        if let teamId { q.append("team=\(teamId)") }
        if let sport { q.append("sport=\(sport)") }
        if let week { q.append("week=\(week)") }
        return try await api.get("/api/leagues/ysf/myclub" + (q.isEmpty ? "" : "?" + q.joined(separator: "&")))
    }
    func moves(season: String? = nil) async throws -> MovesData { try await api.get("/api/mobile/ysf/moves" + (season.map { "?season=\($0)" } ?? "")) }
    func cup() async throws -> CupData { try await api.get("/api/mobile/ysf/cup") }
    func playoffs(sport: String, season: String?) async throws -> PlayoffsData { try await api.get("/api/mobile/ysf/playoffs?sport=\(sport)" + (season.map { "&season=\($0)" } ?? "")) }
    func power(tab: String, sport: String?) async throws -> PowerData { try await api.get("/api/mobile/ysf/power?tab=\(tab)" + (sport.map { "&sport=\($0)" } ?? "")) }
    func records(sport: String) async throws -> RecordsData { try await api.get("/api/mobile/ysf/records?sport=\(sport)") }
    func history() async throws -> HistoryData { try await api.get("/api/mobile/ysf/history") }
    func injuries() async throws -> InjuriesData { try await api.get("/api/mobile/ysf/injuries") }
    func freeAgents(sport: String?, team: String? = nil) async throws -> FreeAgentsData {
        var q: [String] = []; if let sport { q.append("sport=\(sport)") }; if let team { q.append("team=\(team)") }
        return try await api.get("/api/leagues/ysf/myclub" + (q.isEmpty ? "" : "?" + q.joined(separator: "&")))
    }
    func myTrades() async throws -> [MyTrade] { try await api.get("/api/trades") }
    /// a free agent straight onto your roster (optionally dropping someone)
    func add(teamId: String, playerId: String, dropRosterId: String?) async throws {
        var b: [String: Any] = ["action": "ADD", "playerId": playerId]; if let dropRosterId { b["dropRosterId"] = dropRosterId }
        let _: EmptyReply = try await api.post("/api/teams/\(teamId)/roster", body: b)
    }
    /// a waiver claim with a FAAB bid, settled at the next waiver run
    func claim(playerId: String, dropPlayerId: String?, bid: Int) async throws {
        var b: [String: Any] = ["action": "SUBMIT", "addPlayerId": playerId, "bidAmount": bid]; if let dropPlayerId { b["dropPlayerId"] = dropPlayerId }
        let _: EmptyReply = try await api.post("/api/leagues/ysf/waivers", body: b)
    }
    func cancelClaim(_ id: String) async throws { let _: EmptyReply = try await api.post("/api/leagues/ysf/waivers", body: ["action": "CANCEL", "claimId": id]) }
    /// accept, reject or cancel a trade
    func tradeAction(_ id: String, _ action: String) async throws { let _: EmptyReply = try await api.send("PATCH", "/api/trades/\(id)", body: ["action": action]) }
    func proposeTrade(to recipient: String, give: [String], get: [String], myTeam: String) async throws {
        let items: [[String: Any]] = give.map { ["direction": "GIVING", "playerId": $0, "fromTeamId": myTeam, "toTeamId": recipient] } + get.map { ["direction": "RECEIVING", "playerId": $0, "fromTeamId": recipient, "toTeamId": myTeam] }
        let _: EmptyReply = try await api.post("/api/trades", body: ["recipientTeamId": recipient, "leagueId": "ysf", "items": items])
    }
    func setSlot(teamId: String, rosterId: String, slot: String) async throws {
        let _: EmptyReply = try await api.post("/api/teams/\(teamId)/roster", body: ["action": "SET_SLOT", "rosterId": rosterId, "slot": slot])
    }
}
struct EmptyReply: Decodable {}
