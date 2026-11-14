import Foundation

/// The ySF server (the redesign). Override for the simulator with the YSF_API_URL environment variable.
final class APIClient: @unchecked Sendable {
    static let shared = APIClient()
    let baseURL: String = (ProcessInfo.processInfo.environment["YSF_API_URL"] ?? "https://yoysportsfederation-production.up.railway.app")
        .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    /// Sign-in token (Bearer), kept in the keychain by AuthService.
    var authToken: String?

    private let decoder = JSONDecoder()

    func get<T: Decodable>(_ path: String) async throws -> T {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        addAuth(&request)
        let (data, response) = try await URLSession.shared.data(for: request)
        try check(response, data)
        return try decoder.decode(T.self, from: data)
    }

    func post<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        addAuth(&request)
        let (data, response) = try await URLSession.shared.data(for: request)
        try check(response, data)
        return try decoder.decode(T.self, from: data)
    }

    private func addAuth(_ r: inout URLRequest) {
        if let authToken { r.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization") }
    }
    private func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError.http(http.statusCode, msg)
        }
    }
}

enum APIError: LocalizedError {
    case http(Int, String?)
    var errorDescription: String? {
        switch self { case .http(let code, let msg): msg ?? "Request failed (\(code))" }
    }
}
