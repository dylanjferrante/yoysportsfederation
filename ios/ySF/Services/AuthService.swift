import Foundation
import Security
import Observation

/// Sign-in with a ySF account (POST /api/mobile/login). The token lives in the keychain; public
/// screens work signed out, My Club and lineup moves need it.
@MainActor
@Observable
final class AuthService {
    private(set) var token: String?
    private(set) var userName: String?
    private(set) var userEmail: String?
    private(set) var clubId: String?
    var isLoggedIn: Bool { token != nil }

    init() {
        token = Keychain.get("ysf_token")
        if let d = UserDefaults.standard.data(forKey: "ysf_user"), let u = try? JSONDecoder().decode(Saved.self, from: d) {
            userName = u.name; userEmail = u.email; clubId = u.clubId
        }
        APIClient.shared.authToken = token
    }

    func login(email: String, password: String) async throws {
        let r: LoginReply = try await APIClient.shared.post("/api/mobile/login", body: ["email": email, "password": password])
        token = r.token; userName = r.user.name; userEmail = r.user.email
        clubId = (r.leagues?.first { $0.id == "ysf" } ?? r.leagues?.first)?.team?.id
        Keychain.set("ysf_token", r.token)
        APIClient.shared.authToken = r.token
        UserDefaults.standard.set(try? JSONEncoder().encode(Saved(name: userName, email: userEmail, clubId: clubId)), forKey: "ysf_user")
    }

    func logout() {
        token = nil; userName = nil; userEmail = nil; clubId = nil
        Keychain.delete("ysf_token"); UserDefaults.standard.removeObject(forKey: "ysf_user")
        APIClient.shared.authToken = nil
    }

    private struct Saved: Codable { let name: String?; let email: String?; let clubId: String? }
}

enum Keychain {
    static func set(_ key: String, _ value: String) {
        delete(key)
        SecItemAdd([kSecClass: kSecClassGenericPassword, kSecAttrAccount: key, kSecValueData: Data(value.utf8)] as CFDictionary, nil)
    }
    static func get(_ key: String) -> String? {
        var out: AnyObject?
        guard SecItemCopyMatching([kSecClass: kSecClassGenericPassword, kSecAttrAccount: key, kSecReturnData: true] as CFDictionary, &out) == errSecSuccess,
              let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    static func delete(_ key: String) { SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrAccount: key] as CFDictionary) }
}
