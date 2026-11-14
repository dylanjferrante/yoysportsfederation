import SwiftUI

// The site's Players group in the app: the league's moves and trades, injuries, and (in My Club)
// free agents with add / claim, your trades, and your pending claims.

private func sportLabel(_ sport: String) -> String { ["NFL": "ySFFL", "NHL": "ySFHL", "NBA": "ySFBA", "MLB": "ySFLB"][sport] ?? sport }

private func shortDate(_ s: String) -> String {
    let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = DateFormatter(); plain.dateFormat = "yyyy-MM-dd HH:mm:ss"; plain.timeZone = TimeZone(identifier: "UTC")
    let local = DateFormatter(); local.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    guard let d = iso.date(from: s) ?? ISO8601DateFormatter().date(from: s) ?? plain.date(from: s) ?? local.date(from: s) else { return String(s.prefix(10)) }
    return d.formatted(.dateTime.month(.abbreviated).day())
}

/// A small sport chip in the league's color.
private struct SportChip: View {
    let sport: String
    var body: some View {
        Text(sportLabel(sport)).font(TF.display(10)).foregroundStyle(.white)
            .padding(.horizontal, 5).frame(height: 18).background(T.league[sport] ?? .black).clipShape(RoundedRectangle(cornerRadius: 2))
    }
}

// MARK: Moves & Trades

struct MovesView: View {
    @State private var data: MovesData?
    @State private var tab = "MOVES"
    @State private var sport = "ALL"
    @State private var failed = false
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                PageTitle(eyebrow: data.map { "\($0.season) SEASON" }, title: "MOVES & TRADES")
                Pills(items: [.init(id: "MOVES", label: "MOVES"), .init(id: "TRADES", label: "TRADES")], value: $tab)
                Pills(items: [.init(id: "ALL", label: "ALL")] + ["NFL", "NHL", "NBA", "MLB"].map { .init(id: $0, label: sportLabel($0), color: T.league[$0]) }, value: $sport)
                if let d = data {
                    if tab == "MOVES" { moves(d) } else { trades(d) }
                } else if failed { Text("Couldn’t load moves").font(TF.semi()).foregroundStyle(T.faint).padding(24) }
                else { ProgressView().padding(30) }
            }
            .padding(16)
        }
        .background(T.page)
        .task { do { data = try await DataService.shared.moves() } catch { failed = true } }
        .refreshable { data = try? await DataService.shared.moves() }
    }
    @ViewBuilder private func moves(_ d: MovesData) -> some View {
        let rows = d.moves.filter { sport == "ALL" || $0.sport == sport }
        CardBox {
            if rows.isEmpty { Text("No moves yet").font(TF.body(14)).foregroundStyle(T.muted).padding(16) }
            ForEach(rows.prefix(200)) { m in
                HStack(spacing: 10) {
                    Crest(asset: Asset.from(m.club?.crest), size: 26)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(kindLabel(m.kind)).font(TF.display(10)).foregroundStyle(.white).padding(.horizontal, 5).frame(height: 18).background(kindColor(m.kind)).clipShape(RoundedRectangle(cornerRadius: 2))
                            SportChip(sport: m.sport)
                            Text(m.club?.abbr ?? "").font(TF.display(12)).foregroundStyle(T.fg)
                        }
                        Text(m.player).font(TF.bold(15)).foregroundStyle(T.fg).lineLimit(2)
                        Text([m.team, m.pos, m.bid.map { "$\(Int($0)) bid" }, m.from.map { "from \($0)" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).font(TF.body(12)).foregroundStyle(T.muted)
                    }
                    Spacer(minLength: 4)
                    Text(shortDate(m.when)).font(TF.body(12)).foregroundStyle(T.faint)
                }
                .padding(.horizontal, 12).padding(.vertical, 9)
                .overlay(alignment: .top) { T.line.frame(height: 1) }
            }
        }
    }
    @ViewBuilder private func trades(_ d: MovesData) -> some View {
        let rows = d.trades.filter { t in sport == "ALL" || t.sides.contains { $0.gets.contains { $0.sport == sport } } }
        if rows.isEmpty { Text("No trades yet").font(TF.body(14)).foregroundStyle(T.muted).padding(16) }
        ForEach(rows) { t in
            CardBox {
                Text(shortDate(t.when).uppercased()).font(TF.display(11)).tracking(1).foregroundStyle(T.muted).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.vertical, 8).background(T.surface2)
                ForEach(Array(t.sides.enumerated()), id: \.offset) { _, side in
                    ClubTile(club: side.club, label: "GETS")
                    ForEach(Array(side.gets.enumerated()), id: \.offset) { _, a in
                        HStack(spacing: 8) {
                            if let sp = a.sport { SportChip(sport: sp) }
                            Text(a.name).font(TF.semi(14)).foregroundStyle(T.fg).lineLimit(2)
                            Spacer()
                            Text([a.team, a.pos].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).font(TF.body(12)).foregroundStyle(T.muted)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .overlay(alignment: .top) { T.line.frame(height: 1) }
                    }
                }
            }
        }
    }
    private func kindLabel(_ k: String) -> String { k }
    private func kindColor(_ k: String) -> Color { k == "RELEASED" ? T.red : k == "TRADED" ? .black : k == "CLAIMED" ? Color(hex: "#2F5D8A") : Color(hex: "#177245") }
}

