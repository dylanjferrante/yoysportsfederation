import SwiftUI

/// A club, like the site's club page: band (crest, Cup standing, trophy case), bio, this week, and tabs —
/// Calendar · each league (season, standing, roster, future picks, schedule) · Drafts · Moves · Head-to-head.
struct ClubDetailView: View {
    let id: String
    @State private var tab = "CAL"
    @State private var season: [String: String] = [:]
    @State private var open: URL?

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
                    if !d.thisWeek.isEmpty { thisWeek(d) }
                    Pills(items: [.init(id: "CAL", label: "CALENDAR")] + d.leagues.map { .init(id: $0.sport, label: $0.code, color: Color(hex: $0.color)) }
                          + [.init(id: "DR", label: "DRAFTS"), .init(id: "MV", label: "MOVES"), .init(id: "H2H", label: "HEAD-TO-HEAD")], value: $tab)
                    switch tab {
                    case "CAL": CalendarGrid(cal: d.calendar, leagues: d.leagues) { open = matchURL($0) }
                    case "DR": drafts(d)
                    case "MV": moves(d)
                    case "H2H": h2h(d)
                    default: leagueTab(d, sport: tab)
                    }
                }
                .padding(16)
            }
            .sheet(item: $open) { SafariView(url: $0).ignoresSafeArea() }
        }
    }

    private func matchURL(_ id: String) -> URL? { URL(string: "\(APIClient.shared.baseURL)/leagues/ysf/matchup/\(id)") }

    // MARK: band
    private func band(_ d: ClubData) -> some View {
        let ink = Color(hex: d.club.ink)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Crest(asset: Asset.from(d.club.crestOnColor ?? d.club.crest), size: 72)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(d.owner ?? "") · \(d.club.abbr) · EST. 2025–26".uppercased()).font(TF.display(11)).tracking(1.5).opacity(0.9)
                    Text(d.club.name.uppercased()).font(TF.display(26))
                }
            }
            HStack(spacing: 8) {
                ForEach([("CUP RANK", ordinal(d.cup.rk)), ("CUP PTS", "\(Int(d.cup.pts))"), ("RECORD", d.cup.rec), ("CUP %", pct(d.cup.cupPct)), ("TITLES", "\(d.trophies.count)")], id: \.0) { k, v in
                    VStack(spacing: 0) { Text(k).font(TF.display(8)).tracking(0.5); Text(v).font(TF.display(16)).minimumScaleFactor(0.7).lineLimit(1) }
                        .foregroundStyle(.black).frame(maxWidth: .infinity).padding(.vertical, 6).background(.white).clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }
            if !d.trophies.isEmpty {
                Text("TROPHY CASE").font(TF.display(11)).tracking(1.5).opacity(0.9)
                ForEach(d.trophies, id: \.self) { t in
                    Text("\(t.name) champion").font(TF.semi(14)).padding(.horizontal, 10).padding(.vertical, 6).background(.black.opacity(0.2)).clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }
        }
        .foregroundStyle(ink)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(d.club.color.map { Color(hex: $0) } ?? .black)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    // MARK: this week — one card per league
    private func thisWeek(_ d: ClubData) -> some View {
        VStack(spacing: 10) {
            ForEach(d.thisWeek, id: \.sport) { w in
                let lg = d.leagues.first { $0.sport == w.sport }
                Button { open = matchURL(w.matchupId) } label: {
                    CardBox(accent: lg.map { Color(hex: $0.color) }) {
                        VStack(spacing: 8) {
                            HStack {
                                if let lg { Image(lg.symbolAsset).resizable().scaledToFit().frame(width: 22, height: 22) }
                                Text("\(lg?.code ?? "") · \(w.label)").font(TF.bold(13)).foregroundStyle(T.fg)
                                Spacer()
                                Text(w.status).font(TF.body(12)).foregroundStyle(T.muted)
                            }
                            HStack {
                                Text(w.me?.n1 ?? "—").font(TF.display(28)).foregroundStyle(T.fg)
                                Spacer()
                                HStack(spacing: 6) { Text("vs").font(TF.body(12)).foregroundStyle(T.muted); Crest(asset: Asset.from(w.oppLogo), size: 22); Text(w.oppAb).font(TF.bold(13)).foregroundStyle(T.fg) }
                                Spacer()
                                Text(w.them?.n1 ?? "—").font(TF.display(28)).foregroundStyle(T.muted)
                            }
                        }
                        .padding(14)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: a league: season switcher, standing, roster (this season), future picks, schedule
    @ViewBuilder private func leagueTab(_ d: ClubData, sport: String) -> some View {
        if let lg = d.seasons[sport] {
            let ss = season[sport] ?? lg.seasons.first ?? d.season
            let S = lg.bySeason[ss]
            let color = T.league[sport] ?? T.fg
            if lg.seasons.count > 1 {
                Pills(items: lg.seasons.map { .init(id: $0, label: $0.replacingOccurrences(of: "-", with: "–")) }, value: Binding(get: { ss }, set: { season[sport] = $0 }))
            }
            if let S {
                CardBox(accent: color) {
                    let stats: [(String, String)] = [S.result.map { ("RESULT", $0) }, (S.rankLabel, S.rank), ("RECORD", S.rec), ("PF", S.pf), ("CUP PTS", S.fed), S.po.map { ("P%", $0) }, S.title.map { ("TITLE %", $0) }].compactMap { $0 }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 10)], alignment: .leading, spacing: 10) {
                        ForEach(stats, id: \.0) { k, v in
                            VStack(alignment: .leading, spacing: 2) { Text(k).font(TF.display(10)).tracking(1).foregroundStyle(T.muted); Text(v).font(TF.display(20)).foregroundStyle(T.fg) }
                        }
                    }
                    .padding(14)
                }
            }
            if ss == d.season { RosterView(teamId: id, sport: sport).id(sport) }
            if ss == d.season && !lg.picks.isEmpty { picks(lg) }
            if let S { schedule(S) }
        }
    }

    private func picks(_ lg: ClubData.LeagueSeasons) -> some View {
        CardBox {
            Text("FUTURE DRAFT PICKS").font(TF.display(12)).tracking(1.5).foregroundStyle(T.fg).frame(maxWidth: .infinity, alignment: .leading).padding(12)
                .overlay(alignment: .bottom) { T.rule.frame(height: 2) }
            HStack { Text("DRAFT").frame(width: 56, alignment: .leading); ForEach(lg.rounds, id: \.self) { Text("RD \($0)").frame(maxWidth: .infinity) } }
                .font(TF.display(10)).tracking(1).foregroundStyle(T.muted).padding(.horizontal, 12).padding(.vertical, 8)
            ForEach(lg.picks, id: \.year) { y in
                HStack {
                    Text(String(y.year)).font(TF.semi(14)).foregroundStyle(T.fg).frame(width: 56, alignment: .leading)
                    ForEach(Array(y.cells.enumerated()), id: \.offset) { _, chips in
                        VStack(spacing: 3) {
                            if chips.isEmpty { Text("—").foregroundStyle(T.faint) }
                            ForEach(Array(chips.enumerated()), id: \.offset) { _, c in chip(c) }
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 7)
                .overlay(alignment: .top) { T.line.frame(height: 1) }
            }
        }
    }
    @ViewBuilder private func chip(_ c: ClubData.Pick) -> some View {
        switch c.kind {
        case "own": Text("OWN").font(TF.display(10)).foregroundStyle(T.onAccent).padding(.horizontal, 6).padding(.vertical, 3).background(T.accent)
        case "acq": HStack(spacing: 3) { Crest(asset: Asset.from(c.crest), size: 14); Text(c.ab ?? "").font(TF.display(10)) }.foregroundStyle(T.fg).padding(.horizontal, 5).padding(.vertical, 2).overlay(Rectangle().stroke(T.fg))
        default: Text("TRADED").font(TF.display(10)).foregroundStyle(T.muted).padding(.horizontal, 6).padding(.vertical, 3).background(T.chip)
        }
    }

    private func schedule(_ S: ClubData.LeagueSeason) -> some View {
        CardBox {
            Text("SCHEDULE").font(TF.display(12)).tracking(1.5).foregroundStyle(T.fg).frame(maxWidth: .infinity, alignment: .leading).padding(12)
                .overlay(alignment: .bottom) { T.rule.frame(height: 2) }
            ForEach(Array(S.sched.enumerated()), id: \.offset) { _, x in
                Button { open = matchURL(x.matchupId) } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(x.per)\(x.dates.isEmpty ? "" : " · \(x.dates)")").font(TF.display(10)).tracking(0.5).foregroundStyle(T.muted)
                            HStack(spacing: 6) { Text(x.ha).font(TF.body(13)).foregroundStyle(T.muted); Crest(asset: Asset.from(x.crest), size: 20); Text(x.opp).font(TF.bold(14)).foregroundStyle(T.fg).lineLimit(1) }
                        }
                        Spacer()
                        if !x.res.isEmpty {
                            Text(x.res).font(TF.display(11)).foregroundStyle(.white).frame(width: 22, height: 22)
                                .background(x.res == "W" ? Color(hex: "#177245") : x.res == "L" ? T.red : T.faint)
                        }
                        Text(x.score).font(TF.semi(13)).foregroundStyle(T.fg)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .overlay(alignment: .top) { T.line.frame(height: 1) }
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: drafts, moves, head-to-head
    private func drafts(_ d: ClubData) -> some View {
        VStack(spacing: 12) {
            if d.drafts.isEmpty { Text("No drafts yet").font(TF.semi()).foregroundStyle(T.faint) }
            ForEach(d.drafts, id: \.self) { dr in
                CardBox(accent: dr.sport.flatMap { T.league[$0] } ?? T.fg) {
                    Text(dr.title.uppercased()).font(TF.display(14)).foregroundStyle(T.fg).frame(maxWidth: .infinity, alignment: .leading).padding(12)
                    ForEach(dr.rows, id: \.self) { r in
                        HStack(spacing: 10) {
                            Text(r.pk).font(TF.display(12)).foregroundStyle(T.muted).frame(width: 70, alignment: .leading)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(r.player).font(TF.bold(14)).foregroundStyle(T.fg)
                                Text("\(r.team) · \(r.pos)\(r.via.isEmpty ? "" : " · via \(r.via)")").font(TF.body(12)).foregroundStyle(T.muted)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .overlay(alignment: .top) { T.line.frame(height: 1) }
                    }
                }
            }
        }
    }
    private func moves(_ d: ClubData) -> some View {
        CardBox {
            ForEach(Array(d.moves.prefix(150).enumerated()), id: \.offset) { _, m in
                HStack(alignment: .top, spacing: 10) {
                    Text(kind(m.kind)).font(TF.display(10)).foregroundStyle(T.onAccent).frame(width: 58, height: 22).background(m.kind == "DROPPED" || m.kind == "RELEASED" ? T.faint : T.accent)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(m.player).font(TF.bold(14)).foregroundStyle(T.fg)
                        Text([m.team.isEmpty ? nil : "\(m.team) · \(m.pos)", m.detail.isEmpty ? nil : m.detail].compactMap { $0 }.joined(separator: " · ")).font(TF.body(12)).foregroundStyle(T.muted)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        if let lg = T.league[m.sport] { Circle().fill(lg).frame(width: 8, height: 8) }
                        Text(String(m.when.prefix(10))).font(TF.body(11)).foregroundStyle(T.faint)
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .overlay(alignment: .top) { T.line.frame(height: 1) }
            }
        }
    }
    private func kind(_ k: String) -> String { ["CLAIMED": "CLAIM", "SIGNED": "SIGN", "DROPPED": "DROP", "RELEASED": "DROP", "TRADED": "TRADE"][k] ?? k }
    private func h2h(_ d: ClubData) -> some View {
        CardBox {
            HStack { Text("OPPONENT").frame(maxWidth: .infinity, alignment: .leading); Text("W-L").frame(width: 50, alignment: .trailing); Text("PCT").frame(width: 50, alignment: .trailing); Text("PF").frame(width: 70, alignment: .trailing) }
                .font(TF.display(10)).tracking(1).foregroundStyle(T.muted).padding(.horizontal, 12).padding(.vertical, 8).overlay(alignment: .bottom) { T.rule.frame(height: 2) }
            ForEach(d.h2h) { r in
                HStack {
                    HStack(spacing: 8) { Crest(asset: Asset.from(r.crest), size: 22); Text(r.name).font(TF.bold(14)).foregroundStyle(T.fg).lineLimit(2) }.frame(maxWidth: .infinity, alignment: .leading)
                    Text(r.rec).frame(width: 50, alignment: .trailing); Text(r.pct).frame(width: 50, alignment: .trailing); Text(r.pf).frame(width: 70, alignment: .trailing)
                }
                .font(TF.semi(14)).foregroundStyle(T.fg)
                .padding(.horizontal, 12).padding(.vertical, 9)
                .overlay(alignment: .top) { T.line.frame(height: 1) }
            }
        }
    }

    private func ordinal(_ n: Int) -> String {
        let s = (n % 100 >= 11 && n % 100 <= 13) ? "th" : ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][n % 10]
        return "\(n)\(s)"
    }
    private func pct(_ x: Double) -> String { x >= 0.995 ? ">99%" : x < 0.001 ? "<0.1%" : String(format: x < 0.1 ? "%.1f%%" : "%.0f%%", x * 100) }
}

/// The club calendar: every matchup ever, one column per calendar week; league symbols stay pinned on
/// the left while the weeks scroll. Playoff weeks carry a pill naming the round; the championship's is gold.
struct CalendarGrid: View {
    let cal: ClubData.Calendar
    let leagues: [LeagueMeta]
    let onOpen: (String) -> Void
    private let colW: CGFloat = 104, rowH: CGFloat = 54
    var body: some View {
        CardBox {
            HStack(alignment: .top, spacing: 0) {
                VStack(spacing: 4) {
                    Color.clear.frame(height: 34)
                    ForEach(cal.rows, id: \.sport) { r in
                        Image(leagues.first { $0.sport == r.sport }?.symbolAsset ?? "").resizable().scaledToFit().frame(width: 24, height: 24).frame(width: 40, height: rowH)
                    }
                }
                .padding(.top, 6)
                .frame(width: 44)
                .overlay(alignment: .trailing) { T.rule.frame(width: 3) }
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 4) {
                                ForEach(cal.cols, id: \.key) { c in
                                    VStack(spacing: 2) {
                                        if let s = c.season { Text("\(s) STARTS").font(TF.display(8)).foregroundStyle(.white).padding(.horizontal, 3).background(.black) }
                                        Text(c.label).font(TF.bold(10)).foregroundStyle(c.current ? T.fg : T.muted)
                                    }
                                    .frame(width: colW, height: 34, alignment: .bottom).id(c.key)
                                }
                            }
                            ForEach(cal.rows, id: \.sport) { r in
                                HStack(spacing: 4) {
                                    ForEach(Array(r.cells.enumerated()), id: \.offset) { _, cell in
                                        if let c = cell { cellView(c, sport: r.sport) } else { RoundedRectangle(cornerRadius: 4).stroke(T.line).frame(width: colW, height: rowH) }
                                    }
                                }
                            }
                        }
                        .padding(6)
                    }
                    .onAppear { if let cur = cal.cols.first(where: { $0.current }) { proxy.scrollTo(cur.key, anchor: .center) } }
                }
                .frame(maxWidth: .infinity)
            }
        }
    }
    private func cellView(_ c: ClubData.CalCell, sport: String) -> some View {
        let w = CGFloat(c.span) * colW + CGFloat(c.span - 1) * 4
        let bg: Color = c.tone == "win" ? .adaptive("#E8F3EC", "#12301F") : c.tone == "loss" ? .adaptive("#FBE9EC", "#3A1218") : c.tone == "tie" ? T.surface2 : T.surface
        let pill = c.round == "final" ? (c.tone == "win" ? "★ CHAMPIONS" : "★ FINAL") : c.round == "third" ? "3RD PLACE" : c.round == "fifth" ? "5TH PLACE" : "PLAYOFFS"
        return Button { onOpen(c.matchupId) } label: {
            VStack(spacing: 2) {
                if c.playoff {
                    Text(pill).font(TF.display(8)).foregroundStyle(c.round == "final" ? .black : .white).padding(.horizontal, 4).padding(.vertical, 1)
                        .background(c.round == "final" ? AnyShapeStyle(LinearGradient(colors: [Color(hex: "#F7E7A6"), Color(hex: "#D4AF37"), Color(hex: "#B8860B")], startPoint: .topLeading, endPoint: .bottomTrailing)) : AnyShapeStyle(Color.black))
                } else { Text(c.label).font(TF.body(10)).foregroundStyle(T.muted) }
                Text(c.opp).font(TF.bold(12)).foregroundStyle(T.fg)
                if !c.result.isEmpty { Text(c.result).font(TF.body(10)).foregroundStyle(T.fg2).lineLimit(1).minimumScaleFactor(0.7) }
            }
            .frame(width: w, height: rowH, alignment: c.playoff ? .top : .center)
            .padding(.top, c.playoff ? 4 : 0)
            .background(bg)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(T.league[sport] ?? T.fg, lineWidth: c.playoff || c.tone == "live" ? 3 : 2))
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
        .buttonStyle(.plain)
    }
}
