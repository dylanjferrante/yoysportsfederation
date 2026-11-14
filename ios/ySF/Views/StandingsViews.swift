import SwiftUI

// The site's Standings group in the app: Cup Race, Playoffs, Power Rankings, Records and History.

let sportOrder = ["NFL", "NHL", "NBA", "MLB"]
let leagueCode = ["NFL": "ySFFL", "NHL": "ySFHL", "NBA": "ySFBA", "MLB": "ySFLB"]
let leagueKey = ["NFL": "fl", "NHL": "hl", "NBA": "ba", "MLB": "lb"]
func pctText(_ x: Double) -> String { x >= 0.995 ? ">99%" : x <= 0 ? "0%" : x < 0.001 ? "<0.1%" : String(format: x < 0.1 ? "%.1f%%" : "%.0f%%", x * 100) }
func seasonText(_ s: String) -> String { s.replacingOccurrences(of: "-", with: "–") }
private func leaguePills(_ value: Binding<String>, all: Bool = false) -> Pills {
    Pills(items: (all ? [.init(id: "ALL", label: "ALL")] : []) + sportOrder.map { .init(id: $0, label: leagueCode[$0]!, color: T.league[$0]) }, value: value)
}

/// A screen that loads by a key (league, season, tab) and reloads when the key changes.
struct Keyed<D, Content: View>: View {
    let key: String
    let load: () async throws -> D
    @ViewBuilder let content: (D) -> Content
    @State private var data: D?
    @State private var failed = false
    var body: some View {
        Group {
            if let data { content(data) }
            else if failed { Text("Couldn’t load").font(TF.semi()).foregroundStyle(T.faint).padding(30) }
            else { ProgressView().padding(30) }
        }
        .task(id: key) { data = nil; do { data = try await load(); failed = false } catch { failed = true } }
    }
}

/// A club row: rank, color bar, crest, name (taps through to the club), then the cells.
struct ClubRow<Cells: View>: View {
    let rk: Int?
    let club: Club?
    var short = false
    var divider = true
    @ViewBuilder let cells: Cells
    var body: some View {
        HStack(spacing: 6) {
            if let rk { Text("\(rk)").font(TF.semi(14)).foregroundStyle(T.muted).frame(width: 22, alignment: .leading) }
            NavigationLink(value: Route.club(club?.id ?? "")) {
                HStack(spacing: 8) {
                    Crest(asset: Asset.from(club?.crest), size: 24)
                    Text((short ? club?.abbr : club?.name) ?? "TBD").font(TF.bold(14)).foregroundStyle(T.fg).lineLimit(3).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.leading, 8)
                .overlay(alignment: .leading) { (club?.color.map { Color(hex: $0) } ?? T.fg).frame(width: 4) }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain).disabled(club == nil)
            cells
        }
        .padding(.horizontal, 10).padding(.vertical, 9)
        .overlay(alignment: .bottom) { if divider { T.line.frame(height: 1) } }
    }
}
struct HeadRow: View {
    let first: String
    let cols: [(String, CGFloat)]
    var rank = true
    var body: some View {
        HStack(spacing: 6) {
            if rank { Text("RK").font(TF.display(10)).tracking(1).foregroundStyle(T.muted).frame(width: 22, alignment: .leading) }
            Text(first).font(TF.display(10)).tracking(1).foregroundStyle(T.muted).frame(maxWidth: .infinity, alignment: .leading)
            ForEach(cols, id: \.0) { Text($0.0).font(TF.display(10)).tracking(1).foregroundStyle(T.muted).frame(width: $0.1, alignment: .trailing) }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .overlay(alignment: .bottom) { T.rule.frame(height: 2) }
    }
}
func numCell(_ s: String, _ w: CGFloat, big: Bool = false, muted: Bool = false) -> some View {
    Text(s).font(big ? TF.display(17) : TF.semi(14)).foregroundStyle(muted ? T.muted : T.fg).frame(width: w, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.7)
}
private func cardHead(_ s: String) -> some View {
    Text(s).font(TF.display(12)).tracking(1.5).foregroundStyle(T.fg).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.vertical, 9).background(T.surface2)
}