// MARK: Injuries

struct InjuriesView: View {
    @State private var data: InjuriesData?
    @State private var tab = "HURT"
    @State private var sport = "ALL"
    @State private var failed = false
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                PageTitle(title: "INJURIES")
                Pills(items: [.init(id: "HURT", label: "ON ROSTERS"), .init(id: "CHANGES", label: "LAST 2 WEEKS")], value: $tab)
                Pills(items: [.init(id: "ALL", label: "ALL")] + ["NFL", "NHL", "NBA", "MLB"].map { .init(id: $0, label: sportLabel($0), color: T.league[$0]) }, value: $sport)
                if let d = data {
                    CardBox {
                        if tab == "HURT" {
                            let rows = d.injured.filter { sport == "ALL" || $0.sport == sport }.sorted { ($0.club?.abbr ?? "") < ($1.club?.abbr ?? "") }
                            if rows.isEmpty { empty }
                            ForEach(Array(rows.enumerated()), id: \.offset) { _, r in row(r.club, r.sport, r.name, "\(r.team ?? "FA") · \(r.pos)", r.status ?? "", r.note, nil) }
                        } else {
                            let rows = d.changes.filter { sport == "ALL" || $0.sport == sport }
                            if rows.isEmpty { empty }
                            ForEach(Array(rows.enumerated()), id: \.offset) { _, r in row(r.club, r.sport, r.name, "\(r.team ?? "FA") · \(r.pos)", r.status, r.note, (r.prev.map { "was \($0) · " } ?? "") + shortDate(r.at)) }
                        }
                    }
                } else if failed { Text("Couldn’t load injuries").font(TF.semi()).foregroundStyle(T.faint).padding(24) }
                else { ProgressView().padding(30) }
            }
            .padding(16)
        }
        .background(T.page)
        .task { do { data = try await DataService.shared.injuries() } catch { failed = true } }
        .refreshable { data = try? await DataService.shared.injuries() }
    }
    private var empty: some View { Text("Nobody on this list").font(TF.body(14)).foregroundStyle(T.muted).padding(16) }
    private func row(_ club: Club?, _ sport: String, _ name: String, _ sub: String, _ status: String, _ note: String?, _ extra: String?) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Crest(asset: Asset.from(club?.crest), size: 26)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) { SportChip(sport: sport); Text(club?.abbr ?? "").font(TF.display(12)).foregroundStyle(T.fg) }
                Text(name).font(TF.bold(15)).foregroundStyle(T.fg).lineLimit(1)
                Text(sub).font(TF.body(12)).foregroundStyle(T.muted)
                if let note, note.count > 3 { Text(note).font(TF.body(12)).foregroundStyle(T.faint).lineLimit(2) }
                if let extra { Text(extra).font(TF.body(12)).foregroundStyle(T.faint) }
            }
            Spacer(minLength: 4)
            Text(status.uppercased()).font(TF.display(11)).foregroundStyle(["active", "healthy"].contains(status.lowercased()) ? Color(hex: "#177245") : T.red).multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .overlay(alignment: .top) { T.line.frame(height: 1) }
    }
}

// MARK: My Club — Add/Drop

