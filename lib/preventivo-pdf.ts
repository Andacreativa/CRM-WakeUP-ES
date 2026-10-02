import { exportPreventivoPDF } from "./export";
import { linguaDi, type Preventivo } from "@/components/preventivi/tipi";

// PDF del preventivo nella sua lingua: per spagnolo e inglese i testi
// passano prima dalla traduzione automatica (ripiego: testo originale).
export async function scaricaPreventivoPDF(p: Preventivo) {
  const lingua = linguaDi(p);
  let oggetto = p.oggetto;
  let vociJson = p.voci;
  let condizioni = p.condizioni;
  let note = p.note;

  if (lingua !== "it") {
    try {
      const vociParsed = JSON.parse(p.voci);
      const res = await fetch("/api/translate-preventivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLang: lingua,
          oggetto: p.oggetto,
          condizioni: p.condizioni ?? "",
          note: p.note ?? "",
          voci: vociParsed,
        }),
      });
      if (res.ok) {
        const t = await res.json();
        oggetto = t.oggetto ?? oggetto;
        condizioni = t.condizioni ?? condizioni;
        note = t.note ?? note;
        vociJson = JSON.stringify(t.voci ?? vociParsed);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(
          `Traduzione fallita (${res.status}): ${err.error ?? "errore"}\nPDF generato con testo originale.`,
        );
      }
    } catch (e) {
      console.error("[scaricaPreventivoPDF] traduzione:", e);
      alert(
        "Errore traduzione. PDF generato con testo originale.\n" +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  await exportPreventivoPDF({
    numero: p.numero,
    nomeCliente: p.nomeCliente,
    emailCliente: p.emailCliente,
    aziendaCliente: p.aziendaCliente,
    azienda: p.azienda,
    oggetto,
    voci: vociJson,
    iva: p.iva,
    subtotale: p.subtotale,
    totale: p.totale,
    condizioni,
    note,
    createdAt: p.createdAt,
    lingua,
  });
}