// MARK: Cup Race

struct CupRaceView: View {
    var body: some View {
        Loader(load: { try await DataService.shared.cup() }) { d in
            ScrollView {
                VStack(spacing: 16) {
                    PageTitle(eyebrow: "\(d.trials.formatted())-SEASON MODEL", title: "CUP RACE")
                    if let lead = d.rows.first { favorite(lead) }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(d.progress, id: \.sport) { p in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 6) { Crest(asset: "\(leagueKey[p.sport] ?? "")_symbol", size: 20); Text(leagueCode[p.sport] ?? p.sport).font(TF.display(12)).foregroundStyle(T.fg) }
                                GeometryReader { g in
                                    ZStack(alignment: .leading) { T.chip; (T.league[p.sport] ?? .black).frame(width: p.total > 0 ? g.size.width * CGFloat(p.done) / CGFloat(p.total) : 0) }
                                }
                                .frame(height: 8).clipShape(RoundedRectangle(cornerRadius: 2))
                                Text(p.total > 0 ? "\(p.done) of \(p.total) games played" : "Not started").font(TF.body(12)).foregroundStyle(T.muted)
                            }
                            .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(T.surface).overlay(RoundedRectangle(cornerRadius: 4).stroke(T.line))
                        }
                    }
                    CardBox {
                        HeadRow(first: "CLUB", cols: [("PTS", 34), ("EXP.", 42), ("TOP 3", 46), ("CUP", 52)])
                        ForEach(d.rows, id: \.self) { r in
                            ClubRow(rk: r.rk, club: r.club) {
                                numCell("\(Int(r.pts))", 34); numCell(String(format: "%.1f", r.exp), 42, muted: true)
                                numCell(r.top3.map(pctText) ?? "—", 46, muted: true); numCell(pctText(r.cupPct), 52, big: true)
                            }
                        }
                    }
                    if let m = d.model {
                        CardBox {
                            cardHead("ySF MODEL · \(m.sims.formatted()) SEASONS")
                            HeadRow(first: "CLUB", cols: [("EXP", 40), ("TOP 3", 46), ("WIN CUP", 58)], rank: false)
                            ForEach(m.rows, id: \.self) { r in
                                ClubRow(rk: nil, club: r.club) { numCell(String(format: "%.1f", r.exp), 40); numCell(pctText(r.top3), 46, muted: true); numCell(pctText(r.win), 58, big: true) }
                            }
                        }
                    }
                }
                .padding(16)
            }
        }
    }
    private func favorite(_ r: CupData.Row) -> some View {
        HStack(spacing: 16) {
            Crest(asset: Asset.from(r.club?.crestOnColor ?? r.club?.crest), size: 72)
            VStack(alignment: .leading, spacing: 4) {
                Text(pctText(r.cupPct)).font(TF.display(52))
                Text("\(r.club?.name.uppercased() ?? "") · CUP FAVORITE · \(String(format: "%.1f", r.exp)) PROJECTED POINTS").font(TF.display(11)).tracking(1)
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(Color(hex: r.club?.ink ?? "#FFFFFF")).padding(16)
        .background(r.club?.color.map { Color(hex: $0) } ?? .black).clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

// MARK: Playoffs

struct PlayoffsView: View {
    @State private var sport = "NFL"
    @State private var season: String?
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                PageTitle(eyebrow: "\(leagueCode[sport] ?? "") · TOP 6 QUALIFY", title: "PLAYOFFS")
                leaguePills($sport)
                Keyed(key: "\(sport)-\(season ?? "")", load: { try await DataService.shared.playoffs(sport: sport, season: season) }) { d in
                    VStack(spacing: 16) {
                        Pills(items: d.seasons.map { .init(id: $0, label: seasonText($0)) }, value: Binding(get: { d.season }, set: { season = $0 }))
                        champion(d)
                        if d.rounds.isEmpty { Text("No bracket yet").font(TF.semi()).foregroundStyle(T.muted).padding(24) }
                        ForEach(d.rounds, id: \.self) { r in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(r.name.uppercased() + (r.period.map { " · \(sport == "NFL" ? "WEEK" : "PERIOD") \($0)" } ?? "")).font(TF.display(12)).tracking(1.5).foregroundStyle(T.muted)
                                    .frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 4).overlay(alignment: .bottom) { T.rule.frame(height: 2) }
                                ForEach(Array(r.games.enumerated()), id: \.offset) { _, g in game(g) }
                            }
                        }
                        if !d.picture.isEmpty {
                            CardBox {
                                cardHead("PLAYOFF PICTURE")
                                HeadRow(first: "CLUB", cols: [("W-L", 46), ("GB", 34), ("PLAYOFFS", 64)])
                                ForEach(d.picture, id: \.self) { r in
                                    ClubRow(rk: r.seed, club: r.club) { numCell(r.rec, 46); numCell(r.gb.map { $0 > 0 ? String(format: "%.1f", $0) : "–" } ?? "–", 34, muted: true); numCell(pctText(r.po), 64, big: true) }
                                        .overlay(alignment: .bottom) { if r.seed == 6 { T.rule.frame(height: 2) } }
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(T.page)
        .onChange(of: sport) { season = nil }
    }
    private func champion(_ d: PlayoffsData) -> some View {
        HStack(spacing: 14) {
            Crest(asset: Asset.from(d.trophyArt), size: 64)
            VStack(alignment: .leading, spacing: 2) {
                Text(d.trophy.uppercased()).font(TF.display(11)).tracking(1.5).opacity(0.9)
                Text(d.champion?.name.uppercased() ?? (d.status == "not_started" || d.status == "none" ? "TO BE DECIDED" : "IN PROGRESS")).font(TF.display(24)).lineLimit(2).minimumScaleFactor(0.7)
            }
            Spacer(minLength: 0)
            if let c = d.champion { Crest(asset: Asset.from(c.crestOnColor), size: 48) }
        }
        .foregroundStyle(d.champion.map { Color(hex: $0.ink) } ?? .white).padding(16)
        .background(d.champion?.color.map { Color(hex: $0) } ?? T.league[d.sport] ?? .black).clipShape(RoundedRectangle(cornerRadius: 4))
    }
    private func game(_ g: PlayoffsData.Game) -> some View {
        VStack(spacing: 0) {
            side(g.home)
            if g.bye { Text("BYE").font(TF.display(12)).tracking(1.5).foregroundStyle(T.muted).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).frame(height: 40).background(T.surface) }
            else if let a = g.away { side(a) }
        }
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(T.line)).clipShape(RoundedRectangle(cornerRadius: 4))
    }
    private func side(_ s: PlayoffsData.Side) -> some View {
        HStack(spacing: 0) {
            Text(s.seed.map(String.init) ?? "").font(TF.display(12)).foregroundStyle(T.muted).frame(width: 28).frame(maxHeight: .infinity).background(T.chip)
            ClubTile(club: s.club, full: true)
                .overlay(alignment: .trailing) { if let sc = s.score { Text(sc.n1).font(s.win ? TF.display(16) : TF.semi(14)).foregroundStyle(s.club.map { Color(hex: $0.ink) } ?? T.fg).padding(.trailing, 12) } }
        }
        .frame(height: 46)
        .opacity(s.score != nil && !s.win ? 0.55 : 1)
    }
}

// MARK: Power Rankings

struct PowerView: View {
    @State private var tab = "now"
    @State private var sport = "ALL"
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                PageTitle(eyebrow: "ySFPR V3 · CROSS-SPORT", title: "RANKINGS")
                Pills(items: [.init(id: "now", label: "THIS SEASON"), .init(id: "all", label: "ALL-TIME"), .init(id: "dyn", label: "DYNASTY")], value: $tab)
                if tab == "all" { leaguePills($sport, all: true) }
                Keyed(key: "\(tab)-\(sport)", load: { try await DataService.shared.power(tab: tab, sport: tab == "all" && sport != "ALL" ? sport : nil) }) { d in
                    CardBox {
                        switch d.tab {
                        case "all":
                            HeadRow(first: "CLUB · SEASON", cols: [("W-L", 46), ("ySFPR", 54)])
                            ForEach(d.rows, id: \.self) { r in
                                ClubRow(rk: r.rk, club: r.club, short: true) {
                                    HStack(spacing: 4) {
                                        Crest(asset: "\(leagueKey[r.sport ?? ""] ?? "")_symbol", size: 16)
                                        Text(String((r.season ?? "").suffix(5))).font(TF.body(12)).foregroundStyle(T.muted)
                                        if r.live == true { Circle().fill(T.red).frame(width: 6, height: 6) }
                                    }
                                    numCell(r.rec ?? "", 46, muted: true); numCell(String(format: "%.1f", r.value ?? 0), 54, big: true)
                                }
                            }
                        case "dyn":
                            cardHead("DECADE RACE · YEAR \(d.year ?? 0) OF \(d.of ?? 10)")
                            HeadRow(first: "CLUB", cols: [("WON", 40), ("PROJ.", 50)])
                            ForEach(d.rows, id: \.self) { r in
                                VStack(spacing: 0) {
                                    ClubRow(rk: r.rk, club: r.club, divider: false) { numCell("\(Int(r.won ?? 0))", 40, big: true); numCell(String(format: "%.1f", r.projected ?? 0), 50, muted: true) }
                                    bar(r.club, [(r.won ?? 0) / 90, (r.thisSeason ?? 0) / 90])
                                }
                                .overlay(alignment: .bottom) { T.line.frame(height: 1) }
                            }
                        default:
                            HeadRow(first: "FEDERATION DOMINANCE", cols: [("DOM", 54)])
                            ForEach(d.rows, id: \.self) { r in
                                VStack(spacing: 0) {
                                    ClubRow(rk: r.rk, club: r.club, divider: false) { numCell(String(format: "%.2f", r.value ?? 0), 54, big: true) }
                                    HStack(spacing: 12) {
                                        ForEach(sportOrder, id: \.self) { sp in
                                            if let v = r.byLeague?[sp] { HStack(spacing: 3) { Crest(asset: "\(leagueKey[sp]!)_symbol", size: 14); Text(String(format: "%.2f", v)).font(TF.body(12)).foregroundStyle(T.muted) } }
                                        }
                                        Spacer()
                                    }
                                    .padding(.horizontal, 40).padding(.bottom, 8)
                                }
                                .overlay(alignment: .bottom) { T.line.frame(height: 1) }
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(T.page)
    }
    private func bar(_ c: Club?, _ parts: [Double]) -> some View {
        GeometryReader { g in
            HStack(spacing: 0) {
                ForEach(Array(parts.enumerated()), id: \.offset) { i, p in (c?.color.map { Color(hex: $0) } ?? T.fg).opacity(i == 0 ? 1 : 0.35).frame(width: g.size.width * CGFloat(min(1, max(0, p)))) }
                Spacer(minLength: 0)
            }
            .background(T.chip)
        }
        .frame(height: 6).clipShape(RoundedRectangle(cornerRadius: 2)).padding(.horizontal, 40).padding(.bottom, 10)
    }
}

// MARK: Records

struct RecordsView: View {
    @State private var sport = "NFL"
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                PageTitle(eyebrow: leagueCode[sport], title: "RECORDS")
                leaguePills($sport)
                Keyed(key: sport, load: { try await DataService.shared.records(sport: sport) }) { d in
                    VStack(spacing: 16) {
                        Text("\(d.games.formatted()) games on record").font(TF.body(13)).foregroundStyle(T.muted).frame(maxWidth: .infinity, alignment: .leading)
                        ForEach(d.lists, id: \.self) { l in
                            CardBox {
                                cardHead(l.title)
                                if l.rows.isEmpty { Text("No games yet").font(TF.body(14)).foregroundStyle(T.muted).padding(14) }
                                ForEach(Array(l.rows.enumerated()), id: \.offset) { i, r in
                                    HStack(spacing: 10) {
                                        Text("\(i + 1)").font(TF.semi(14)).foregroundStyle(T.muted).frame(width: 20, alignment: .leading)
                                        Crest(asset: Asset.from(r.club?.crest), size: 22)
                                        VStack(alignment: .leading, spacing: 1) {
                                            (Text(r.club?.abbr ?? "").font(TF.bold(14)).foregroundStyle(T.fg) + Text("  \(r.text)").font(TF.body(13)).foregroundStyle(T.muted)).lineLimit(1)
                                            Text(seasonText(r.sub)).font(TF.body(12)).foregroundStyle(T.faint)
                                        }
                                        Spacer(minLength: 4)
                                        Text((l.title.contains("WINS") || l.title.contains("CLOSEST") ? "+" : "") + r.value.n1).font(TF.display(17)).foregroundStyle(T.fg)
                                    }
                                    .padding(.horizontal, 12).padding(.vertical, 8)
                                    .overlay(alignment: .top) { T.line.frame(height: 1) }
                                }
                            }
                        }
                        CardBox {
                            cardHead("ALL-TIME · \(leagueCode[sport] ?? "")")
                            HeadRow(first: "CLUB", cols: [("W", 26), ("L", 26), ("PCT", 44), ("PF/G", 50)], rank: false)
                            ForEach(d.allTime, id: \.self) { r in
                                ClubRow(rk: nil, club: r.club) { numCell("\(r.w)", 26); numCell("\(r.l)", 26); numCell(String(format: "%.3f", r.pct).replacingOccurrences(of: "0.", with: "."), 44); numCell(r.ppg.n1, 50, muted: true) }
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(T.page)
    }
}

// MARK: History

struct HistoryView: View {
    var body: some View {
        Loader(load: { try await DataService.shared.history() }) { d in
            ScrollView {
                VStack(spacing: 16) {
                    PageTitle(eyebrow: "PAST SEASONS · CHAMPIONS · RECORDS", title: "HISTORY")
                    seasonCard(title: seasonText(d.current.season), kick: "IN PROGRESS", cupLabel: "FED CUP LEADER", cupLine: "\(d.current.leader?.name ?? "—") · \(Int(d.current.leaderPts)) pts",
                               rows: d.current.leagues.map { ($0.sport, $0.label, $0.club.map { "\($0.abbr) · " } ?? "" + "", $0.rec ?? "—") })
                    seasonCard(title: seasonText(d.previous.season), kick: "FINAL" + (d.previous.inaugural ? " · INAUGURAL SEASON" : ""), cupLabel: "FED CUP CHAMPION",
                               cupLine: d.previous.fedChampion.map { "\($0.name) · \(Int(d.previous.fedPts ?? 0)) pts" } ?? "—",
                               rows: d.previous.leagues.map { ($0.sport, "CHAMPION", "", $0.champion?.abbr ?? "—") })
                    if let fc = d.previous.fedChampion {
                        HStack(spacing: 14) {
                            Crest(asset: "ysf_cup_symbol", size: 56)
                            Crest(asset: Asset.from(fc.crestOnColor), size: 56)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(seasonText(d.previous.season)) FEDERATION CUP CHAMPION").font(TF.display(11)).tracking(1).opacity(0.9)
                                Text(fc.name.uppercased()).font(TF.display(26)).lineLimit(2).minimumScaleFactor(0.7)
                                Text("\(Int(d.previous.fedPts ?? 0)) Federation points").font(TF.body(13)).opacity(0.9)
                            }
                            Spacer(minLength: 0)
                        }
                        .foregroundStyle(Color(hex: fc.ink)).padding(16).background(fc.color.map { Color(hex: $0) } ?? .black).clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    SectionHead(title: "LEAGUE CHAMPIONS")
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(d.previous.leagues, id: \.self) { l in
                            VStack(spacing: 0) {
                                VStack(spacing: 6) {
                                    Crest(asset: Asset.from(l.art), size: 60)
                                    Text(l.trophy.uppercased()).font(TF.display(10)).tracking(1).multilineTextAlignment(.center).foregroundStyle(l.sport == "MLB" ? .white : .black)
                                }
                                .frame(maxWidth: .infinity).padding(10).background(Color(hex: ["NFL": "#95A2AC", "NHL": "#8CC63F", "NBA": "#EEB21D", "MLB": "#8B2144"][l.sport] ?? "#000"))
                                HStack(spacing: 8) {
                                    Crest(asset: Asset.from(l.champion?.crestOnColor), size: 30)
                                    VStack(alignment: .leading, spacing: 0) {
                                        Text("CHAMPION").font(TF.display(9)).opacity(0.85)
                                        Text(l.champion?.name ?? "—").font(TF.display(13)).lineLimit(2).minimumScaleFactor(0.8)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .foregroundStyle(Color(hex: l.champion?.ink ?? "#FFFFFF")).padding(10).frame(maxHeight: .infinity)
                                .background(l.champion?.color.map { Color(hex: $0) } ?? .black)
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                    }
                    CardBox {
                        cardHead("ALL-TIME FEDERATION TABLE")
                        HeadRow(first: "CLUB", cols: [("W", 28), ("L", 28), ("PCT", 42), ("CUP", 36)])
                        ForEach(Array(d.allTime.enumerated()), id: \.offset) { i, r in
                            VStack(spacing: 0) {
                                ClubRow(rk: i + 1, club: r.club, divider: false) { numCell("\(r.w)", 28); numCell("\(r.l)", 28); numCell(String(format: "%.3f", r.pct).replacingOccurrences(of: "0.", with: "."), 42); numCell("\(Int(r.cup))", 36, big: true) }
                                HStack(spacing: 10) {
                                    ForEach(sportOrder, id: \.self) { sp in
                                        HStack(spacing: 3) { Crest(asset: "\(leagueKey[sp]!)_symbol", size: 14); Text((r.per[sp] ?? nil) ?? "—").font(TF.body(12)).foregroundStyle(T.muted) }
                                    }
                                    Spacer()
                                    ForEach(r.titles, id: \.self) { t in
                                        Crest(asset: Asset.from(t.art), size: 22).padding(2)
                                            .background(t.scope == "OVERALL" ? Color.black : Color(hex: ["NFL": "#95A2AC", "NHL": "#8CC63F", "NBA": "#EEB21D", "MLB": "#8B2144"][t.scope] ?? "#000")).clipShape(RoundedRectangle(cornerRadius: 3))
                                    }
                                }
                                .padding(.leading, 40).padding(.trailing, 10).padding(.bottom, 8)
                            }
                            .overlay(alignment: .bottom) { T.line.frame(height: 1) }
                        }
                    }
                    CardBox {
                        cardHead("RECORDS BOOK")
                        ForEach(d.book, id: \.self) { b in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(b.k).font(TF.body(13)).foregroundStyle(T.muted)
                                Text(b.v).font(TF.bold(14)).foregroundStyle(T.fg)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.vertical, 8)
                            .overlay(alignment: .top) { T.line.frame(height: 1) }
                        }
                    }
                }
                .padding(16)
            }
        }
    }
    private func seasonCard(title: String, kick: String, cupLabel: String, cupLine: String, rows: [(String, String, String, String)]) -> some View {
        CardBox {
            HStack(spacing: 12) {
                Crest(asset: "ysf_primary", size: 44)
                VStack(alignment: .leading, spacing: 0) { Text(kick).font(TF.display(11)).tracking(1).opacity(0.9); Text(title).font(TF.display(32)) }
                Spacer()
            }
            .foregroundStyle(.white).padding(12).background(Color.black)
            HStack(spacing: 10) {
                Crest(asset: "ysf_cup_symbol", size: 34)
                VStack(alignment: .leading, spacing: 1) { Text(cupLabel).font(TF.display(10)).foregroundStyle(T.muted); Text(cupLine).font(TF.bold(14)).foregroundStyle(T.fg) }
                Spacer()
            }
            .padding(12).overlay(alignment: .bottom) { T.line.frame(height: 1) }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 0), GridItem(.flexible(), spacing: 0)], spacing: 0) {
                ForEach(rows, id: \.0) { sp, label, pre, val in
                    HStack(spacing: 8) {
                        Crest(asset: "\(leagueKey[sp]!)_symbol", size: 24)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("\(leagueCode[sp]!) · \(label)").font(TF.display(9)).foregroundStyle(T.muted)
                            Text(pre + val).font(TF.bold(13)).foregroundStyle(T.fg).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(10).overlay(alignment: .bottom) { T.line.frame(height: 1) }
                }
            }
        }
    }
}