struct AddDropView: View {
    @State private var sport: String?
    @State private var data: FreeAgentsData?
    @State private var error: String?
    @State private var query = ""
    @State private var picked: FreeAgentsData.FA?
    @State private var toast: String?
    var body: some View {
        VStack(spacing: 14) {
            if let d = data {
                Pills(items: ["NFL", "NHL", "NBA", "MLB"].map { .init(id: $0, label: sportLabel($0), color: T.league[$0]) }, value: Binding(get: { d.sport }, set: { sport = $0 }))
                HStack {
                    Text("FAAB").font(TF.display(12)).tracking(1).foregroundStyle(T.muted)
                    Text("$\(Int(d.faab ?? 0))").font(TF.display(16)).foregroundStyle(T.fg)
                    Spacer()
                    Text("\(d.roster.count) ON ROSTER").font(TF.display(12)).tracking(1).foregroundStyle(T.muted)
                }
                if !d.claims.isEmpty { ClaimsList(claims: d.claims) { await load() } }
                TextField("Search free agents", text: $query).font(TF.body(15)).padding(10).background(T.surface).overlay(RoundedRectangle(cornerRadius: 6).stroke(T.line2))
                let rows = d.freeAgents.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || ($0.team ?? "").localizedCaseInsensitiveContains(query) || $0.pos.localizedCaseInsensitiveContains(query) }
                CardBox(accent: T.league[d.sport]) {
                    HStack { Text("FREE AGENTS").font(TF.display(12)).tracking(1.5).foregroundStyle(T.fg); Spacer(); Text("GP · FPTS").font(TF.display(11)).foregroundStyle(T.muted) }
                        .padding(.horizontal, 12).padding(.vertical, 8).background(T.surface2)
                    ForEach(rows.prefix(150)) { p in
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(p.name).font(TF.bold(15)).foregroundStyle(T.fg).lineLimit(1)
                                    if let inj = p.injury { Text(String(inj.prefix(3)).uppercased()).font(TF.display(10)).foregroundStyle(T.red) }
                                }
                                Text("\(p.team ?? "FA") · \(p.pos)").font(TF.body(12)).foregroundStyle(T.muted)
                                Text(p.clears.map { "WAIVERS · \(shortDate($0).uppercased())" } ?? "FREE AGENT").font(TF.display(10)).foregroundStyle(.white)
                                    .padding(.horizontal, 5).frame(height: 18).background(p.clears != nil ? Color(hex: "#2F5D8A") : .black).clipShape(RoundedRectangle(cornerRadius: 2))
                            }
                            Spacer(minLength: 4)
                            Text("\(Int(p.gp ?? 0)) · \((p.points ?? 0).n1)").font(TF.display(13)).foregroundStyle(T.fg)
                            Button { picked = p } label: {
                                Text(p.pending == true ? "PENDING" : p.clears != nil ? "CLAIM" : "ADD").font(TF.display(12)).foregroundStyle(T.fg)
                                    .frame(width: 74, height: 32).overlay(RoundedRectangle(cornerRadius: 4).stroke(T.fg))
                            }
                            .buttonStyle(.plain).disabled(p.pending == true).opacity(p.pending == true ? 0.4 : 1)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .overlay(alignment: .top) { T.line.frame(height: 1) }
                    }
                }
            } else if let error { Text(error).font(TF.semi()).foregroundStyle(T.faint).padding(24) }
            else { ProgressView().padding(30) }
        }
        .task(id: sport ?? "") { await load() }
        .sheet(item: $picked) { p in
            if let d = data { AddSheet(player: p, data: d) { msg in picked = nil; toast = msg; Task { await load() } } }
        }
        .alert(toast ?? "", isPresented: Binding(get: { toast != nil }, set: { if !$0 { toast = nil } })) { Button("OK") {} }
    }
    private func load() async {
        do { data = try await DataService.shared.freeAgents(sport: sport); error = nil }
        catch APIError.http(401, _) { error = "Sign in to add players" }
        catch { self.error = "Couldn’t load free agents" }
    }
}

/// Add a free agent now, or claim one on waivers with a FAAB bid; pick who to drop.
private struct AddSheet: View {
    let player: FreeAgentsData.FA
    let data: FreeAgentsData
    let done: (String?) -> Void
    @State private var bid = 1
    @State private var drop: String?
    @State private var busy = false
    @State private var failure: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(player.name).font(TF.bold(18))
                    Text("\(player.team ?? "FA") · \(player.pos)").font(TF.body(14)).foregroundStyle(T.muted)
                }
                if player.clears != nil {
                    Section("BID (OF $\(Int(data.faab ?? 0)))") {
                        Stepper("$\(bid)", value: $bid, in: 0...max(0, Int(data.faab ?? 0)))
                    }
                }
                Section("DROP") {
                    Picker("Drop", selection: $drop) {
                        Text("Nobody").tag(String?.none)
                        ForEach(data.roster) { m in Text("\(m.name) · \(m.pos)").tag(Optional(player.clears != nil ? m.playerId : m.rosterId)) }
                    }
                    .pickerStyle(.inline).labelsHidden()
                }
                if let failure { Section { Text(failure).foregroundStyle(T.red) } }
            }
            .navigationTitle(player.clears != nil ? "Waiver claim" : "Add player").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { done(nil) } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(player.clears != nil ? "Submit claim" : "Add") { Task { await submit() } }.disabled(busy)
                }
            }
        }
    }
    private func submit() async {
        busy = true; defer { busy = false }
        do {
            if player.clears != nil {
                try await DataService.shared.claim(playerId: player.playerId, dropPlayerId: drop, bid: bid)
                done("Claim submitted: \(player.name) for $\(bid)")
            } else {
                try await DataService.shared.add(teamId: data.team.id, playerId: player.playerId, dropRosterId: drop)
                done("\(player.name) added")
            }
        } catch { failure = error.localizedDescription }
    }
}

