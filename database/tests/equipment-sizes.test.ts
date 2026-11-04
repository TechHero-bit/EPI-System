import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { SIZE_GROUPS } from "../../contracts/equipment-sizes.mjs";
import { equipmentSizeSchema } from "../../Backend/src/schemas/equipment-size.schema.js";

test("API e banco aceitam o mesmo catálogo e recusam texto livre e tamanhos fora da faixa", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table public.variants(size text not null)");
    await db.exec(
      await readFile(
        "database/supabase/migrations/009_standard_equipment_sizes.sql",
        "utf8",
      ),
    );
    for (const size of SIZE_GROUPS.flatMap((group) => [...group.sizes])) {
      assert.equal(equipmentSizeSchema.parse(size), size);
      await db.query("insert into variants(size) values($1)", [size]);
    }
    for (const size of [
      "",
      "Médio",
      "m",
      "unico",
      "40,5",
      "01",
      "0",
      "71",
      "999",
      "G ",
    ]) {
      assert.equal(equipmentSizeSchema.safeParse(size).success, false, size);
      await assert.rejects(
        db.query("insert into variants(size) values($1)", [size]),
        /variants_standard_size/,
      );
    }
  } finally {
    await db.close();
  }
});
