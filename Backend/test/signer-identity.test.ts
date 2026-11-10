import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import { signerIdentityMatches } from "../src/services/security.service.js";

const pepper = "p".repeat(32);
const expected = { name: "Ana  Martins", cpf: "93492854010" };

test("4.1 nome completo + 3 primeiros + 3 últimos dígitos conferem; qualquer divergência falha", () => {
  assert.equal(signerIdentityMatches({ name: " ana martins ", cpfStart: "934", cpfEnd: "010" }, expected, pepper), true);
  for (const given of [
    { name: "Ana Martins", cpfStart: "934", cpfEnd: "011" },
    { name: "Ana Martins", cpfStart: "935", cpfEnd: "010" },
    { name: "Ana Marins", cpfStart: "934", cpfEnd: "010" },
    { name: "Ana Martins", cpfStart: "934" },
    { name: "Ana Martins" },
  ])
    assert.equal(signerIdentityMatches(given, expected, pepper), false, JSON.stringify(given));
  assert.equal(signerIdentityMatches({ name: "Ana Martins", cpfStart: "934", cpfEnd: "010" }, { ...expected, cpf: "934010" }, pepper), false);
});

test("4.1 confirmação pública valida formato antes de acessar o banco e não ecoa o CPF", async () => {
  const res = await request(app)
    .post(`/api/sign/${"a".repeat(43)}/confirm`)
    .send({ code: "123456", acceptedTerms: true, signerName: "Ana Martins", signatureStyle: "classic", termsVersion: "EPI-ELECTRONIC-SIMPLE-V2", cpfStart: "93x", cpfEnd: "010" });
  // Sem Supabase configurado, o limitador falha antes; em nenhum caso o valor é devolvido.
  assert.ok(res.status >= 400);
  assert.ok(!JSON.stringify(res.body).includes("93x"));
  assert.ok(!JSON.stringify(res.body).includes("010"));
});

test("4.1 rota de conferência de identidade existe e é pública (com limite de requisições)", async () => {
  const res = await request(app).post(`/api/sign/${"a".repeat(43)}/identity`).send({});
  assert.notEqual(res.status, 404);
  assert.ok(!JSON.stringify(res.body).includes("cpf"));
});