/// Your pending waiver claims, each with a cancel button.
struct ClaimsList: View {
    let claims: [FreeAgentsData.Claim]
    let changed: () async -> Void
    var body: some View {
        CardBox {
            Text("PENDING CLAIMS").font(TF.display(12)).tracking(1.5).foregroundStyle(T.fg).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.vertical, 8).background(T.surface2)
            ForEach(claims) { c in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("+ \(c.add?.name ?? "?")").font(TF.bold(15)).foregroundStyle(T.fg)
                        if let d = c.drop { Text("− \(d.name)").font(TF.body(13)).foregroundStyle(T.muted) }
                    }
                    Spacer()
                    Text("$\(Int(c.bid ?? 0))").font(TF.display(16)).foregroundStyle(T.fg)
                    Button { Task { try? await DataService.shared.cancelClaim(c.id); await changed() } } label: {
                        Text("CANCEL").font(TF.display(11)).foregroundStyle(T.red).frame(width: 64, height: 28).overlay(RoundedRectangle(cornerRadius: 4).stroke(T.red))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 12).padding(.vertical, 9)
                .overlay(alignment: .top) { T.line.frame(height: 1) }
            }
        }
    }
}

// MARK: My Club — Trades

struct MyTradesView: View {
    @State private var trades: [MyTrade]?
    @State private var mine: FreeAgentsData?
    @State private var error: String?
    @State private var proposing = false
    @State private var note: String?
    var body: some View {
        VStack(spacing: 14) {
            Button { proposing = true } label: {
                Text("PROPOSE A TRADE").font(TF.display(15)).tracking(1).foregroundStyle(T.onAccent).frame(maxWidth: .infinity).frame(height: 46).background(T.accent).clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .disabled(mine == nil)
            if let trades {
                let myId = mine?.team.id
                let open = trades.filter { ["PENDING", "REVIEW"].contains($0.status ?? "PENDING") }
                let done = trades.filter { !["PENDING", "REVIEW"].contains($0.status ?? "PENDING") }
                if trades.isEmpty { Text("No trades yet").font(TF.body(14)).foregroundStyle(T.muted).padding(16) }
                if !open.isEmpty { SectionHead(title: "OPEN") }
                ForEach(open) { card($0, myId: myId) }
                if !done.isEmpty { SectionHead(title: "SETTLED") }
                ForEach(done.prefix(30)) { card($0, myId: myId) }
            } else if let error { Text(error).font(TF.semi()).foregroundStyle(T.faint).padding(24) }
            else { ProgressView().padding(30) }
        }
        .task { await load() }
        .sheet(isPresented: $proposing) { if let mine { ProposeTradeView(mine: mine) { msg in proposing = false; note = msg; Task { await load() } } } }
        .alert(note ?? "", isPresented: Binding(get: { note != nil }, set: { if !$0 { note = nil } })) { Button("OK") {} }
    }
    private func load() async {
        do {
            async let t = DataService.shared.myTrades()
            async let m = DataService.shared.freeAgents(sport: nil)
            trades = try await t; mine = try? await m; error = nil
        }
        catch APIError.http(401, _) { error = "Sign in to see your trades" }
        catch { self.error = "Couldn’t load trades" }
    }
    private func act(_ id: String, _ action: String) async {
        do { try await DataService.shared.tradeAction(id, action); await load() } catch { note = error.localizedDescription }
    }
    private func card(_ t: MyTrade, myId: String?) -> some View {
        let teams = [t.initiatorTeam, t.recipientTeam].compactMap { $0 }
        return CardBox {
            HStack {
                Text(teams.map { $0.abbreviation ?? $0.name ?? "" }.joined(separator: " ⇄ ")).font(TF.display(14)).foregroundStyle(T.fg)
                Spacer()
                Text((t.status ?? "PENDING").uppercased()).font(TF.display(11)).tracking(1).foregroundStyle(t.status == "ACCEPTED" ? Color(hex: "#177245") : ["REJECTED", "CANCELLED", "VETOED", "FAILED"].contains(t.status ?? "") ? T.red : T.muted)
            }
            .padding(.horizontal, 12).padding(.vertical, 8).background(T.surface2)
            ForEach(Array(t.items.enumerated()), id: \.offset) { _, i in
                HStack(spacing: 8) {
                    if let sp = i.player?.sport ?? i.faabSport { SportChip(sport: sp) }
                    Text(i.player?.name ?? (i.faabAmount.map { "$\(Int($0)) FAAB" } ?? (i.pickId != nil ? "Draft pick" : "?"))).font(TF.semi(14)).foregroundStyle(T.fg).lineLimit(1)
                    Spacer()
                    Text("to \(i.toTeam?.abbreviation ?? "?")").font(TF.body(12)).foregroundStyle(T.muted)
                }
                .padding(.horizontal, 12).padding(.vertical, 7)
                .overlay(alignment: .top) { T.line.frame(height: 1) }
            }
            if t.status == nil || t.status == "PENDING" {
                HStack(spacing: 8) {
                    if t.initiatorId == myId { actionButton("CANCEL", T.red) { await act(t.id, "CANCEL") } }
                    else {
                        actionButton("ACCEPT", Color(hex: "#177245")) { await act(t.id, "ACCEPT") }
                        actionButton("DECLINE", T.red) { await act(t.id, "REJECT") }
                    }
                }
                .padding(12)
            }
        }
    }
    private func actionButton(_ label: String, _ color: Color, _ run: @escaping () async -> Void) -> some View {
        Button { Task { await run() } } label: {
            Text(label).font(TF.display(13)).foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 36).background(color).clipShape(RoundedRectangle(cornerRadius: 4))
        }
        .buttonStyle(.plain)
    }
}

