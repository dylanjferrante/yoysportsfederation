import SwiftUI

/// More: News, Clubs, Rules, the full site, and your account.
struct MoreTab: View {
    @Environment(AuthService.self) private var auth
    @State private var signingIn = false
    @State private var site: URL?
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                PageTitle(title: "MORE")
                CardBox {
                    NavigationLink(value: Route.news) { item("NEWS", "ySF News, by section") }
                    NavigationLink(value: Route.clubs) { item("CLUBS", "All twelve clubs") }
                    NavigationLink(value: Route.moves) { item("MOVES & TRADES", "Every add, drop, claim and trade") }
                    NavigationLink(value: Route.injuries) { item("INJURIES", "Hurt players on ySF rosters") }
                    NavigationLink(value: Route.rules) { item("RULES", "Resolutions, directives and notices") }
                    Button { site = URL(string: "\(APIClient.shared.baseURL)/leagues/ysf") } label: { item("FULL SITE", "Everything else on ySF") }
                }
                .buttonStyle(.plain)
                CardBox {
                    if auth.isLoggedIn {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(auth.userName ?? "").font(TF.semi()).foregroundStyle(T.fg)
                            Text(auth.userEmail ?? "").font(TF.body(13)).foregroundStyle(T.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                        Button { auth.logout() } label: { item("SIGN OUT", nil) }.buttonStyle(.plain)
                    } else {
                        Button { signingIn = true } label: { item("SIGN IN", "To see your club and set your lineup") }.buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(T.page)
        .sheet(isPresented: $signingIn) { LoginView() }
        .sheet(item: $site) { SafariView(url: $0).ignoresSafeArea() }
    }
    private func item(_ label: String, _ sub: String?) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(TF.display(16)).tracking(0.5).foregroundStyle(T.fg)
                if let sub { Text(sub).font(TF.body(13)).foregroundStyle(T.muted) }
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(T.faint)
        }
        .padding(14)
        .contentShape(Rectangle())
        .overlay(alignment: .top) { T.line.frame(height: 1) }
    }
}
