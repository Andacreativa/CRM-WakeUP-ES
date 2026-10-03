import { Ban, Check, Clock, TriangleAlert, X } from "lucide-react";

// Stato VeriFactu di una fattura trasmessa da questa app
const STATI: Record<string, { cls: string; label: string; titolo: string; Icona: typeof Check }> = {
  in_coda: {
    cls: "tag-soft-warn",
    label: "In coda",
    titolo: "Il registro è pronto ma l'AEAT non l'ha ancora ricevuto",
    Icona: Clock,
  },
  accettata: {
    cls: "tag-soft-ok",
    label: "Presentata",
    titolo: "Registro accettato dall'AEAT",
    Icona: Check,
  },
  accettata_con_errori: {
    cls: "tag-soft-warn",
    label: "Con errori",
    titolo: "L'AEAT ha preso il registro ma segnala errori da correggere",
    Icona: TriangleAlert,
  },
  rifiutata: {
    cls: "tag-soft-bad",
    label: "Rifiutata",
    titolo: "L'AEAT ha rifiutato il registro: va corretto e rimandato",
    Icona: X,
  },
  annullata: {
    cls: "tag-soft-off",
    label: "Annullata",
    titolo: "Registro di annullamento accettato dall'AEAT",
    Icona: Ban,
  },
};

export default function StatoVf({ stato, soloIcona }: { stato: string | null; soloIcona?: boolean }) {
  const s = stato ? STATI[stato] : null;
  if (!s) return null;
  return (
    <span className={`tag ${s.cls} inline-flex items-center gap-1`} title={s.titolo}>
      <s.Icona className="w-3 h-3" />
      {!soloIcona && s.label}
    </span>
  );
}