/// Pick a partner, then players from each roster (one league at a time), and send the offer.
private struct ProposeTradeView: View {
    let mine: FreeAgentsData
    let done: (String?) -> Void
    @State private var partner: String?
    @State private var sport: String
    @State private var mySide: FreeAgentsData?
    @State private var theirs: FreeAgentsData?
    @State private var give = Set<String>()
    @State private var get = Set<String>()
    @State private var busy = false
    @State private var failure: String?
    init(mine: FreeAgentsData, done: @escaping (String?) -> Void) { self.mine = mine; self.done = done; _sport = State(initialValue: mine.sport) }
    var body: some View {
        NavigationStack {
            Form {
                Section("LEAGUE") {
                    Picker("League", selection: $sport) { ForEach(["NFL", "NHL", "NBA", "MLB"], id: \.self) { Text(sportLabel($0)).tag($0) } }.pickerStyle(.segmented)
                }
                Section("TRADE WITH") {
                    Picker("Club", selection: $partner) {
                        Text("Choose a club").tag(String?.none)
                        ForEach(mine.clubs ?? []) { c in Text(c.name).tag(Optional(c.id)) }
                    }
                }
                if let mySide { Section("YOU GIVE") { ForEach(mySide.roster) { row($0, in: $give) } } }
                if partner != nil {
                    if let theirs { Section("YOU GET") { ForEach(theirs.roster) { row($0, in: $get) } } }
                    else { Section { ProgressView() } }
                }
                if let failure { Section { Text(failure).foregroundStyle(T.red) } }
            }
            .navigationTitle("Propose a trade").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { done(nil) } }
                ToolbarItem(placement: .confirmationAction) { Button("Send") { Task { await send() } }.disabled(busy || partner == nil || (give.isEmpty && get.isEmpty)) }
            }
            .task(id: "\(sport)-\(partner ?? "")") {
                give = []; get = []; theirs = nil
                mySide = try? await DataService.shared.freeAgents(sport: sport)
                if let partner { theirs = try? await DataService.shared.freeAgents(sport: sport, team: partner) }
            }
        }
    }
    private func row(_ m: FreeAgentsData.Mine, in set: Binding<Set<String>>) -> some View {
        Button { if set.wrappedValue.contains(m.playerId) { set.wrappedValue.remove(m.playerId) } else { set.wrappedValue.insert(m.playerId) } } label: {
            HStack {
                Image(systemName: set.wrappedValue.contains(m.playerId) ? "checkmark.circle.fill" : "circle").foregroundStyle(set.wrappedValue.contains(m.playerId) ? T.accent : T.faint)
                Text(m.name).foregroundStyle(T.fg); Spacer(); Text(m.pos).foregroundStyle(T.muted)
            }
        }
    }
    private func send() async {
        guard let partner else { return }
        busy = true; defer { busy = false }
        do { try await DataService.shared.proposeTrade(to: partner, give: Array(give), get: Array(get), myTeam: mine.team.id); done("Trade offer sent") }
        catch { failure = error.localizedDescription }
    }
}
