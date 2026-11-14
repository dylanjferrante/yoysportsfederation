import SwiftUI

/// Sign in with your ySF account (needed for My Club and lineup moves).
struct LoginView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("SIGN IN").font(TF.display(34)).foregroundStyle(T.fg)
            Text("Use your ySF account.").font(TF.body()).foregroundStyle(T.muted)
            field { TextField("Email", text: $email).textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled() }
            field { SecureField("Password", text: $password).textContentType(.password).onSubmit(submit) }
            if let error { Text(error).font(TF.semi()).foregroundStyle(T.red) }
            Button(action: submit) {
                Group { if busy { ProgressView().tint(T.onAccent) } else { Text("SIGN IN").font(TF.display(16)).tracking(1) } }
                    .foregroundStyle(T.onAccent).frame(maxWidth: .infinity).frame(height: 50).background(T.accent).clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .disabled(busy || email.isEmpty || password.isEmpty).opacity(busy || email.isEmpty || password.isEmpty ? 0.5 : 1)
        }
        .padding(20)
        .frame(maxHeight: .infinity)
        .background(T.page)
    }
    private func field<C: View>(@ViewBuilder _ c: () -> C) -> some View {
        c().font(TF.body(16)).padding(.horizontal, 14).frame(height: 50).background(T.surface).overlay(RoundedRectangle(cornerRadius: 8).stroke(T.line2))
    }
    private func submit() {
        busy = true; error = nil
        Task {
            do { try await auth.login(email: email.trimmingCharacters(in: .whitespaces), password: password); dismiss() }
            catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}
