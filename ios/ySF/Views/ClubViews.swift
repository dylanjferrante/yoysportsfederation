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
