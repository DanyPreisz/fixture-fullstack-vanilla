import { URL } from "node:url";
import { connect, fixtures, isReady, mapFixture, toId, users } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    return sendJson(res, 200, { user });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/fixtures") {
    const rows = await fixtures().find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();
    return sendJson(res, 200, { fixtures: rows.map(mapFixture) });
  }
  if (method === "POST" && pathname === "/api/fixtures") {
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    if (!name) return sendJson(res, 400, { error: "El nombre es obligatorio" });
    const result = await fixtures().insertOne({ userId, name: name.slice(0, 40), matches: [], createdAt: new Date() });
    return sendJson(res, 201, { fixture: mapFixture(await fixtures().findOne({ _id: result.insertedId })) });
  }
  const matchAdd = pathname.match(/^\/api\/fixtures\/([a-fA-F0-9]{24})\/match$/);
  if (matchAdd && method === "POST") {
    const body = await readJson(req);
    const home = String(body.home || "").trim();
    const away = String(body.away || "").trim();
    const hs = Number(body.homeScore);
    const as = Number(body.awayScore);
    if (!home || !away) return sendJson(res, 400, { error: "Equipos obligatorios" });
    const result = await fixtures().updateOne({ _id: toId(matchAdd[1]), userId }, { $push: { matches: { home, away, homeScore: Number.isNaN(hs) ? null : hs, awayScore: Number.isNaN(as) ? null : as } } });
    if (!result.matchedCount) return sendJson(res, 404, { error: "Fixture no encontrado" });
    return sendJson(res, 200, { fixture: mapFixture(await fixtures().findOne({ _id: toId(matchAdd[1]) })) });
  }
  const del = pathname.match(/^\/api\/fixtures\/([a-fA-F0-9]{24})$/);
  if (del && method === "DELETE") {
    const result = await fixtures().deleteOne({ _id: toId(del[1]), userId });
    if (!result.deletedCount) return sendJson(res, 404, { error: "Fixture no encontrado" });
    return sendEmpty(res, 204);
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Fixture en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
