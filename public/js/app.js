import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const form = document.querySelector("#fixture-form");
const formError = document.querySelector("#form-error");
let mode = "login";
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
async function refresh() {
  const data = await api("/api/fixtures");
  listEl.innerHTML = "";
  data.fixtures.forEach((f) => {
    const box = document.createElement("div");
    box.className = "fix";
    const title = document.createElement("strong");
    title.textContent = f.name;
    box.append(title);
    f.matches.forEach((m) => {
      const el = document.createElement("div");
      el.className = "match";
      el.textContent = `${m.home} ${m.homeScore ?? "-"} - ${m.awayScore ?? "-"} ${m.away}`;
      box.append(el);
    });
    const matchForm = document.createElement("form");
    matchForm.className = "form";
    matchForm.innerHTML = `<input placeholder="Local" /><input placeholder="Visitante" /><input type="number" placeholder="Goles L" /><input type="number" placeholder="Goles V" /><button class="primary" type="submit">Agregar</button>`;
    matchForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const [home, away, hs, as] = [...matchForm.querySelectorAll("input")].map((i) => i.value.trim());
      await api(`/api/fixtures/${f.id}/match`, { method: "POST", body: JSON.stringify({ home, away, homeScore: hs === "" ? null : Number(hs), awayScore: as === "" ? null : Number(as) }) });
      await refresh();
    });
    box.append(matchForm);
    const del = document.createElement("button");
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/fixtures/${f.id}`, { method: "DELETE" }); await refresh(); });
    box.append(del);
    listEl.append(box);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/fixtures", { method: "POST", body: JSON.stringify({ name: document.querySelector("#name").value.trim() }) });
    form.reset();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
