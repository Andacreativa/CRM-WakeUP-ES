"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAESI } from "@/lib/constants";
import { compilaTesto } from "@/lib/impostazioni";
import { MANDATO_LEGALE, LOCALE } from "@/lib/abbonamenti-testi";
import { formattaIban, ibanValido, pulisciIban } from "@/lib/sepa";
import {
  IMPOSTA_LABEL,
  LINGUE,
  type Lingua,
  MARCHI_PRODOTTO,
  PAESE_L,
  TEMI_PRODOTTO,
  importiMensili,
  nomeProdotto,
  tipoIvaSuggerito,
} from "@/components/abbonamenti/tipi";

// Modulo pubblico di sottoscrizione (es / it / en): piano, dati
// dell'intestatario, conto, contratto e mandato SEPA con due spunte. Alla
// firma l'abbonamento nasce attivo e partono le email. Con `token` è la
// firma di un abbonamento già creato da Sales (Pro, prezzi concordati).

interface PianoPub {
  codice: string;
  nome: string;
  descrizione: Record<Lingua, string | null>; // nella lingua del modulo, con lo spagnolo di riserva
  prezzo: number;
  prezzoLibero: boolean;
  tipoIva: string;
}
interface Dati {
  prodotto: string;
  piani: PianoPub[];
  creditore: { nome: string; nif: string; identificador: string; email: string; citta: string; indirizzo: string };
  giornoAddebito: number;
  inizioMeseSuccessivo: boolean;
  contratto: Record<Lingua, string>;
  firma: {
    codice: string; prodotto: string; pianoNome: string; prezzo: number; tipoIva: string; iva: number; totale: number;
    intestatario: string; nif: string | null; email: string; telefono: string | null; via: string | null; cap: string | null;
    citta: string | null; provincia: string | null; paese: string; titolareConto: string; iban: string; bic: string | null;
    lingua: string; stato: string; scaduto: boolean;
  } | null;
}

