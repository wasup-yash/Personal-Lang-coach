let currentUser = null;

export async function initializeAuth(onChange) {
  const elements = {
    state: document.querySelector("#auth-state"),
    open: document.querySelector("#auth-open"),
    dialog: document.querySelector("#auth-dialog"),
    close: document.querySelector("#auth-close"),
    form: document.querySelector("#auth-form"),
    email: document.querySelector("#auth-email"),
    password: document.querySelector("#auth-password"),
    message: document.querySelector("#auth-message"),
    signOut: document.querySelector("#auth-sign-out"),
    exportData: document.querySelector("#auth-export"),
    deleteAccount: document.querySelector("#auth-delete")
  };

  async function refresh() {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    let data = await response.json().catch(() => ({ user: null }));
    if (!data.user) {
      const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
      data = await refreshed.json().catch(() => ({ user: null }));
    }
    currentUser = data.user || null;
    elements.state.textContent = currentUser ? currentUser.email : "Not signed in";
    elements.open.hidden = Boolean(currentUser);
    elements.signOut.hidden = !currentUser;
    elements.exportData.hidden = !currentUser;
    elements.deleteAccount.hidden = !currentUser;
    onChange(currentUser);
  }

  elements.open.addEventListener("click", () => elements.dialog.showModal());
  elements.close.addEventListener("click", () => elements.dialog.close());
  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter?.value || "sign-in";
    elements.message.textContent = "Working...";
    const response = await fetch(`/api/auth/${submitter}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: elements.email.value, password: elements.password.value })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      elements.message.textContent = data.error || "Authentication failed.";
      return;
    }
    if (submitter === "sign-up") {
      elements.message.textContent = data.message;
      return;
    }
    elements.dialog.close();
    elements.form.reset();
    await refresh();
  });
  elements.signOut.addEventListener("click", async () => {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin" });
    await refresh();
  });
  elements.exportData.addEventListener("click", () => {
    window.location.assign("/api/auth/export");
  });
  elements.deleteAccount.addEventListener("click", async () => {
    if (!window.confirm("Delete your account, saved history, and any remaining transient audio objects? This cannot be undone.")) return;
    const response = await fetch("/api/auth/account", { method: "DELETE", credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      window.alert(data.error || "Account deletion failed.");
      return;
    }
    await refresh();
  });

  try {
    await refresh();
  } catch {
    elements.state.textContent = "Authentication unavailable";
    onChange(null);
  }
}

export function signedInUser() {
  return currentUser;
}
