import SwiftUI

/// A logo from the asset catalog (bundled like the official app — iOS can't draw web SVGs).
struct Crest: View {
    let asset: String?
    var size: CGFloat = 28
    var body: some View {
        Group {
            if let asset, UIImage(named: asset) != nil { Image(asset).resizable().scaledToFit() } else { Color.clear }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// The club tile: the club's primary color, the crest made for it, the club's text color.
struct ClubTile: View {
    let club: Club?
    var label: String? = nil
    var full = false
    var body: some View {
        HStack(spacing: 10) {
            Crest(asset: Asset.from(club?.crestOnColor ?? club?.crest))
            (Text(club.map { full ? $0.name : $0.abbr } ?? "TBD").font(TF.display(full ? 15 : 19))
             + Text(label.map { "  \($0)" } ?? "").font(TF.display(11)))
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .foregroundStyle(club.map { Color(hex: $0.ink) } ?? T.fg)
        .padding(.horizontal, 12)
        .frame(height: 46)
        .background(club?.color.map { Color(hex: $0) } ?? T.chip)
    }
}

/// The story picture: one club's crest on its color; two split on the diagonal (each crest centered
/// in its triangle); three or more side by side.
struct StoryArt: View {
    let tiles: [Tile]
    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height, ts = tiles.isEmpty ? [Tile(bg: "#000000", img: nil)] : tiles
            if ts.count == 2 {
                ZStack(alignment: .topLeading) {
                    Color(hex: ts[1].bg)
                    Path { p in p.move(to: .zero); p.addLine(to: CGPoint(x: w, y: 0)); p.addLine(to: CGPoint(x: 0, y: h)); p.closeSubpath() }.fill(Color(hex: ts[0].bg))
                    Path { p in p.move(to: CGPoint(x: w, y: 0)); p.addLine(to: CGPoint(x: 0, y: h)) }.stroke(.white, lineWidth: 2)
                    Crest(asset: Asset.from(ts[0].img), size: min(w * 0.3, h * 0.42)).position(x: w / 3, y: h / 3)
                    Crest(asset: Asset.from(ts[1].img), size: min(w * 0.3, h * 0.42)).position(x: w * 2 / 3, y: h * 2 / 3)
                }
            } else if ts.count > 2 {
                HStack(spacing: 2) {
                    ForEach(Array(ts.prefix(4).enumerated()), id: \.offset) { _, t in
                        ZStack { Color(hex: t.bg); Crest(asset: Asset.from(t.img), size: min(w / CGFloat(min(ts.count, 4)) * 0.7, h * 0.55)) }
                    }
                }.background(.white)
            } else {
                ZStack { Color(hex: ts[0].bg); Crest(asset: Asset.from(ts[0].img), size: min(w * 0.45, h * 0.62)) }
            }
        }
        .clipped()
    }
}

struct Kicker: View {
    let text: String
    var body: some View { Text(text).font(TF.display(11)).tracking(1.5).foregroundStyle(T.red) }
}

/// "TOP STORIES ——" header: display caps over a 2pt rule, optional action on the right.
struct SectionHead: View {
    let title: String
    var action: String? = nil
    var onAction: (() -> Void)? = nil
    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Text(title).font(TF.display(14)).tracking(2).foregroundStyle(T.fg)
                Spacer()
                if let action { Button { onAction?() } label: { Text("\(action) →").font(TF.display(12)).tracking(1.5).foregroundStyle(T.muted) } }
            }
            Rectangle().fill(T.rule).frame(height: 2)
        }
    }
}

struct PageTitle: View {
    var eyebrow: String? = nil
    let title: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let eyebrow { Text(eyebrow).font(TF.display(12)).tracking(2).foregroundStyle(T.muted) }
            Text(title).font(TF.display(40)).foregroundStyle(T.fg)
            Rectangle().fill(T.rule).frame(height: 2).padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A row of pills (leagues, sections); the selected one takes its color.
struct Pills: View {
    struct Item: Hashable { let id: String; let label: String; var color: Color? = nil }
    let items: [Item]
    @Binding var value: String
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items, id: \.self) { i in
                    let on = i.id == value
                    Button { value = i.id } label: {
                        Text(i.label).font(TF.display(12)).tracking(1)
                            .foregroundStyle(on ? (i.color != nil ? .white : T.onAccent) : T.fg)
                            .padding(.horizontal, 12).frame(height: 34)
                            .background(on ? (i.color ?? T.accent) : T.surface)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(on ? (i.color ?? T.accent) : T.line2, lineWidth: 1))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }
}

struct CardBox<Content: View>: View {
    var accent: Color? = nil
    @ViewBuilder let content: Content
    var body: some View {
        VStack(spacing: 0) {
            if let accent { accent.frame(height: 4) }
            content
        }
        .background(T.surface)
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(T.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

/// Loads data for a screen, with pull to refresh and a spinner.
struct Loader<D, Content: View>: View {
    let load: () async throws -> D
    @ViewBuilder let content: (D) -> Content
    @State private var data: D?
    @State private var failed = false
    var body: some View {
        Group {
            if let data { content(data) }
            else if failed { Text("Couldn’t load. Pull to try again.").font(TF.semi()).foregroundStyle(T.faint).frame(maxWidth: .infinity, maxHeight: .infinity) }
            else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
        }
        .background(T.page)
        .task { await refresh() }
        .refreshable { await refresh() }
    }
    private func refresh() async {
        do { data = try await load(); failed = false } catch { if data == nil { failed = true } }
    }
}

/// "3h ago" · "Nov 12, 2026"
func agoText(_ iso: String) -> String {
    let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let d = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return "" }
    let m = max(1, Int(Date().timeIntervalSince(d) / 60))
    if m < 60 { return "\(m)m ago" }
    if m < 1440 { return "\(m / 60)h ago" }
    return d.formatted(.dateTime.month(.abbreviated).day().year())
}
