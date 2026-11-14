import SwiftUI
import UIKit

// MARK: - Design tokens (ySF brand: black and white, the four league colors, each club's own colors)
// One token serves both modes (trait-adaptive), matching the site's dark mode.

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces); if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        let v = UInt64(s, radix: 16) ?? 0
        self.init(.sRGB, red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255, opacity: 1)
    }
    static func adaptive(_ light: String, _ dark: String) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(Color(hex: dark)) : UIColor(Color(hex: light)) })
    }
}

enum T {
    static let page = Color.adaptive("#FFFFFF", "#0E0E0E")
    static let surface = Color.adaptive("#FFFFFF", "#161616")
    static let surface2 = Color.adaptive("#F2F2F2", "#222222")
    static let chip = Color.adaptive("#E5E5E5", "#2E2E2E")
    static let fg = Color.adaptive("#000000", "#F2F2F2")
    static let fg2 = Color.adaptive("#1F1F1F", "#E2E2E2")
    static let muted = Color.adaptive("#4A4A4A", "#A6A6A6")
    static let faint = Color.adaptive("#8A8A8A", "#7A7A7A")
    static let line = Color.adaptive("#E5E5E5", "#2A2A2A")
    static let line2 = Color.adaptive("#C7C7C7", "#3D3D3D")
    static let rule = Color.adaptive("#000000", "#E2E2E2")
    /// selected pills and primary buttons: black on light, near-white on dark
    static let accent = Color.adaptive("#000000", "#F2F2F2")
    static let onAccent = Color.adaptive("#FFFFFF", "#000000")
    static let red = Color(hex: "#ba0c2f")
    static let league: [String: Color] = ["NFL": Color(hex: "#177245"), "NHL": Color(hex: "#6da7ee"), "NBA": Color(hex: "#e86100"), "MLB": Color(hex: "#ba0c2f")]
}

// MARK: - Type. Free stand-ins for the site's Adobe fonts: Chakra Petch (Shuttleblock), Barlow (Address Sans).
enum TF {
    static func display(_ size: CGFloat) -> Font { .custom("ChakraPetch-Bold", size: size) }
    static func displaySemi(_ size: CGFloat) -> Font { .custom("ChakraPetch-SemiBold", size: size) }
    static func body(_ size: CGFloat = 15) -> Font { .custom("Barlow-Regular", size: size) }
    static func semi(_ size: CGFloat = 15) -> Font { .custom("Barlow-SemiBold", size: size) }
    static func bold(_ size: CGFloat = 15) -> Font { .custom("Barlow-Bold", size: size) }
}

/// Brand files are named for the background they sit on; the asset name is the file's name.
/// League symbols carry their _black version as the dark-mode variant in the asset catalog.
enum Asset {
    static func from(_ url: String?) -> String? {
        guard let url, let last = url.split(separator: "/").last else { return nil }
        let name = last.replacingOccurrences(of: ".svg", with: "")
        // trophies: /ysf/champ/fl.svg → trophy_fl, /ysf/champ/2025-26/fl.svg → trophy_2025_fl
        if url.contains("/champ/") { return url.contains("/2025-26/") ? "trophy_2025_\(name)" : "trophy_\(name)" }
        if name == "cup_symbol" { return "ysf_cup_symbol" }
        if let r = name.range(of: "_symbol_white") { return String(name[..<r.lowerBound]) + "_symbol" }
        return name
    }
}