const T: Record<Lingua, Record<string, string>> = {
  es: {
    titolo: "Suscripción a {producto}",
    sotto: "Elige tu plan, indica tus datos y la cuenta de cargo, y acepta el contrato y la orden de domiciliación. La suscripción se activa al momento.",
    firmaTitolo: "Tu suscripción a {producto}",
    firmaSotto: "Revisa tus datos, indica la cuenta de cargo y acepta el contrato y la orden de domiciliación SEPA.",
    passo1: "1. Plan",
    passo2: "2. Titular",
    passo3: "3. Cuenta de cargo",
    passo4: "4. Contrato y orden de domiciliación",
    alMes: "al mes",
    masImp: "más impuestos",
    daPrezzo: "desde",
    contactanos: "Precio según presupuesto: escríbenos a {email}",
    pianoScelto: "Plan",
    intestatario: "Empresa o nombre y apellidos",
    nif: "NIF / CIF",
    email: "Correo electrónico",
    telefono: "Teléfono",
    via: "Dirección",
    cap: "Código postal",
    citta: "Localidad",
    provincia: "Provincia",
    paese: "País",
    titolareConto: "Titular de la cuenta",
    iban: "IBAN",
    bic: "BIC (opcional)",
    ibanErr: "IBAN no válido",
    riepilogo: "Resumen",
    imponibile: "Base",
    imposta: "Impuesto",
    totale: "Total al mes",
    giorno: "Cargo el día {giorno} de cada mes (o el siguiente día hábil)",
    primoMese: "Primer cargo: {mese}",
    contratto: "Contrato de suscripción",
    mandato: "Orden de domiciliación de adeudo directo SEPA (pago recurrente)",
    acreedor: "Acreedor",
    identificador: "Identificador del acreedor",
    ref: "La referencia de la orden se asigna al firmar y la recibirás por correo.",
    accettoContratto: "He leído y acepto el contrato de suscripción.",
    accettoMandato: "Autorizo a {azienda} a enviar instrucciones a mi entidad para adeudar en mi cuenta las cuotas de esta suscripción, y a mi entidad a efectuar los adeudos (orden de domiciliación SEPA).",
    firmaNota: "Al pulsar el botón, la aceptación queda registrada con fecha, hora y dirección IP, con el mismo valor que una firma.",
    bottone: "Firmar y activar la suscripción",
    inviando: "Enviando…",
    okTitolo: "¡Suscripción activada!",
    okTesto: "Hemos enviado a {email} el contrato y la orden de domiciliación en PDF. Referencia de la orden: {ref}. Nos pondremos en contacto contigo para la configuración inicial.",
    okNoMail: "Referencia de la orden: {ref}. No hemos podido enviar el correo de confirmación: te escribiremos nosotros.",
    errObbligatorio: "obligatorio",
    errEmail: "correo no válido",
    errNif: "NIF no válido",
    errIban: "IBAN no válido",
    errBic: "BIC no válido",
    errConsensi: "Marca las dos casillas para continuar.",
    errPiano: "Elige un plan.",
    errGenerico: "No se ha podido completar la suscripción. Inténtalo de nuevo o escríbenos.",
    errTroppi: "Demasiados intentos: espera unos minutos.",
    linkNonValido: "Este enlace no es válido o ya se ha utilizado.",
    linkScaduto: "Este enlace ha caducado: pídenos uno nuevo.",
    giaFirmato: "Esta suscripción ya está firmada. Gracias.",
    caricamento: "Cargando…",
    lingua: "Idioma",
    per: "Servicio prestado por",
  },
  it: {
    titolo: "Abbonamento a {producto}",
    sotto: "Scegli il piano, inserisci i tuoi dati e il conto da addebitare, accetta il contratto e il mandato. L'abbonamento si attiva subito.",
    firmaTitolo: "Il tuo abbonamento a {producto}",
    firmaSotto: "Controlla i tuoi dati, indica il conto da addebitare e accetta il contratto e il mandato SEPA.",
    passo1: "1. Piano",
    passo2: "2. Intestatario",
    passo3: "3. Conto da addebitare",
    passo4: "4. Contratto e mandato",
    alMes: "al mese",
    masImp: "più imposte",
    daPrezzo: "da",
    contactanos: "Prezzo su preventivo: scrivici a {email}",
    pianoScelto: "Piano",
    intestatario: "Azienda oppure nome e cognome",
    nif: "P.IVA / NIF",
    email: "Email",
    telefono: "Telefono",
    via: "Indirizzo",
    cap: "CAP",
    citta: "Città",
    provincia: "Provincia",
    paese: "Paese",
    titolareConto: "Titolare del conto",
    iban: "IBAN",
    bic: "BIC (facoltativo)",
    ibanErr: "IBAN non valido",
    riepilogo: "Riepilogo",
    imponibile: "Imponibile",
    imposta: "Imposta",
    totale: "Totale al mese",
    giorno: "Addebito il giorno {giorno} di ogni mese (o il primo giorno lavorativo dopo)",
    primoMese: "Primo addebito: {mese}",
    contratto: "Contratto di abbonamento",
    mandato: "Mandato per addebito diretto SEPA (pagamento ricorrente)",
    acreedor: "Creditore",
    identificador: "Codice identificativo del creditore",
    ref: "Il riferimento del mandato viene assegnato alla firma e lo ricevi per email.",
    accettoContratto: "Ho letto e accetto il contratto di abbonamento.",
    accettoMandato: "Autorizzo {azienda} a disporre sul mio conto l'addebito delle quote di questo abbonamento e la mia banca a eseguirlo (mandato SEPA).",
    firmaNota: "Premendo il bottone l'accettazione viene registrata con data, ora e indirizzo IP, con lo stesso valore di una firma.",
    bottone: "Firma e attiva l'abbonamento",
    inviando: "Invio…",
    okTitolo: "Abbonamento attivato!",
    okTesto: "Abbiamo mandato a {email} il contratto e il mandato in PDF. Riferimento del mandato: {ref}. Ti contatteremo per la configurazione iniziale.",
    okNoMail: "Riferimento del mandato: {ref}. Non siamo riusciti a mandare l'email di conferma: ti scriveremo noi.",
    errObbligatorio: "obbligatorio",
    errEmail: "email non valida",
    errNif: "NIF non valido",
    errIban: "IBAN non valido",
    errBic: "BIC non valido",
    errConsensi: "Spunta le due caselle per continuare.",
    errPiano: "Scegli un piano.",
    errGenerico: "Non siamo riusciti a completare l'abbonamento. Riprova o scrivici.",
    errTroppi: "Troppi tentativi: aspetta qualche minuto.",
    linkNonValido: "Questo link non è valido o è già stato usato.",
    linkScaduto: "Questo link è scaduto: chiedicene uno nuovo.",
    giaFirmato: "Questo abbonamento è già firmato. Grazie.",
    caricamento: "Caricamento…",
    lingua: "Lingua",
    per: "Servizio erogato da",
  },
  en: {
    titolo: "Subscribe to {producto}",
    sotto: "Choose your plan, enter your details and the account to be debited, and accept the agreement and the mandate. The subscription is activated right away.",
    firmaTitolo: "Your {producto} subscription",
    firmaSotto: "Check your details, enter the account to be debited and accept the agreement and the SEPA mandate.",
    passo1: "1. Plan",
    passo2: "2. Account holder",
    passo3: "3. Bank account",
    passo4: "4. Agreement and mandate",
    alMes: "per month",
    masImp: "plus taxes",
    daPrezzo: "from",
    contactanos: "Price on quote: write to {email}",
    pianoScelto: "Plan",
    intestatario: "Company or full name",
    nif: "Tax ID",
    email: "Email",
    telefono: "Phone",
    via: "Address",
    cap: "Postal code",
    citta: "City",
    provincia: "Province",
    paese: "Country",
    titolareConto: "Account holder",
    iban: "IBAN",
    bic: "BIC (optional)",
    ibanErr: "Invalid IBAN",
    riepilogo: "Summary",
    imponibile: "Net",
    imposta: "Tax",
    totale: "Total per month",
    giorno: "Debited on day {giorno} of each month (or the next business day)",
    primoMese: "First debit: {mese}",
    contratto: "Subscription agreement",
    mandato: "SEPA direct debit mandate (recurrent payment)",
    acreedor: "Creditor",
    identificador: "Creditor identifier",
    ref: "The mandate reference is assigned when you sign and sent to you by email.",
    accettoContratto: "I have read and accept the subscription agreement.",
    accettoMandato: "I authorise {azienda} to send instructions to my bank to debit the fees of this subscription from my account, and my bank to debit my account (SEPA mandate).",
    firmaNota: "By pressing the button your acceptance is recorded with date, time and IP address, with the same value as a signature.",
    bottone: "Sign and activate the subscription",
    inviando: "Sending…",
    okTitolo: "Subscription activated!",
    okTesto: "We have sent the agreement and the mandate as PDF to {email}. Mandate reference: {ref}. We will get in touch to arrange the initial set-up.",
    okNoMail: "Mandate reference: {ref}. We could not send the confirmation email: we will contact you.",
    errObbligatorio: "required",
    errEmail: "invalid email",
    errNif: "invalid tax ID",
    errIban: "invalid IBAN",
    errBic: "invalid BIC",
    errConsensi: "Tick both boxes to continue.",
    errPiano: "Choose a plan.",
    errGenerico: "We could not complete the subscription. Please try again or contact us.",
    errTroppi: "Too many attempts: please wait a few minutes.",
    linkNonValido: "This link is not valid or has already been used.",
    linkScaduto: "This link has expired: ask us for a new one.",
    giaFirmato: "This subscription is already signed. Thank you.",
    caricamento: "Loading…",
    lingua: "Language",
    per: "Service provided by",
  },
};

