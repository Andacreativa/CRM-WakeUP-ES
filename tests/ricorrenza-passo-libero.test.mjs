// Prova delle ricorrenze «semestrale» e «Ogni N mesi» delle richieste di
// fattura (lib/richieste.ts): date delle rate, tetti, passo libero rifiutato
// quando manca o è fuori 2-24. Non usa il database.
//
// Uso:  node --experimental-strip-types --disable-warning=ExperimentalWarning \
//         --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
//         tests/ricorrenza-passo-libero.test.mjs
import assert from "node:assert/strict";
import {
  aggiungiMesi,
  avanzaMese,
  leggiRicorrenza,
  regoleRicorrenze,
  tettoRate,
} from "../lib/richieste.ts";

const gg = (d) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
// Come la route: rata i = prima data + passo × i mesi (sempre dalla prima)
const rate = (prima, passo, n) =>
  Array.from({ length: n }, (_, i) => gg(i ? aggiungiMesi(new Date(prima), passo * i) : new Date(prima)));

let ok = 0;
const prova = (nome, fn) => {
  fn();
  ok++;
  console.log(`  ✓ ${nome}`);
};

console.log("Date delle rate");
prova("30/10/2026, ogni 4 mesi, 4 rate (esempio della richiesta)", () => {
  const r = rate("2026-10-30", 4, 4);
  console.log("     ", r.join(", "));
  assert.deepEqual(r, ["30/10/2026", "28/02/2027", "30/06/2027", "30/10/2027"]);
});
prova("mensile dal 31/01: ultimo del mese, poi si torna al 31", () => {
  assert.deepEqual(rate("2027-01-31", 1, 4), ["31/01/2027", "28/02/2027", "31/03/2027", "30/04/2027"]);
});
prova("anno bisestile: 31/12/2027 + 2 mesi = 29/02/2028", () => {
  assert.equal(gg(aggiungiMesi(new Date("2027-12-31"), 2)), "29/02/2028");
});
prova("semestrale dal 31/08/2026", () => {
  assert.deepEqual(rate("2026-08-31", 6, 3), ["31/08/2026", "28/02/2027", "31/08/2027"]);
});
prova("il vecchio calcolo (setMonth) scivolava al mese dopo: ora no", () => {
  const vecchio = new Date("2026-10-30");
  vecchio.setUTCMonth(vecchio.getUTCMonth() + 4);
  assert.equal(gg(vecchio), "02/03/2027");
  assert.equal(gg(aggiungiMesi(new Date("2026-10-30"), 4)), "28/02/2027");
});
prova("mese di competenza delle rate con passo 4", () => {
  const m = [0, 1, 2, 3].map((i) => avanzaMese(10, 2026, 4 * i)).map((p) => `${p.mese}/${p.anno}`);
  assert.deepEqual(m, ["10/2026", "2/2027", "6/2027", "10/2027"]);
});

console.log("Tetti");
prova("semestrale 6, standard 36 come prima, una tantum 1", () => {
  assert.equal(tettoRate("semestrale", 6), 6);
  for (const [r, p] of [["mensile", 1], ["trimestrale", 3], ["annuale", 12]]) assert.equal(tettoRate(r, p), 36);
  assert.equal(tettoRate("una_tantum", 0), 1);
});
prova("passo libero: ogni 4 → 9, ogni 18 → 6, ogni 2 → 18, 11 → 3, 12 → 10, 24 → 5", () => {
  const t = (n) => tettoRate("personalizzata", n);
  assert.deepEqual([t(4), t(18), t(2), t(11), t(12), t(24)], [9, 6, 18, 3, 10, 5]);
});
prova("le regole per la pagina vengono dalla stessa funzione", () => {
  const g = regoleRicorrenze();
  assert.equal(g.fisse.semestrale.tetto, 6);
  assert.equal(g.fisse.semestrale.passo, 6);
  assert.equal(g.libera.tetti["4"], 9);
  assert.equal(g.libera.tetti["18"], 6);
  assert.deepEqual([g.libera.min, g.libera.max, g.libera.iniziale, g.libera.valore], [2, 24, 4, "personalizzata"]);
  assert.equal(Object.keys(g.libera.tetti).length, 23);
});

console.log("Il server non si fida del browser");
prova("personalizzata con passo valido", () => {
  assert.deepEqual(leggiRicorrenza("personalizzata", "4"), { ok: true, ricorrenza: "personalizzata", passo: 4, passoMesi: 4 });
  assert.equal(leggiRicorrenza("personalizzata", 24).ok, true);
  assert.equal(leggiRicorrenza("personalizzata", 2).ok, true);
});
prova("personalizzata con passo mancante o sbagliato: errore, mai un passo inventato", () => {
  for (const v of [undefined, null, "", "abc", 1, 25, 0, -4, 4.5, "4.5", true]) {
    const r = leggiRicorrenza("personalizzata", v);
    assert.equal(r.ok, false, `passo ${JSON.stringify(v)} doveva essere rifiutato`);
  }
});
prova("standard: passo fisso, passoMesi mai salvato; valore sconosciuto = una tantum come prima", () => {
  assert.deepEqual(leggiRicorrenza("semestrale", 9), { ok: true, ricorrenza: "semestrale", passo: 6, passoMesi: null });
  assert.deepEqual(leggiRicorrenza("mensile", undefined), { ok: true, ricorrenza: "mensile", passo: 1, passoMesi: null });
  assert.deepEqual(leggiRicorrenza("boh", 4), { ok: true, ricorrenza: "una_tantum", passo: 0, passoMesi: null });
});

console.log(`\n${ok} prove superate`);
