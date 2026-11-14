import SwiftUI

/// My Club: your roster with this week's scores, any week, and lineup moves (sign in first).
struct MyClubTab: View {
    @Environment(AuthService.self) private var auth
    @State private var signingIn = false
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                PageTitle(title: "MY CLUB")
                if auth.isLoggedIn {
                    RosterView(teamId: nil, sport: nil).id(auth.token)
                } else {
                    Text("Sign in with your ySF account to see your roster and set your lineup.").font(TF.body(16)).foregroundStyle(T.fg2).frame(maxWidth: .infinity, alignment: .leading)
                    Button { signingIn = true } label: {
                        Text("SIGN IN").font(TF.display(15)).tracking(1).foregroundStyle(T.onAccent).frame(maxWidth: .infinity).frame(height: 48).background(T.accent).clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
            .padding(16)
        }
        .background(T.page)
        .sheet(isPresented: $signingIn) { LoginView() }
    }
}