const euro = (n: number, l: Lingua) => `${n.toLocaleString(LOCALE[l], { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

export default function FormSuscripcion({
  prodotto,
  linguaIniziale,
  pianoIniziale,
  token,
}: {
  prodotto: string | null;
  linguaIniziale: Lingua | null;
  pianoIniziale: string | null;
  token: string | null;
}) {
  const [lingua, setLingua] = useState<Lingua>(linguaIniziale ?? "es");
  const [dati, setDati] = useState<Dati | null>(null);
  const [erroreCarico, setErroreCarico] = useState<string | null>(null);
  const [piano, setPiano] = useState<string>(pianoIniziale ?? "");
  const [form, setForm] = useState({
    intestatario: "", nif: "", email: "", telefono: "", via: "", cap: "", citta: "", provincia: "", paese: "Spagna",
    titolareConto: "", iban: "", bic: "", sitio_web: "",
  });
  const [accettoContratto, setAccettoContratto] = useState(false);
  const [accettoMandato, setAccettoMandato] = useState(false);
  const [errori, setErrori] = useState<Record<string, string>>({});
  const [erroreGen, setErroreGen] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState<{ codice: string; mandatoRef: string; email: string; emailInviata: boolean } | null>(null);
  const t = (k: string, v: Record<string, string> = {}) => compilaTesto(T[lingua][k] ?? k, v);

  useEffect(() => {
    const url = token ? `/api/public/suscripcion?token=${encodeURIComponent(token)}` : `/api/public/suscripcion?prodotto=${prodotto}`;
    fetch(url)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "errore");
        return j as Dati;
      })
      .then((d) => {
        setDati(d);
        if (d.firma) {
          const f = d.firma;
          if (!linguaIniziale) setLingua((f.lingua as Lingua) || "es");
          setForm((x) => ({
            ...x,
            intestatario: f.intestatario, nif: f.nif ?? "", email: f.email, telefono: f.telefono ?? "", via: f.via ?? "",
            cap: f.cap ?? "", citta: f.citta ?? "", provincia: f.provincia ?? "", paese: f.paese, titolareConto: f.titolareConto || f.intestatario,
            iban: f.iban ? formattaIban(f.iban) : "", bic: f.bic ?? "",
          }));
        }
      })
      .catch((e) => setErroreCarico(e.message));
  }, [prodotto, token, linguaIniziale]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const pianoSel = useMemo(() => dati?.piani.find((p) => p.codice === piano) ?? null, [dati, piano]);
  const firma = dati?.firma ?? null;
  const prodottoChiave = firma?.prodotto ?? dati?.prodotto ?? prodotto ?? "";
  const prodottoNome = nomeProdotto(prodottoChiave);
  const tema = TEMI_PRODOTTO[prodottoChiave] as React.CSSProperties | undefined;
  const marchio = MARCHI_PRODOTTO[prodottoChiave];
  useEffect(() => {
    if (prodottoNome) document.title = `${prodottoNome} · ${lingua === "it" ? "Abbonamento" : lingua === "en" ? "Subscription" : "Suscripción"}`;
  }, [prodottoNome, lingua]);

  // Importi: dal piano scelto (modulo) o dall'abbonamento creato da Sales (firma)
  const importi = useMemo(() => {
    if (firma) return { prezzo: firma.prezzo, tipoIva: firma.tipoIva, iva: firma.iva, totale: firma.totale };
    if (!pianoSel) return null;
    return importiMensili(pianoSel.prezzo, tipoIvaSuggerito(form.paese, form.cap, pianoSel.tipoIva));
  }, [firma, pianoSel, form.paese, form.cap]);

  const primoMese = useMemo(() => {
    if (!dati) return "";
    const d = new Date();
    const m = d.getMonth() + (dati.inizioMeseSuccessivo ? 1 : 0);
    const x = new Date(d.getFullYear(), m, 1);
    return x.toLocaleDateString(LOCALE[lingua], { month: "long", year: "numeric" });
  }, [dati, lingua]);

  const testoContratto = useMemo(() => {
    if (!dati || !importi) return "";
    return compilaTesto(dati.contratto[lingua], {
      prodotto: prodottoNome,
      piano: firma?.pianoNome ?? pianoSel?.nome ?? "",
      prezzo: importi.prezzo.toLocaleString(LOCALE[lingua], { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      imposta: IMPOSTA_LABEL[lingua][importi.tipoIva] ?? "",
      totale: importi.totale.toLocaleString(LOCALE[lingua], { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      giornoAddebito: String(dati.giornoAddebito),
      azienda: dati.creditore.nome,
      nif: dati.creditore.nif,
      indirizzo: dati.creditore.indirizzo,
      email: dati.creditore.email,
      intestatario: form.intestatario || "…",
      nifCliente: form.nif || "—",
      data: new Date().toLocaleDateString(LOCALE[lingua], { day: "2-digit", month: "long", year: "numeric" }),
    });
  }, [dati, importi, lingua, prodottoNome, firma, pianoSel, form.intestatario, form.nif]);

  const ibanOk = !form.iban.trim() || ibanValido(form.iban);

  const invia = async () => {
    setErroreGen(null);
    setErrori({});
    if (!firma && !pianoSel) return setErroreGen(t("errPiano"));
    if (!accettoContratto || !accettoMandato) return setErroreGen(t("errConsensi"));
    const locali: Record<string, string> = {};
    if (!form.intestatario.trim()) locali.intestatario = t("errObbligatorio");
    if (!form.email.trim()) locali.email = t("errObbligatorio");
    if (!form.titolareConto.trim()) locali.titolareConto = t("errObbligatorio");
    if (!pulisciIban(form.iban)) locali.iban = t("errObbligatorio");
    else if (!ibanValido(form.iban)) locali.iban = t("errIban");
    if (form.paese === "Spagna" && !form.nif.trim()) locali.nif = t("errObbligatorio");
    if (Object.keys(locali).length) return setErrori(locali);
    setInvio(true);
    try {
      const res = await fetch("/api/public/suscripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          iban: pulisciIban(form.iban),
          prodotto: dati?.prodotto,
          pianoCodice: piano,
          lingua,
          token: token ?? undefined,
          accettoContratto,
          accettoMandato,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) return setErroreGen(t("errTroppi"));
        if (j.error === "link_non_valido") return setErroreGen(t("linkNonValido"));
        if (j.error === "Link scaduto") return setErroreGen(t("linkScaduto"));
        if (j.error === "Abbonamento già firmato") return setErroreGen(t("giaFirmato"));
        if (Array.isArray(j.errori) && j.errori.length) {
          const m: Record<string, string> = {};
          for (const e of j.errori as { campo: string; codice: string }[]) {
            m[e.campo] = t(e.codice === "obbligatorio" ? "errObbligatorio" : e.codice === "email" ? "errEmail" : e.codice === "nif" ? "errNif" : e.codice === "iban" ? "errIban" : "errBic");
          }
          return setErrori(m);
        }
        return setErroreGen(t("errGenerico"));
      }
      setFatto(j);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErroreGen(t("errGenerico"));
    } finally {
      setInvio(false);
    }
  };

  // Funzioni, non componenti annidati: così i campi non perdono il focus a ogni tasto
  const testata = () => (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
      <div className="flex items-center gap-3">
        {!marchio && (
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-brand text-white font-bold text-lg">{prodottoNome.slice(0, 1)}</span>
        )}
        <div>
          {marchio ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marchio.logo} alt={prodottoNome} className="h-9 w-auto mb-1" />
          ) : (
            <div className="text-lg font-bold leading-tight">{prodottoNome}</div>
          )}
          <div className="text-[11px] text-gray-500">
            {t("per")} {dati?.creditore.nome ?? "Anda Agencia de Publicidad SL"}
          </div>
        </div>
      </div>
      <div className="pills">
        {LINGUE.map((l) => (
          <button key={l.value} type="button" className={lingua === l.value ? "active" : undefined} onClick={() => setLingua(l.value)} aria-label={l.label}>
            {l.value.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );

  if (erroreCarico) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10" style={tema}>
        {testata()}
        <div className="glass-card rounded-2xl p-8 text-center text-sm text-gray-700">{erroreCarico === "link_non_valido" ? t("linkNonValido") : t("errGenerico")}</div>
      </div>
    );
  }
  if (!dati) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center text-sm text-gray-400" style={tema}>
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> {t("caricamento")}
      </div>
    );
  }
  if (fatto) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10" style={tema}>
        {testata()}
        <div className="glass-card rounded-2xl p-8 text-center space-y-3">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ok/15 text-ok">
            <Check className="w-7 h-7" />
          </span>
          <h1 className="text-xl font-bold">{t("okTitolo")}</h1>
          <p className="text-sm text-gray-700">{fatto.emailInviata ? t("okTesto", { email: fatto.email, ref: fatto.mandatoRef }) : t("okNoMail", { ref: fatto.mandatoRef })}</p>
        </div>
      </div>
    );
  }
  if (firma && (firma.stato !== "in_attesa" || firma.scaduto)) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10" style={tema}>
        {testata()}
        <div className="glass-card rounded-2xl p-8 text-center text-sm text-gray-700">{firma.scaduto && firma.stato === "in_attesa" ? t("linkScaduto") : t("giaFirmato")}</div>
      </div>
    );
  }

  const campo = (k: keyof typeof form, label: string, o: { type?: string; span?: number; mono?: boolean; auto?: string } = {}) => (
    <div key={k} className={o.span === 2 ? "md:col-span-2" : undefined}>
      <label className={labelCls}>{label}</label>
      <input
        type={o.type ?? "text"}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        autoComplete={o.auto}
        className={cn(inputCls, o.mono && "font-mono", errori[k] && "border-bad")}
      />
      {errori[k] && <p className="text-[11px] text-bad mt-1">{errori[k]}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" style={tema}>
      {testata()}
      <h1 className="text-2xl font-bold mb-1">{firma ? t("firmaTitolo", { producto: prodottoNome }) : t("titolo", { producto: prodottoNome })}</h1>
      <p className="text-sm text-gray-600 mb-6">{firma ? t("firmaSotto") : t("sotto")}</p>

      <div className="space-y-5">
        {/* 1. Piano */}
        <section className="glass-card rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-3">{t("passo1")}</h2>
          {firma ? (
            <div className="rounded-xl border border-brand bg-brand/5 p-4">
              <div className="text-sm font-bold">{firma.pianoNome}</div>
              <div className="text-2xl font-bold mt-1">
                {euro(firma.prezzo, lingua)} <span className="text-sm font-normal text-gray-500">{t("alMes")} + {IMPOSTA_LABEL[lingua][firma.tipoIva]}</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {dati.piani.map((p) => {
                const active = piano === p.codice;
                return (
                  <button
                    key={p.codice}
                    type="button"
                    disabled={p.prezzoLibero}
                    onClick={() => setPiano(p.codice)}
                    className={cn("text-left rounded-xl border p-4 transition-all disabled:cursor-default", active ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-gray-200 bg-white hover:border-gray-300", p.prezzoLibero && "opacity-80")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">{p.nome}</span>
                      {active && <Check className="w-4 h-4 text-brand" />}
                    </div>
                    <div className="text-xl font-bold mt-1">
                      {p.prezzoLibero && <span className="text-xs font-normal text-gray-500 mr-1">{t("daPrezzo")}</span>}
                      {euro(p.prezzo, lingua)} <span className="text-xs font-normal text-gray-500">{t("alMes")}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">{t("masImp")}</div>
                    {(p.descrizione[lingua] || p.descrizione.es) && (
                      <p className="text-xs text-gray-600 mt-2 leading-snug">{p.descrizione[lingua] || p.descrizione.es}</p>
                    )}
                    {p.prezzoLibero && (
                      <p className="text-[11px] text-brand mt-2">
                        {t("contactanos", { email: dati.creditore.email })}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* 2. Intestatario */}
        <section className="glass-card rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-3">{t("passo2")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {campo("intestatario", t("intestatario"), { auto: "organization" })}
            {campo("nif", t("nif"), { mono: true })}
            {campo("email", t("email"), { type: "email", auto: "email" })}
            {campo("telefono", t("telefono"), { type: "tel", auto: "tel" })}
            {campo("via", t("via"), { span: 2, auto: "street-address" })}
            {campo("cap", t("cap"), { auto: "postal-code" })}
            {campo("citta", t("citta"), { auto: "address-level2" })}
            {campo("provincia", t("provincia"), { auto: "address-level1" })}
            <div>
              <label className={labelCls}>{t("paese")}</label>
              <select value={form.paese} onChange={(e) => set("paese", e.target.value)} className={inputCls}>
                {PAESI.map((p) => (
                  <option key={p} value={p}>
                    {PAESE_L[lingua][p] ?? p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* 3. Conto */}
        <section className="glass-card rounded-2xl p-5">
          <h2 className="text-sm font-bold mb-3">{t("passo3")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{t("titolareConto")}</label>
              <input value={form.titolareConto} onChange={(e) => set("titolareConto", e.target.value)} onFocus={() => !form.titolareConto && set("titolareConto", form.intestatario)} className={cn(inputCls, errori.titolareConto && "border-bad")} />
              {errori.titolareConto && <p className="text-[11px] text-bad mt-1">{errori.titolareConto}</p>}
            </div>
            <div>
              <label className={labelCls}>{t("iban")}</label>
              <input
                value={form.iban}
                onChange={(e) => set("iban", e.target.value)}
                onBlur={() => set("iban", form.iban.trim() ? formattaIban(form.iban) : "")}
                className={cn(inputCls, "font-mono", (!ibanOk || errori.iban) && "border-bad")}
                placeholder="ES00 0000 0000 0000 0000 0000"
                inputMode="text"
                autoComplete="off"
              />
              {(errori.iban || !ibanOk) && <p className="text-[11px] text-bad mt-1">{errori.iban ?? t("ibanErr")}</p>}
            </div>
            {campo("bic", t("bic"), { mono: true })}
          </div>
          {/* campo trappola per i bot: invisibile */}
          <div className="absolute -left-[9999px] top-0" aria-hidden="true">
            <label>
              Website
              <input value={form.sitio_web} onChange={(e) => set("sitio_web", e.target.value)} tabIndex={-1} autoComplete="off" />
            </label>
          </div>
        </section>

        {/* 4. Contratto e mandato */}
        <section className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold">{t("passo4")}</h2>
          {importi ? (
            <div className="rounded-xl bg-gray-50 p-4 text-sm">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t("riepilogo")}</div>
              <div className="flex justify-between">
                <span>
                  {t("pianoScelto")}: {firma?.pianoNome ?? pianoSel?.nome}
                </span>
                <span>{euro(importi.prezzo, lingua)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>
                  {t("imposta")}: {IMPOSTA_LABEL[lingua][importi.tipoIva]}
                </span>
                <span>{euro(importi.totale - importi.prezzo, lingua)}</span>
              </div>
              <div className="flex justify-between font-bold text-base mt-1 pt-1 border-t border-gray-200">
                <span>{t("totale")}</span>
                <span>{euro(importi.totale, lingua)}</span>
              </div>
              <div className="text-[11px] text-gray-500 mt-2">
                {t("giorno", { giorno: String(dati.giornoAddebito) })} · {t("primoMese", { mese: primoMese })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">{t("errPiano")}</p>
          )}

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("contratto")}</div>
            <pre className="text-[12px] leading-relaxed whitespace-pre-wrap font-sans bg-white border border-gray-200 rounded-lg p-3 max-h-64 overflow-y-auto text-gray-700">{testoContratto || "…"}</pre>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("mandato")}</div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 text-[12px] text-gray-700 space-y-1">
              <div>
                <strong>{t("acreedor")}:</strong> {dati.creditore.nome} · NIF {dati.creditore.nif} · {dati.creditore.indirizzo}
              </div>
              <div>
                <strong>{t("identificador")}:</strong> <span className="font-mono">{dati.creditore.identificador}</span>
              </div>
              <div className="text-gray-500">{t("ref")}</div>
              <p className="pt-2 leading-relaxed">{MANDATO_LEGALE[lingua]}</p>
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={accettoContratto} onChange={(e) => setAccettoContratto(e.target.checked)} className="mt-1" />
            <span>{t("accettoContratto")}</span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={accettoMandato} onChange={(e) => setAccettoMandato(e.target.checked)} className="mt-1" />
            <span>{t("accettoMandato", { azienda: dati.creditore.nome })}</span>
          </label>

          {erroreGen && <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">{erroreGen}</div>}

          <button type="button" onClick={invia} disabled={invio} className="btn btn-primary w-full h-11 text-base disabled:opacity-60">
            {invio ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {invio ? t("inviando") : t("bottone")}
          </button>
          <p className="text-[11px] text-gray-500 text-center">{t("firmaNota")}</p>
        </section>
      </div>
    </div>
  );
}
