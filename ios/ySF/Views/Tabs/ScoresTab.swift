import SwiftUI

/// Scores: every club pairing in a week, each league's score; a line opens that matchup's box score.
struct ScoresTab: View {
    @State private var week: Int? = nil
    @State private var data: ScoresData?
    @State private var open: URL?
    var body: some View {
        ScrollView {
            if let d = data {
                VStack(spacing: 16) {
                    HStack(alignment: .bottom) {
                        PageTitle(eyebrow: "SCORES", title: "WEEK \(d.week)")
                        HStack(spacing: 6) { arrow(d.prev, "chevron.left"); arrow(d.next, "chevron.right") }
                    }
                    ForEach(Array(d.pairings.enumerated()), id: \.offset) { _, p in
                        CardBox {
                            HStack(spacing: 0) { ClubTile(club: p.a); ClubTile(club: p.b) }
                            ForEach(p.lines, id: \.sport) { l in line(l, d) }
                        }
                    }
                }
                .padding(16)
            } else { ProgressView().padding(60) }
        }
        .background(T.page)
        .task(id: week) { data = try? await DataService.shared.scores(week: week) }
        .refreshable { data = try? await DataService.shared.scores(week: week) }
        .sheet(item: $open) { SafariView(url: $0).ignoresSafeArea() }
    }
    private func arrow(_ to: Int?, _ icon: String) -> some View {
        Button { week = to } label: {
            Image(systemName: icon).font(.system(size: 15, weight: .bold)).foregroundStyle(T.fg).frame(width: 40, height: 40)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(T.line2))
        }
        .disabled(to == nil).opacity(to == nil ? 0.35 : 1)
    }
    private func line(_ l: ScoresData.Line, _ d: ScoresData) -> some View {
        let lg = d.leagues.first { $0.sport == l.sport }
        let aw = (l.a ?? 0) > (l.b ?? 0) && l.a != nil && l.b != nil, bw = (l.b ?? 0) > (l.a ?? 0) && l.a != nil && l.b != nil
        return Button { open = URL(string: "\(APIClient.shared.baseURL)/leagues/ysf/matchup/\(l.matchupId)") } label: {
            HStack(spacing: 10) {
                if let lg { Image(lg.symbolAsset).resizable().scaledToFit().frame(width: 20, height: 20) }
                Text(l.a?.n1 ?? "–").font(TF.display(18)).foregroundStyle(aw ? T.fg : T.muted).frame(width: 80, alignment: .leading)
                VStack(spacing: 1) {
                    Text(l.status == "LIVE" ? "● LIVE" : l.status).font(TF.display(10)).tracking(1).foregroundStyle(l.status == "LIVE" ? T.red : T.muted)
                    Text("\(lg?.code ?? "") · \(l.label)").font(TF.body(12)).foregroundStyle(T.muted)
                }
                .frame(maxWidth: .infinity)
                Text(l.b?.n1 ?? "–").font(TF.display(18)).foregroundStyle(bw ? T.fg : T.muted).frame(width: 80, alignment: .trailing)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .overlay(alignment: .top) { T.line.frame(height: 1) }
        }
        .buttonStyle(.plain)
    }
}
