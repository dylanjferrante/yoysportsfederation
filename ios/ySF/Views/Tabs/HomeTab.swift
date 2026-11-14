import SwiftUI

/// Home: this week's scoreboard, the top stories carousel and the latest headlines (the site's front page).
struct HomeTab: View {
    var body: some View {
        Loader(load: { try await DataService.shared.home() }) { d in HomeContent(d: d) }
    }
}

private struct HomeContent: View {
    let d: HomeData
    @State private var page = 0
    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Scoreboard(d: d)
                VStack(spacing: 18) {
                    NavigationLink(value: Route.news) { SectionHead(title: "TOP STORIES", action: "ALL NEWS") }.buttonStyle(.plain)
                    VStack(spacing: 10) {
                        TabView(selection: $page) {
                            ForEach(Array(d.topStories.enumerated()), id: \.element.id) { i, s in
                                NavigationLink(value: Route.story(s.id)) { TopStoryCard(s: s) }.buttonStyle(.plain).tag(i)
                            }
                        }
                        .tabViewStyle(.page(indexDisplayMode: .never))
                        .frame(height: 300)
                        HStack(spacing: 6) {
                            ForEach(d.topStories.indices, id: \.self) { i in
                                Capsule().fill(i == page ? T.fg : T.line2).frame(width: i == page ? 20 : 6, height: 6)
                            }
                        }
                    }
                    SectionHead(title: "HEADLINES")
                    VStack(spacing: 0) {
                        ForEach(d.headlines) { h in NavigationLink(value: Route.story(h.id)) { HeadlineRow(s: h) }.buttonStyle(.plain) }
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 30)
        }
        .background(T.page)
    }
}

struct TopStoryCard: View {
    let s: Story
    var body: some View {
        CardBox {
            StoryArt(tiles: s.tiles).frame(height: 170)
            VStack(alignment: .leading, spacing: 4) {
                Kicker(text: s.kicker)
                Text(s.headline).font(TF.display(22)).foregroundStyle(T.fg).lineLimit(2).multilineTextAlignment(.leading)
                Text(s.by).font(TF.body(12)).foregroundStyle(T.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
        }
    }
}

struct HeadlineRow: View {
    let s: Story
    var art: CGSize = CGSize(width: 60, height: 60)
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            StoryArt(tiles: s.tiles).frame(width: art.width, height: art.height).clipShape(RoundedRectangle(cornerRadius: 3))
            VStack(alignment: .leading, spacing: 2) {
                Kicker(text: s.kicker)
                Text(s.headline).font(TF.bold(15)).foregroundStyle(T.fg).multilineTextAlignment(.leading)
                Text(agoText(s.published)).font(TF.body(12)).foregroundStyle(T.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { T.line.frame(height: 1) }
    }
}

/// The black score strip: one cell per club pairing, every league's score.
private struct Scoreboard: View {
    let d: HomeData
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(d.week.live ? "● LIVE" : "SCORES").font(TF.display(11))
                    Text("WEEK \(d.week.num)").font(TF.display(10)).opacity(0.8)
                }
                .foregroundStyle(.white).padding(.horizontal, 12).frame(maxHeight: .infinity).background(d.week.live ? T.red : .black)
                ForEach(Array(d.scoreboard.enumerated()), id: \.offset) { _, p in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Color.clear.frame(width: 66, height: 1)
                            ForEach(p.lines, id: \.sport) { l in
                                Image("\(league(l.sport)?.key ?? "fl")_symbol_black").resizable().scaledToFit().frame(width: 11, height: 11).frame(width: 38, alignment: .trailing)
                            }
                        }
                        side(p.a, p.lines, a: true)
                        side(p.b, p.lines, a: false)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .overlay(alignment: .trailing) { Color(hex: "#222222").frame(width: 1) }
                }
            }
        }
        .frame(height: 64)
        .background(.black)
    }
    private func league(_ sp: String) -> LeagueMeta? { d.leagues.first { $0.sport == sp } }
    private func side(_ c: Club?, _ lines: [HomeData.Line], a: Bool) -> some View {
        HStack(spacing: 6) {
            Crest(asset: Asset.from(c?.crest), size: 18)
            Text(c?.abbr ?? "").font(TF.display(12)).foregroundStyle(.white).frame(width: 42, alignment: .leading)
            ForEach(lines, id: \.sport) { l in
                let v = a ? l.a : l.b, o = a ? l.b : l.a
                let win = v != nil && o != nil && v! > o!
                Text(v?.n1 ?? "–").font(TF.display(12)).foregroundStyle(win ? .white : Color(hex: "#C7C7C7")).frame(width: 38, alignment: .trailing)
            }
        }
    }
}
