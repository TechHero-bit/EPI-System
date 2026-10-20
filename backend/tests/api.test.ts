import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
test("health é público e não depende de credenciais Supabase", async () => {
  const result = await request(app).get("/api/health");
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "ok");
  assert.equal(result.headers["cache-control"], "no-store");
});
test("endpoints administrativos exigem sessão antes de acessar o banco", async () => {
  for (const path of [
    "/api/bootstrap",
    "/api/auth/profile",
    "/api/admin/members",
    "/api/audit",
    "/api/sheets/11111111-1111-4111-8111-111111111111",
    "/api/face-match/capabilities",
  ]) {
    const result = await request(app).get(path);
    assert.equal(result.status, 401, path);
  }
  for (const path of [
    "/api/products",
    "/api/employees",
    "/api/sheets",
    "/api/lots",
    "/api/variants",
    "/api/face-match/verify",
  ])
    assert.equal((await request(app).post(path).send({})).status, 401, path);
});
test("CORS só autoriza a origem configurada e erros são JSON", async () => {
  const allowed = await request(app)
    .get("/api/health")
    .set("Origin", "http://localhost:4200");
  assert.equal(
    allowed.headers["access-control-allow-origin"],
    "http://localhost:4200",
  );
  const denied = await request(app)
    .get("/api/health")
    .set("Origin", "https://evil.example");
  assert.equal(denied.headers["access-control-allow-origin"], undefined);
  const missing = await request(app).get("/api/does-not-exist");
  assert.equal(missing.status, 404);
  assert.equal(typeof missing.body.error, "string");
});
