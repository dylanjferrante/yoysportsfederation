import SwiftUI

/// A club's roster for one league and week (the site's My Club data): your own club, signed in, can
/// move players; any other club is view only.
struct RosterView: View {
    let teamId: String?
    let sport: String?
    @State private var chosenSport: String?
    @State private var week: Int?
    @State private var data: RosterData?
    @State private var error: String?
    @State private var moving: RosterData.Player?
    @State private var moveError: String?

    private static let reserve = ["BN", "IR", "TAXI"]
    private static let slotLabel = ["RB/WR/TE": "FLEX", "DEF": "D/ST"]

    var body: some View {
        VStack(spacing: 14) {
            if let d = data { content(d) }
            else if let error { Text(error).font(TF.semi()).foregroundStyle(T.faint).padding(24) }
            else { ProgressView().padding(30) }
        }
        .task(id: "\(chosenSport ?? sport ?? "")-\(week ?? 0)") { await load() }
        .confirmationDialog("Move \(moving?.name ?? "")", isPresented: Binding(get: { moving != nil }, set: { if !$0 { moving = nil } }), titleVisibility: .visible) {
            if let p = moving, let d = data {
                ForEach(targets(d, from: p.slot), id: \.self) { slot in
                    Button(slot == "BN" ? "Bench" : Self.slotLabel[slot] ?? slot) { Task { await move(p, to: slot, team: d.team.id) } }
                }
            }
        }
        .alert("Move not allowed", isPresented: Binding(get: { moveError != nil }, set: { if !$0 { moveError = nil } })) { Button("OK") {} } message: { Text(moveError ?? "") }
    }

    private func load() async {
        do { data = try await DataService.shared.roster(teamId: teamId, sport: chosenSport ?? sport, week: week); error = nil }
        catch APIError.http(401, _) { error = "Sign in to see your club" }
        catch { self.error = "Couldn’t load the roster" }
    }
    private func move(_ p: RosterData.Player, to slot: String, team: String) async {
        moving = nil
        do { try await DataService.shared.setSlot(teamId: team, rosterId: p.rosterId, slot: slot); await load() }
        catch { moveError = error.localizedDescription }
    }
    private func targets(_ d: RosterData, from slot: String) -> [String] {
        (starterKeys(d) + Self.reserve).filter { $0 != slot }
    }
    private func starterKeys(_ d: RosterData) -> [String] {
        let order = ["QB", "RB", "WR", "TE", "RB/WR/TE", "K", "DEF", "PG", "SG", "SF", "PF", "C", "LW", "RW", "D", "G", "1B", "2B", "3B", "SS", "OF", "UTIL", "SP", "RP"]
        return d.slots.keys.filter { !Self.reserve.contains($0) }.sorted { (order.firstIndex(of: $0) ?? 99) < (order.firstIndex(of: $1) ?? 99) }
    }

