import SwiftUI
import SafariServices

@main
struct ySFApp: App {
    @State private var auth = AuthService()

    init() {
        // black header with the ySF wordmark; tab bar on the page surface
        let nav = UINavigationBarAppearance()
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = .black
        nav.shadowColor = .clear
        nav.titleTextAttributes = [.foregroundColor: UIColor.white]
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav
        UINavigationBar.appearance().tintColor = .white
    }

    var body: some Scene {
        WindowGroup {
            TabView {
                // iOS 17 tab style (the official app's deployment target)
                Screen { HomeTab() }.tabItem { Label("Home", systemImage: "house") }
                Screen { ScoresTab() }.tabItem { Label("Scores", systemImage: "square.grid.2x2") }
                Screen { StandingsTab() }.tabItem { Label("Standings", systemImage: "chart.bar") }
                Screen { MyClubTab() }.tabItem { Label("My Club", systemImage: "shield") }
                Screen { MoreTab() }.tabItem { Label("More", systemImage: "ellipsis.circle") }
            }
            .tint(T.fg)
            .environment(auth)
        }
    }
}

/// Each tab: its own navigation stack under the black header with the wordmark.
struct Screen<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        NavigationStack {
            content
                .ysfHeader()
                .navigationDestination(for: Route.self) { $0.view.ysfHeader() }
        }
    }
}

extension View {
    /// the black header with the ySF wordmark, on every screen (tabs and pushed screens)
    func ysfHeader() -> some View {
        navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .principal) { Wordmark() } }
            .toolbarBackground(.black, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
    }
}

struct Wordmark: View {
    var body: some View { Image("ysf_wordmark_black").resizable().scaledToFit().frame(height: 20).accessibilityLabel("yoy Sports Federation") }
}

/// Every screen you can push to.
enum Route: Hashable {
    case story(String), news, clubs, club(String), rules
    @ViewBuilder var view: some View {
        switch self {
        case .story(let id): StoryView(id: id)
        case .news: NewsListView()
        case .clubs: ClubsView()
        case .club(let id): ClubDetailView(id: id)
        case .rules: RulesView()
        }
    }
}

/// Pages from the website (box scores, the full site) in Safari, inside the app.
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}
extension URL: @retroactive Identifiable { public var id: String { absoluteString } }
