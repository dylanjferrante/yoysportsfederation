import SwiftUI

/// All twelve clubs, in Cup order: club-colored tiles.
struct ClubsView: View {
    var body: some View {
        Loader(load: { try await DataService.shared.clubs() }) { d in
            ScrollView {
                VStack(spacing: 14) {
                    PageTitle(title: "CLUBS")
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(d.clubs) { c in
                            NavigationLink(value: Route.club(c.id)) {
                                VStack(alignment: .leading, spacing: 8) {
                                    Crest(asset: Asset.from(c.crestOnColor ?? c.crest), size: 52)
                                    Text(c.name).font(TF.display(17)).lineLimit(2).multilineTextAlignment(.leading)
                                    Text("CUP \(c.cupRank) · \(Int(c.cupPts)) PTS · \(c.rec)").font(TF.displaySemi(12)).opacity(0.9)
                                }
                                .foregroundStyle(Color(hex: c.ink))
                                .frame(maxWidth: .infinity, minHeight: 140, alignment: .topLeading)
                                .padding(12)
                                .background(c.color.map { Color(hex: $0) } ?? .black)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(16)
            }
        }
    }
}

/// A club: its band (crest, Cup standing, trophies), bio, and each league's roster (view only).
struct ClubDetailView: View {
    let id: String
    @State private var sport = "NFL"
    var body: some View {
        Loader(load: { try await DataService.shared.club(id) }) { d in
            ScrollView {
                VStack(spacing: 16) {
                    band(d)
                    if let bio = d.bio {
                        CardBox(accent: d.club.color.map { Color(hex: $0) }) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("ABOUT THE CLUB").font(TF.display(12)).tracking(1.5).foregroundStyle(T.fg)
                                Text(bio).font(TF.body(16)).lineSpacing(4).foregroundStyle(T.fg2)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                        }
                    }
                    SectionHead(title: "ROSTERS")
                    Pills(items: d.leagues.map { .init(id: $0.sport, label: $0.code, color: Color(hex: $0.color)) }, value: $sport)
                    RosterView(teamId: id, sport: sport).id(sport)
                }
                .padding(16)
            }
        }
    }
    private func band(_ d: ClubData) -> some View {
        let ink = Color(hex: d.club.ink)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Crest(asset: Asset.from(d.club.crestOnColor ?? d.club.crest), size: 72)
                Text(d.club.name.uppercased()).font(TF.display(26)).foregroundStyle(ink)
            }
            HStack(spacing: 8) {
                ForEach([("CUP RANK", ordinal(d.cup.rk)), ("CUP PTS", "\(Int(d.cup.pts))"), ("RECORD", d.cup.rec), ("TITLES", "\(d.trophies.count)")], id: \.0) { k, v in
                    VStack(spacing: 0) { Text(k).font(TF.display(9)).tracking(1); Text(v).font(TF.display(18)) }
                        .foregroundStyle(.black).frame(maxWidth: .infinity).padding(.vertical, 6).background(.white).clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }
            ForEach(d.trophies, id: \.self) { t in Text("★ \(t.name) champion").font(TF.semi(14)).foregroundStyle(ink) }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(d.club.color.map { Color(hex: $0) } ?? .black)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }
    private func ordinal(_ n: Int) -> String {
        let s = (n % 100 >= 11 && n % 100 <= 13) ? "th" : ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][n % 10]
        return "\(n)\(s)"
    }
}

/// The official rules record: resolutions (with the vote), directives and notices, newest first.
struct RulesView: View {
    var body: some View {
        Loader(load: { try await DataService.shared.rules() }) { d in
            ScrollView {
                VStack(spacing: 14) {
                    PageTitle(eyebrow: "LEAGUE OFFICE", title: "RULES")
                    ForEach(d.items) { x in
                        CardBox {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(spacing: 6) {
                                    if x.emergency { badge("EMERGENCY", nil) }
                                    badge(status(x).0, status(x).1)
                                }
                                Text(x.title).font(TF.display(18)).foregroundStyle(T.fg)
                                if let t = x.text { Text(t).font(TF.body(15)).foregroundStyle(T.fg2).lineLimit(6) }
                                if x.kind == "resolution", let y = x.yes {
                                    Text("\(y) yes · \(x.no ?? 0) no\(x.abstain.map { $0 > 0 ? " · \($0) abstain" : "" } ?? "")\(x.needed.map { " · \($0) needed" } ?? "")").font(TF.semi(14)).foregroundStyle(T.fg)
                                }
                                if !x.approvedBy.isEmpty {
                                    Text("Yes: \(x.approvedBy.joined(separator: ", "))\(x.opposedBy.isEmpty ? "" : "   No: \(x.opposedBy.joined(separator: ", "))")").font(TF.body(13)).foregroundStyle(T.muted)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                        }
                    }
                }
                .padding(16)
            }
        }
    }
    private func status(_ x: RulesData.Item) -> (String, Color) {
        if x.kind != "resolution" { return ("ISSUED", .black) }
        switch x.status { case "passed": return ("PASSED", Color(hex: "#177245")); case "failed": return ("FAILED", T.red); case "open": return ("OPEN", Color(hex: "#6da7ee")); default: return ("—", T.faint) }
    }
    @ViewBuilder private func badge(_ s: String, _ bg: Color?) -> some View {
        if let bg { Text(s).font(TF.display(10)).foregroundStyle(.white).padding(.horizontal, 6).padding(.vertical, 2).background(bg) }
        else { Text(s).font(TF.display(10)).foregroundStyle(T.fg).padding(.horizontal, 6).padding(.vertical, 2).overlay(Rectangle().stroke(T.fg)) }
    }
}
