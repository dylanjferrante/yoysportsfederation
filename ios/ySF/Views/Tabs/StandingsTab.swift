import SwiftUI

/// Standings: the Federation Cup table and each league's (one value per column — W and L apart).
struct StandingsTab: View {
    @State private var tab = "CUP"
    var body: some View {
        Loader(load: { try await DataService.shared.standings() }) { d in
            ScrollView {
                VStack(spacing: 16) {
                    PageTitle(eyebrow: d.season.replacingOccurrences(of: "-", with: "–"), title: "STANDINGS")
                    Pills(items: [.init(id: "CUP", label: "FED CUP")] + d.leagues.map { .init(id: $0.sport, label: $0.code, color: Color(hex: $0.color)) }, value: $tab)
                    CardBox(accent: d.leagues.first { $0.sport == tab }.map { Color(hex: $0.color) } ?? T.fg) {
                        header
                        if tab == "CUP" {
                            ForEach(d.cup, id: \.club.id) { r in
                                row(r.rk, r.club) { cell("\(Int(r.pts))", 36, bold: true); cell("\(r.w)", 26); cell("\(r.l)", 26); cell(pct(r.cupPct), 52) }
                            }
                        } else {
                            ForEach(d.tables[tab] ?? [], id: \.club.id) { r in
                                row(r.rk, r.club) { cell("\(r.w)", 26); cell("\(r.l)", 26); cell(r.pf.n1, 64); cell(r.po > 0 ? pct(r.po) : "—", 46) }
                            }
                        }
                    }
                    CardBox {
                        link(.cup, "CUP RACE", "Who wins the Federation Cup — the 10,000-season model")
                        link(.playoffs, "PLAYOFFS", "Each league's bracket, this season and past")
                        link(.power, "POWER RANKINGS", "This season, all-time and the decade race")
                        link(.records, "RECORDS", "Highest scores, biggest wins, closest games")
                        link(.history, "HISTORY", "Champions, the all-time table and the records book")
                    }
                }
                .padding(16)
            }
        }
    }
    private func link(_ r: Route, _ label: String, _ sub: String) -> some View {
        NavigationLink(value: r) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(TF.display(16)).tracking(0.5).foregroundStyle(T.fg)
                    Text(sub).font(TF.body(13)).foregroundStyle(T.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(T.faint)
            }
            .padding(14).contentShape(Rectangle())
            .overlay(alignment: .top) { T.line.frame(height: 1) }
        }
        .buttonStyle(.plain)
    }
    private var header: some View {
        HStack(spacing: 6) {
            h("RK", 22, .leading); Text("CLUB").font(TF.display(10)).tracking(1).foregroundStyle(T.muted).frame(maxWidth: .infinity, alignment: .leading)
            if tab == "CUP" { h("PTS", 36); h("W", 26); h("L", 26); h("CUP %", 52) } else { h("W", 26); h("L", 26); h("PF", 64); h("P%", 46) }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .overlay(alignment: .bottom) { T.rule.frame(height: 2) }
    }
    private func h(_ s: String, _ w: CGFloat, _ a: Alignment = .trailing) -> some View { Text(s).font(TF.display(10)).tracking(1).foregroundStyle(T.muted).frame(width: w, alignment: a) }
    private func cell(_ s: String, _ w: CGFloat, bold: Bool = false) -> some View { Text(s).font(bold ? TF.display(17) : TF.semi(14)).foregroundStyle(T.fg).frame(width: w, alignment: .trailing) }
    private func row<C: View>(_ rk: Int, _ c: Club, @ViewBuilder cells: () -> C) -> some View {
        HStack(spacing: 6) {
            Text("\(rk)").font(TF.semi(14)).foregroundStyle(T.muted).frame(width: 22, alignment: .leading)
            NavigationLink(value: Route.club(c.id)) {
                HStack(spacing: 8) {
                    Crest(asset: Asset.from(c.crest), size: 24)
                    Text(c.name).font(TF.bold(14)).foregroundStyle(T.fg).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.leading, 8)
                .overlay(alignment: .leading) { (c.color.map { Color(hex: $0) } ?? T.fg).frame(width: 4) }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            cells()
        }
        .padding(.horizontal, 10).padding(.vertical, 9)
        .overlay(alignment: .bottom) { T.line.frame(height: 1) }
    }
    private func pct(_ x: Double) -> String { x >= 0.995 ? ">99%" : x < 0.001 ? "<0.1%" : String(format: x < 0.1 ? "%.1f%%" : "%.0f%%", x * 100) }
}
