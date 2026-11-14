import SwiftUI

/// ySF News by section.
struct NewsListView: View {
    @State private var section = ""
    @State private var data: NewsData?
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                PageTitle(title: "ySF NEWS")
                if let d = data {
                    Pills(items: [.init(id: "", label: "TOP STORIES")] + d.sections.map { .init(id: $0.id, label: $0.label, color: $0.color == "#000" ? nil : Color(hex: $0.color)) }, value: $section)
                    VStack(spacing: 0) {
                        ForEach(d.stories) { s in NavigationLink(value: Route.story(s.id)) { HeadlineRow(s: s, art: CGSize(width: 96, height: 60)) }.buttonStyle(.plain) }
                    }
                } else { ProgressView().padding(40) }
            }
            .padding(16)
        }
        .background(T.page)
        .task(id: section) { data = try? await DataService.shared.news(section: section.isEmpty ? nil : section) }
    }
}

/// One story.
struct StoryView: View {
    let id: String
    var body: some View {
        Loader(load: { try await DataService.shared.story(id) }) { s in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Kicker(text: s.kicker)
                    Text(s.headline).font(TF.display(30)).foregroundStyle(T.fg)
                    Text(s.dek).font(TF.body(18)).foregroundStyle(T.fg2)
                    Text("\(s.by) · \(agoText(s.published))").font(TF.body(12)).foregroundStyle(T.muted)
                    StoryArt(tiles: s.tiles).aspectRatio(16 / 9, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 4))
                    ForEach(Array((s.body ?? []).enumerated()), id: \.offset) { _, p in
                        Text(p).font(TF.body(17)).lineSpacing(5).foregroundStyle(T.fg2)
                    }
                }
                .padding(16)
            }
        }
    }
}
