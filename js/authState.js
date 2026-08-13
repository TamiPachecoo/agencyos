// Minimal owner sign-in state.
//
// Only public.impact_workflows / public.impact_measurements are RLS-restricted
// to authenticated sessions — every other table keeps the app's existing
// "allow all (no auth yet)" access, unchanged. This file just reflects session
// state in the header (sign in / sign out) and gives pages a small helper to
// gate the specific widgets that need a session. See CLAUDE.md for the
// no-auth baseline this deliberately does NOT change everywhere else.

function authPathToSignIn() {
  return window.location.pathname.includes("/pages/") ? "signin.html" : "pages/signin.html";
}

function renderAuthStatus(session) {
  const el = document.getElementById("auth-status");
  if (!el) return;

  if (session) {
    const email = session.user && session.user.email ? session.user.email : "Signed in";
    el.innerHTML = `
      <span class="auth-email">${email}</span>
      <button type="button" class="auth-link" id="auth-signout-btn">Sign out</button>
    `;
    const btn = document.getElementById("auth-signout-btn");
    if (btn) btn.addEventListener("click", () => supabaseClient.auth.signOut());
  } else {
    el.innerHTML = `<a class="auth-link" href="${authPathToSignIn()}?next=${encodeURIComponent(window.location.pathname)}">Sign in</a>`;
  }
}

// Renders a signed-out placeholder into `container` — used by any widget that
// depends on impact_workflows/impact_measurements so a signed-out visitor sees
// an honest prompt instead of a blank or broken section.
function renderSignInPrompt(container, message) {
  container.innerHTML = `
    <div class="auth-gate">
      <p>${message || "Sign in to view impact data."}</p>
      <a class="btn btn-secondary" href="${authPathToSignIn()}?next=${encodeURIComponent(window.location.pathname)}">Sign in</a>
    </div>
  `;
}

let _authStateReady = null;

// Resolves once with the current session, then keeps the header in sync on
// every future change. Callers that only need a one-time check can just
// `await getAuthSession()`.
function getAuthSession() {
  if (_authStateReady) return _authStateReady;
  _authStateReady = supabaseClient.auth.getSession().then(({ data }) => {
    renderAuthStatus(data.session);
    return data.session;
  });
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    renderAuthStatus(session);
    if (typeof onAuthChanged === "function") onAuthChanged(session);
  });
  return _authStateReady;
}

getAuthSession();
