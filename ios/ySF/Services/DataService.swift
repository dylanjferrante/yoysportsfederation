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
    func setSlot(teamId: String, rosterId: String, slot: String) async throws {
        let _: EmptyReply = try await api.post("/api/teams/\(teamId)/roster", body: ["action": "SET_SLOT", "rosterId": rosterId, "slot": slot])
    }
}
struct EmptyReply: Decodable {}