    @ViewBuilder private func content(_ d: RosterData) -> some View {
        let color = T.league[d.sport] ?? T.fg
        let editable = d.readOnly != true && d.past != true
        let wi = d.weeks.firstIndex { $0.week == d.week } ?? -1
        if sport == nil {
            Pills(items: d.sports.map { .init(id: $0.sport, label: $0.code, color: T.league[$0.sport]) }, value: Binding(get: { d.sport }, set: { chosenSport = $0; week = nil }))
        }
        HStack {
            weekButton("chevron.left", to: wi > 0 ? d.weeks[wi - 1].week : nil)
            Text((wi >= 0 ? d.weeks[wi].label : "") + (d.week == d.curWeek ? " · NOW" : "")).font(TF.display(14)).tracking(1).foregroundStyle(T.fg).frame(maxWidth: .infinity)
            weekButton("chevron.right", to: wi >= 0 && wi < d.weeks.count - 1 ? d.weeks[wi + 1].week : nil)
        }
        if let m = d.matchup, let opp = m.opp {
            HStack(spacing: 0) {
                matchSide(d.team, m.me, alignLeft: true)
                matchSide(opp, m.them, alignLeft: false)
            }
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
        let keys = starterKeys(d)
        let groups: [(String, [RosterData.Player])] = [
            ("STARTERS", d.roster.filter { !Self.reserve.contains($0.slot) }.sorted { (keys.firstIndex(of: $0.slot) ?? 99) < (keys.firstIndex(of: $1.slot) ?? 99) }),
            ("BENCH", d.roster.filter { $0.slot == "BN" }), ("INJURED RESERVE", d.roster.filter { $0.slot == "IR" }), ("TAXI SQUAD", d.roster.filter { $0.slot == "TAXI" }),
        ].filter { !$0.1.isEmpty }
        ForEach(groups, id: \.0) { label, rows in
            CardBox(accent: color) {
                HStack {
                    Text(label).font(TF.display(12)).tracking(1.5).foregroundStyle(T.fg) + Text("  \(rows.count)").font(TF.display(12)).foregroundStyle(T.muted)
                    Spacer()
                    Text(d.future == true ? "PROJ" : "FPTS").font(TF.display(11)).tracking(1).foregroundStyle(T.muted)
                }
                .padding(.horizontal, 12).padding(.vertical, 8).background(T.surface2)
                ForEach(rows) { p in
                    Button { moving = p } label: { playerRow(p, starter: label == "STARTERS", color: color, future: d.future == true) }
                        .buttonStyle(.plain).disabled(!editable || p.locked == true)
                }
            }
        }
    }

    private func weekButton(_ icon: String, to: Int?) -> some View {
        Button { week = to } label: {
            Image(systemName: icon).font(.system(size: 14, weight: .bold)).foregroundStyle(T.fg).frame(width: 36, height: 36).overlay(RoundedRectangle(cornerRadius: 6).stroke(T.line2))
        }
        .disabled(to == nil).opacity(to == nil ? 0.35 : 1)
    }
    private func matchSide(_ t: RosterData.TeamInfo, _ pts: Double?, alignLeft: Bool) -> some View {
        let ink = Color(hex: t.ink ?? "#FFFFFF")
        return HStack(spacing: 8) {
            if !alignLeft { Text(pts?.n1 ?? "–").font(TF.display(20)); Spacer() }
            if alignLeft { Crest(asset: Asset.from(t.altLogo ?? t.logo), size: 26); Text(t.abbreviation).font(TF.display(15)) }
            else { Text(t.abbreviation).font(TF.display(15)); Crest(asset: Asset.from(t.altLogo ?? t.logo), size: 26) }
            if alignLeft { Spacer(); Text(pts?.n1 ?? "–").font(TF.display(20)) }
        }
        .foregroundStyle(ink).padding(12).frame(maxWidth: .infinity).background(t.primaryColor.map { Color(hex: $0) } ?? .black)
    }
    private func playerRow(_ p: RosterData.Player, starter: Bool, color: Color, future: Bool) -> some View {
        HStack(spacing: 10) {
            Text(Self.slotLabel[p.slot] ?? p.slot).font(TF.display(11)).foregroundStyle(starter ? .white : T.fg)
                .frame(width: 46, height: 26).background(starter ? color : T.chip).clipShape(RoundedRectangle(cornerRadius: 3))
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(p.name).font(TF.bold(15)).foregroundStyle(T.fg).lineLimit(1)
                    if let inj = p.injury { Text(String(inj.prefix(3)).uppercased()).font(TF.display(10)).foregroundStyle(T.red) }
                    if let tx = p.taxi { Text(tx.status == "eligible" ? "TAXI OK" : "TAXI REVIEW").font(TF.display(10)).foregroundStyle(tx.status == "eligible" ? Color(hex: "#177245") : T.muted) }
                }
                Text(sub(p)).font(TF.body(12)).foregroundStyle(T.muted).lineLimit(1)
                if let n = p.news { Text(n.text).font(TF.body(12)).foregroundStyle(T.faint).lineLimit(1) }
            }
            Spacer(minLength: 4)
            Text((future ? p.proj?.pts : p.wkPoints)?.n1 ?? "–").font(TF.display(16)).foregroundStyle(T.fg)
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .contentShape(Rectangle())
        .overlay(alignment: .top) { T.line.frame(height: 1) }
    }
    private func sub(_ p: RosterData.Player) -> String {
        var s = "\(p.team ?? "FA") · \(p.pos)"
        if let g = p.game, let opp = g.opp { s += " · \(g.home == true ? "vs" : "@")\(opp)" }
        else if let o = p.oppText { s += " · \(o)" }
        return s
    }
}
