"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Check, FileText, Loader2, LogOut, Pencil, RefreshCw, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { compilaTesto } from "@/lib/impostazioni";
import { LOCALE, MANDATO_LEGALE, MESI_L } from "@/lib/abbonamenti-testi";
import { formattaIban, ibanValido, pulisciIban } from "@/lib/sepa";
import { IMPOSTA_LABEL, LINGUE, TEMI_PRODOTTO, type Lingua, linguaValida, nomePaese, nomeProdotto } from "@/components/abbonamenti/tipi";

// Area cliente degli abbonati (es / it / en): entra dal link delle email o
// chiedendo un link con la propria email (niente password). Mostra ogni
// abbonamento legato all'email: piano, prossimo addebito, mandato con PDF,
// conto mascherato, fatture da scaricare. Il cliente può correggere i dati
// di contatto e cambiare il conto firmando un nuovo mandato.

interface FatturaArea {
  id: number;
  numero: string | null;
  data: string | null;
  anno: number;
  mese: number;
  importo: number;
  stato: "pagata" | "pendiente" | "devuelta";
  dataAddebito: string | null;
}
interface Abb {
  id: number;
  codice: string;
  prodotto: string;
  pianoNome: string;
  prezzo: number;
  tipoIva: string;
  iva: number;
  totale: number;
  intestatario: string;
  nif: string | null;
  email: string;
  telefono: string | null;
  via: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  paese: string;
  titolareConto: string;
  iban: string; // mascherato
  bic: string | null;
  mandatoRef: string;
  mandatoFirmatoIl: string | null;
  lingua: string;
  stato: string;
  dataInizio: string | null;
  dataFine: string | null;
  prossimoAddebito: string | null;
  fatture: FatturaArea[];
  mandatiPrecedenti: { mandatoRef: string; iban: string; firmatoIl: string | null; sostituitoIl: string }[];
}
interface Dati {
  email: string;
  giornoAddebito: number;
  creditore: { nome: string; nif: string; identificador: string; email: string; citta: string; indirizzo: string };
  abbonamenti: Abb[];
}

const T: Record<Lingua, Record<string, string>> = {
  es: {
    titolo: "Área de cliente",
    per: "Servicio prestado por",
    loginSotto: "Introduce el correo electrónico de tu suscripción: te enviaremos un enlace para entrar, sin contraseña.",
    email: "Correo electrónico",
    entra: "Enviarme el enlace de acceso",
    inviando: "Enviando…",
    linkInviato: "Si hay una suscripción con este correo, en unos minutos recibirás un enlace de acceso válido durante 60 minutos. Revisa también la carpeta de spam.",
    errLink: "El enlace no es válido o ha caducado: pide uno nuevo.",
    errEmail: "Correo no válido.",
    errTroppi: "Demasiados intentos: espera unos minutos.",
    errGenerico: "No se ha podido completar la operación. Inténtalo de nuevo o escríbenos.",
    esci: "Salir",
    connesso: "Conectado como",
    nessuno: "No hay suscripciones asociadas a {email}. Si te has suscrito con otro correo, sal y pide el enlace con ese correo.",
    piano: "Plan",
    alMes: "al mes",
    statoAttivo: "Activa",
    statoSospeso: "Suspendida",
    statoCancellato: "Cancelada",
    desde: "Desde",
    prossimo: "Próximo cargo",
    giorno: "El cargo se hace el día {giorno} de cada mes (o el siguiente día hábil).",
    mandato: "Orden de domiciliación SEPA",
    firmata: "firmada el {data}",
    pdfMandato: "Contrato y orden (PDF)",
    conto: "Cuenta de cargo",
    titolare: "Titular",
    modificaDati: "Editar mis datos",
    cambiaConto: "Cambiar la cuenta de cargo",
    fatture: "Facturas",
    nessunaFattura: "Todavía no hay facturas: la primera se emite con el primer cargo.",
    numero: "Factura",
    periodo: "Periodo",
    fecha: "Fecha",
    importo: "Importe",
    statoF: "Estado",
    fatPagata: "Pagada",
    fatPendiente: "Pendiente de cargo",
    fatDevuelta: "Devuelta",
    cargoEl: "cargo el {data}",
    datiTitolo: "Mis datos",
    datiNota: "Para cambiar el nombre, el NIF o el país, escríbenos a {email}.",
    telefono: "Teléfono",
    via: "Dirección",
    cap: "Código postal",
    citta: "Localidad",
    provincia: "Provincia",
    salva: "Guardar",
    annulla: "Cancelar",
    datiSalvati: "Datos actualizados.",
    contoTitolo: "Nueva cuenta de cargo",
    contoSotto: "Indica la nueva cuenta y firma la nueva orden de domiciliación SEPA, que sustituye a la actual ({ref}). Los recibos ya enviados al banco se cargarán todavía en la cuenta anterior.",
    titolareConto: "Titular de la cuenta",
    iban: "IBAN",
    bic: "BIC (opcional)",
    acreedor: "Acreedor",
    identificador: "Identificador del acreedor",
    accettoMandato: "Autorizo a {azienda} a enviar instrucciones a mi entidad para adeudar en mi cuenta las cuotas de esta suscripción, y a mi entidad a efectuar los adeudos (orden de domiciliación SEPA).",
    firmaNota: "Al pulsar el botón, la aceptación queda registrada con fecha, hora y dirección IP, con el mismo valor que una firma.",
    firmaConto: "Firmar la nueva orden de domiciliación",
    contoOk: "Nueva orden {ref} registrada. Te hemos enviado el contrato y la orden en PDF a {email}.",
    contoOkNoMail: "Nueva orden {ref} registrada.",
    errObbligatorio: "obligatorio",
    errIban: "IBAN no válido",
    errBic: "BIC no válido",
    errConsensi: "Marca la casilla para firmar la orden.",
    stessoConto: "La cuenta es la misma que la actual.",
    mandatiPrecedenti: "Órdenes anteriores",
    sostituita: "sustituida el {data}",
    baja: "Dar de baja la suscripción",
    bajaTitolo: "Baja de la suscripción",
    bajaTesto: "La baja tiene efecto el {fecha_fin}: el servicio sigue activo hasta entonces y a partir de {mes_siguiente} no habrá más cargos ni facturas. Las cuotas ya cobradas no se devuelven. Durante 30 días podrás exportar tus datos.",
    bajaConferma: "Confirmar la baja",
    bajaOk: "Baja registrada: la suscripción sigue activa hasta el {fecha_fin}.",
    finoAl: "activa hasta el {data}",
    giaCancellato: "Esta suscripción ya está cancelada.",
    caricamento: "Cargando…",
    lingua: "Idioma",
  },
  it: {
    titolo: "Area cliente",
    per: "Servizio erogato da",
    loginSotto: "Inserisci l'email del tuo abbonamento: ti mandiamo un link per entrare, senza password.",
    email: "Email",
    entra: "Mandami il link di accesso",
    inviando: "Invio…",
    linkInviato: "Se c'è un abbonamento con questa email, tra pochi minuti ricevi un link di accesso valido 60 minuti. Controlla anche lo spam.",
    errLink: "Il link non è valido o è scaduto: chiedine uno nuovo.",
    errEmail: "Email non valida.",
    errTroppi: "Troppi tentativi: aspetta qualche minuto.",
    errGenerico: "Non siamo riusciti a completare l'operazione. Riprova o scrivici.",
    esci: "Esci",
    connesso: "Collegato come",
    nessuno: "Nessun abbonamento legato a {email}. Se ti sei abbonato con un'altra email, esci e chiedi il link con quella.",
    piano: "Piano",
    alMes: "al mese",
    statoAttivo: "Attivo",
    statoSospeso: "Sospeso",
    statoCancellato: "Cancellato",
    desde: "Dal",
    prossimo: "Prossimo addebito",
    giorno: "L'addebito avviene il giorno {giorno} di ogni mese (o il primo giorno lavorativo dopo).",
    mandato: "Mandato SEPA",
    firmata: "firmato il {data}",
    pdfMandato: "Contratto e mandato (PDF)",
    conto: "Conto da addebitare",
    titolare: "Titolare",
    modificaDati: "Modifica i miei dati",
    cambiaConto: "Cambia il conto da addebitare",
    fatture: "Fatture",
    nessunaFattura: "Ancora nessuna fattura: la prima nasce con il primo addebito.",
    numero: "Fattura",
    periodo: "Periodo",
    fecha: "Data",
    importo: "Importo",
    statoF: "Stato",
    fatPagata: "Pagata",
    fatPendiente: "In addebito",
    fatDevuelta: "Insoluta",
    cargoEl: "addebito il {data}",
    datiTitolo: "I miei dati",
    datiNota: "Per cambiare nome, partita IVA o paese scrivici a {email}.",
    telefono: "Telefono",
    via: "Indirizzo",
    cap: "CAP",
    citta: "Città",
    provincia: "Provincia",
    salva: "Salva",
    annulla: "Annulla",
    datiSalvati: "Dati aggiornati.",
    contoTitolo: "Nuovo conto da addebitare",
    contoSotto: "Indica il nuovo conto e firma il nuovo mandato SEPA, che sostituisce quello attuale ({ref}). Gli addebiti già mandati in banca passano ancora sul conto precedente.",
    titolareConto: "Titolare del conto",
    iban: "IBAN",
    bic: "BIC (facoltativo)",
    acreedor: "Creditore",
    identificador: "Codice identificativo del creditore",
    accettoMandato: "Autorizzo {azienda} a disporre sul mio conto l'addebito delle quote di questo abbonamento e la mia banca a eseguirlo (mandato SEPA).",
    firmaNota: "Premendo il bottone l'accettazione viene registrata con data, ora e indirizzo IP, con lo stesso valore di una firma.",
    firmaConto: "Firma il nuovo mandato",
    contoOk: "Nuovo mandato {ref} registrato. Ti abbiamo mandato contratto e mandato in PDF a {email}.",
    contoOkNoMail: "Nuovo mandato {ref} registrato.",
    errObbligatorio: "obbligatorio",
    errIban: "IBAN non valido",
    errBic: "BIC non valido",
    errConsensi: "Spunta la casella per firmare il mandato.",
    stessoConto: "Il conto è lo stesso di adesso.",
    mandatiPrecedenti: "Mandati precedenti",
    sostituita: "sostituito il {data}",
    baja: "Disdici l'abbonamento",
    bajaTitolo: "Disdetta dell'abbonamento",
    bajaTesto: "La disdetta ha effetto il {fecha_fin}: il servizio resta attivo fino ad allora e da {mes_siguiente} non ci saranno più addebiti né fatture. Le quote già incassate non si rimborsano. Per 30 giorni potrai esportare i tuoi dati.",
    bajaConferma: "Conferma la disdetta",
    bajaOk: "Disdetta registrata: l'abbonamento resta attivo fino al {fecha_fin}.",
    finoAl: "attivo fino al {data}",
    giaCancellato: "Questo abbonamento è già cancellato.",
    caricamento: "Caricamento…",
    lingua: "Lingua",
  },
  en: {
    titolo: "Customer area",
    per: "Service provided by",
    loginSotto: "Enter the email address of your subscription: we will send you a link to sign in, no password needed.",
    email: "Email",
    entra: "Send me the access link",
    inviando: "Sending…",
    linkInviato: "If there is a subscription with this email, you will receive an access link valid for 60 minutes within a few minutes. Please also check your spam folder.",
    errLink: "The link is not valid or has expired: request a new one.",
    errEmail: "Invalid email.",
    errTroppi: "Too many attempts: please wait a few minutes.",
    errGenerico: "We could not complete the operation. Please try again or contact us.",
    esci: "Sign out",
    connesso: "Signed in as",
    nessuno: "No subscription is linked to {email}. If you subscribed with another email, sign out and request the link with that one.",
    piano: "Plan",
    alMes: "per month",
    statoAttivo: "Active",
    statoSospeso: "Suspended",
    statoCancellato: "Cancelled",
    desde: "Since",
    prossimo: "Next debit",
    giorno: "The debit takes place on day {giorno} of each month (or the next business day).",
    mandato: "SEPA direct debit mandate",
    firmata: "signed on {data}",
    pdfMandato: "Agreement and mandate (PDF)",
    conto: "Account to be debited",
    titolare: "Holder",
    modificaDati: "Edit my details",
    cambiaConto: "Change the bank account",
    fatture: "Invoices",
    nessunaFattura: "No invoices yet: the first one is issued with the first debit.",
    numero: "Invoice",
    periodo: "Period",
    fecha: "Date",
    importo: "Amount",
    statoF: "Status",
    fatPagata: "Paid",
    fatPendiente: "Pending debit",
    fatDevuelta: "Returned",
    cargoEl: "debit on {data}",
    datiTitolo: "My details",
    datiNota: "To change the name, tax ID or country, write to {email}.",
    telefono: "Phone",
    via: "Address",
    cap: "Postal code",
    citta: "City",
    provincia: "Province",
    salva: "Save",
    annulla: "Cancel",
    datiSalvati: "Details updated.",
    contoTitolo: "New bank account",
    contoSotto: "Enter the new account and sign the new SEPA mandate, which replaces the current one ({ref}). Collections already sent to the bank will still be debited from the previous account.",
    titolareConto: "Account holder",
    iban: "IBAN",
    bic: "BIC (optional)",
    acreedor: "Creditor",
    identificador: "Creditor identifier",
    accettoMandato: "I authorise {azienda} to send instructions to my bank to debit the fees of this subscription from my account, and my bank to debit my account (SEPA mandate).",
    firmaNota: "By pressing the button your acceptance is recorded with date, time and IP address, with the same value as a signature.",
    firmaConto: "Sign the new mandate",
    contoOk: "New mandate {ref} registered. We have sent the agreement and the mandate as PDF to {email}.",
    contoOkNoMail: "New mandate {ref} registered.",
    errObbligatorio: "required",
    errIban: "Invalid IBAN",
    errBic: "Invalid BIC",
    errConsensi: "Tick the box to sign the mandate.",
    stessoConto: "This is the same account as the current one.",
    mandatiPrecedenti: "Previous mandates",
    sostituita: "replaced on {data}",
    baja: "Cancel the subscription",
    bajaTitolo: "Subscription cancellation",
    bajaTesto: "The cancellation takes effect on {fecha_fin}: the service stays active until then and from {mes_siguiente} there will be no further debits or invoices. Fees already collected are not refunded. You can export your data for 30 days.",
    bajaConferma: "Confirm the cancellation",
    bajaOk: "Cancellation registered: the subscription stays active until {fecha_fin}.",
    finoAl: "active until {data}",
    giaCancellato: "This subscription is already cancelled.",
    caricamento: "Loading…",
    lingua: "Language",
  },
};

const STATO_PILL: Record<string, string> = { attivo: "pill-ok", sospeso: "pill-partial", cancellato: "pill-off" };
const FATTURA_PILL: Record<FatturaArea["stato"], string> = { pagata: "pill-ok", pendiente: "pill-wait", devuelta: "pill-late" };

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white";
const labelCls = "text-xs font-medium text-gray-600 block mb-1";

const vuotoDati = { email: "", telefono: "", via: "", cap: "", citta: "", provincia: "" };
const vuotoConto = { titolareConto: "", iban: "", bic: "" };

export default function AreaCliente({ linguaIniziale, errore }: { linguaIniziale: Lingua | null; errore: string | null }) {
  const [lingua, setLingua] = useState<Lingua>(linguaIniziale ?? "es");
  const [fase, setFase] = useState<"carico" | "login" | "ok">("carico");
  const [dati, setDati] = useState<Dati | null>(null);
  // Modulo di accesso
  const [emailLogin, setEmailLogin] = useState("");
  const [trappola, setTrappola] = useState("");
  const [inviato, setInviato] = useState(false);
  const [errLogin, setErrLogin] = useState<string | null>(errore === "link" ? "errLink" : null);
  // Modifiche sull'abbonamento aperto
  const [editId, setEditId] = useState<number | null>(null);
  const [formDati, setFormDati] = useState(vuotoDati);
  const [contoId, setContoId] = useState<number | null>(null);
  const [bajaId, setBajaId] = useState<number | null>(null);
  const [formConto, setFormConto] = useState(vuotoConto);
  const [accetto, setAccetto] = useState(false);
  const [errori, setErrori] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ id: number; testo: string; kind: "ok" | "err" } | null>(null);
  const [busy, setBusy] = useState(false);
  const t = (k: string, v: Record<string, string> = {}) => compilaTesto(T[lingua][k] ?? k, v);

  const carica = useCallback(async () => {
    try {
      const r = await fetch("/api/public/area", { cache: "no-store" });
      if (r.status === 401) {
        setDati(null);
        setFase("login");
        return;
      }
      if (!r.ok) throw new Error("errore");
      const d = (await r.json()) as Dati;
      setDati(d);
      setFase("ok");
      if (!linguaIniziale && d.abbonamenti[0]) setLingua(linguaValida(d.abbonamenti[0].lingua));
    } catch {
      setFase("login");
      setErrLogin("errGenerico");
    }
  }, [linguaIniziale]);
  useEffect(() => {
    carica();
  }, [carica]);

  const nomeCreditore = dati?.creditore.nome ?? "Anda Agencia de Publicidad SL";
  useEffect(() => {
    document.title = `${T[lingua].titolo} · ${nomeCreditore}`;
  }, [lingua, nomeCreditore]);

  const dataLunga = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(LOCALE[lingua], { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Madrid" }) : "—";
  const dataBreve = (d: string | null) => (d ? new Date(d).toLocaleDateString(LOCALE[lingua], { timeZone: "Europe/Madrid" }) : "—");
  const meseAnno = (d: string | null) => (d ? new Date(d).toLocaleDateString(LOCALE[lingua], { month: "long", year: "numeric", timeZone: "UTC" }) : "—");
  const euro = (n: number) => `${n.toLocaleString(LOCALE[lingua], { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const statoLabel = (s: string) => (s === "attivo" ? t("statoAttivo") : s === "sospeso" ? t("statoSospeso") : t("statoCancellato"));
  const fatturaLabel = (s: FatturaArea["stato"]) => (s === "pagata" ? t("fatPagata") : s === "devuelta" ? t("fatDevuelta") : t("fatPendiente"));

  const tema = (dati?.abbonamenti[0] ? TEMI_PRODOTTO[dati.abbonamenti[0].prodotto] : undefined) as React.CSSProperties | undefined;

  const chiediLink = async () => {
    setErrLogin(null);
    const email = emailLogin.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setErrLogin("errEmail");
    setBusy(true);
    try {
      const r = await fetch("/api/public/area/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, lang: lingua, sitio_web: trappola }),
      });
      if (r.status === 429) return setErrLogin("errTroppi");
      if (!r.ok) return setErrLogin("errGenerico");
      setInviato(true);
    } catch {
      setErrLogin("errGenerico");
    } finally {
      setBusy(false);
    }
  };

  const esci = async () => {
    await fetch("/api/public/area/esci", { method: "POST" }).catch(() => {});
    setDati(null);
    setInviato(false);
    setEmailLogin("");
    setErrLogin(null);
    setFase("login");
  };

  const apriDati = (a: Abb) => {
    setContoId(null);
    setBajaId(null);
    setErrori({});
    setMsg(null);
    setFormDati({ email: a.email, telefono: a.telefono ?? "", via: a.via ?? "", cap: a.cap ?? "", citta: a.citta ?? "", provincia: a.provincia ?? "" });
    setEditId(a.id);
  };
  const apriConto = (a: Abb) => {
    setEditId(null);
    setBajaId(null);
    setErrori({});
    setMsg(null);
    setAccetto(false);
    setFormConto({ titolareConto: a.titolareConto || a.intestatario, iban: "", bic: "" });
    setContoId(a.id);
  };

  const salvaDati = async (a: Abb) => {
    setErrori({});
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formDati.email.trim())) return setErrori({ email: t("errEmail") });
    setBusy(true);
    try {
      const r = await fetch(`/api/public/area/abbonamenti/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formDati),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) return carica();
      if (!r.ok) {
        if (j.error === "email_non_valida" || j.error === "email_obbligatoria") return setErrori({ email: t("errEmail") });
        return setMsg({ id: a.id, testo: t("errGenerico"), kind: "err" });
      }
      setEditId(null);
      setMsg({ id: a.id, testo: t("datiSalvati"), kind: "ok" });
      await carica();
    } catch {
      setMsg({ id: a.id, testo: t("errGenerico"), kind: "err" });
    } finally {
      setBusy(false);
    }
  };

  const firmaConto = async (a: Abb) => {
    setErrori({});
    const locali: Record<string, string> = {};
    if (!formConto.titolareConto.trim()) locali.titolareConto = t("errObbligatorio");
    if (!pulisciIban(formConto.iban)) locali.iban = t("errObbligatorio");
    else if (!ibanValido(formConto.iban)) locali.iban = t("errIban");
    if (Object.keys(locali).length) return setErrori(locali);
    if (!accetto) return setMsg({ id: a.id, testo: t("errConsensi"), kind: "err" });
    setBusy(true);
    try {
      const r = await fetch(`/api/public/area/abbonamenti/${a.id}/conto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formConto, iban: pulisciIban(formConto.iban), accettoMandato: accetto }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) return carica();
      if (!r.ok) {
        const e = String(j.error ?? "");
        if (e === "stesso_conto") return setMsg({ id: a.id, testo: t("stessoConto"), kind: "err" });
        if (e === "consensi") return setMsg({ id: a.id, testo: t("errConsensi"), kind: "err" });
        if (e.startsWith("iban")) return setErrori({ iban: t("errIban") });
        if (e.startsWith("bic")) return setErrori({ bic: t("errBic") });
        if (e === "titolare_obbligatorio") return setErrori({ titolareConto: t("errObbligatorio") });
        return setMsg({ id: a.id, testo: t("errGenerico"), kind: "err" });
      }
      setContoId(null);
      setMsg({ id: a.id, testo: j.emailInviata ? t("contoOk", { ref: j.mandatoRef, email: a.email }) : t("contoOkNoMail", { ref: j.mandatoRef }), kind: "ok" });
      await carica();
    } catch {
      setMsg({ id: a.id, testo: t("errGenerico"), kind: "err" });
    } finally {
      setBusy(false);
    }
  };

  // Fine del mese in corso e mese dopo, per il testo della disdetta
  const oggi = new Date();
  const fineMese = new Date(Date.UTC(oggi.getFullYear(), oggi.getMonth() + 1, 0));
  const meseDopo = new Date(Date.UTC(oggi.getFullYear(), oggi.getMonth() + 1, 1));
  const disdici = async (a: Abb) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/public/area/abbonamenti/${a.id}/baja`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conferma: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) return carica();
      if (!r.ok) return setMsg({ id: a.id, testo: j.error === "gia_cancellato" ? t("giaCancellato") : t("errGenerico"), kind: "err" });
      setBajaId(null);
      setMsg({ id: a.id, testo: t("bajaOk", { fecha_fin: dataLunga(j.dataFine) }), kind: "ok" });
      await carica();
    } catch {
      setMsg({ id: a.id, testo: t("errGenerico"), kind: "err" });
    } finally {
      setBusy(false);
    }
  };

  // Funzioni, non componenti annidati: i campi non perdono il focus a ogni tasto
  const testata = () => (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-brand text-white font-bold text-lg">
          {(dati?.abbonamenti[0] ? nomeProdotto(dati.abbonamenti[0].prodotto) : nomeCreditore).slice(0, 1)}
        </span>
        <div>
          <div className="text-lg font-bold leading-tight">{t("titolo")}</div>
          <div className="text-[11px] text-gray-500">
            {t("per")} {nomeCreditore}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="pills">
          {LINGUE.map((l) => (
            <button key={l.value} type="button" className={lingua === l.value ? "active" : undefined} onClick={() => setLingua(l.value)} aria-label={l.label}>
              {l.value.toUpperCase()}
            </button>
          ))}
        </div>
        {fase === "ok" && (
          <button type="button" onClick={esci} className="btn btn-secondary btn-sm">
            <LogOut className="w-3.5 h-3.5" /> {t("esci")}
          </button>
        )}
      </div>
    </div>
  );

  if (fase === "carico") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center text-sm text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> {t("caricamento")}
      </div>
    );
  }

  if (fase === "login") {
    return (
      <div className="max-w-md mx-auto px-4 py-10" style={tema}>
        {testata()}
        <div className="glass-card rounded-2xl p-6 space-y-4">
          {inviato ? (
            <div className="text-center space-y-3">
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ok/15 text-ok">
                <Check className="w-6 h-6" />
              </span>
              <p className="text-sm text-gray-700">{t("linkInviato")}</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">{t("loginSotto")}</p>
              <div>
                <label className={labelCls}>{t("email")}</label>
                <input
                  type="email"
                  value={emailLogin}
                  onChange={(e) => setEmailLogin(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && chiediLink()}
                  autoComplete="email"
                  className={inputCls}
                />
              </div>
              <div className="absolute -left-[9999px] top-0" aria-hidden="true">
                <label>
                  Website
                  <input value={trappola} onChange={(e) => setTrappola(e.target.value)} tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              {errLogin && <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">{t(errLogin)}</div>}
              <button type="button" onClick={chiediLink} disabled={busy} className="btn btn-primary w-full h-11 text-base disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {busy ? t("inviando") : t("entra")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const d = dati as Dati;
  const campoDati = (k: keyof typeof vuotoDati, label: string, o: { type?: string; span?: number } = {}) => (
    <div key={k} className={o.span === 2 ? "md:col-span-2" : undefined}>
      <label className={labelCls}>{label}</label>
      <input type={o.type ?? "text"} value={formDati[k]} onChange={(e) => setFormDati((f) => ({ ...f, [k]: e.target.value }))} className={cn(inputCls, errori[k] && "border-bad")} />
      {errori[k] && <p className="text-[11px] text-bad mt-1">{errori[k]}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" style={tema}>
      {testata()}
      <p className="text-xs text-gray-500 mb-5">
        {t("connesso")} <strong className="text-gray-700">{d.email}</strong>
      </p>

      {d.abbonamenti.length === 0 && <div className="glass-card rounded-2xl p-8 text-center text-sm text-gray-700">{t("nessuno", { email: d.email })}</div>}

      <div className="space-y-5">
        {d.abbonamenti.map((a) => {
          const temaA = TEMI_PRODOTTO[a.prodotto] as React.CSSProperties | undefined;
          const indirizzo = [a.via, [a.cap, a.citta].filter(Boolean).join(" "), a.provincia, nomePaese(a.paese, lingua)].filter(Boolean).join(", ");
          return (
            <section key={a.id} className="glass-card rounded-2xl p-5 space-y-4" style={temaA}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center rounded-full bg-brand text-white text-[11px] font-bold px-2.5 py-0.5">{nomeProdotto(a.prodotto)}</span>
                    <span className={STATO_PILL[a.stato] ?? "pill-off"}>{statoLabel(a.stato)}</span>
                    {a.stato === "cancellato" && a.dataFine && <span className="text-[11px] text-gray-500">{t("finoAl", { data: dataLunga(a.dataFine) })}</span>}
                    <span className="text-[11px] text-gray-400 font-mono">{a.codice}</span>
                  </div>
                  <div className="text-xl font-bold mt-1.5">
                    {t("piano")} {a.pianoNome} · {euro(a.totale)} <span className="text-sm font-normal text-gray-500">{t("alMes")}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {euro(a.prezzo)} + {IMPOSTA_LABEL[lingua][a.tipoIva] ?? a.tipoIva}
                    {a.dataInizio ? ` · ${t("desde")} ${meseAnno(a.dataInizio)}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">{t("prossimo")}</div>
                  <div className="text-sm font-semibold">{a.prossimoAddebito ? dataLunga(a.prossimoAddebito) : "—"}</div>
                  <div className="text-[11px] text-gray-400 max-w-[220px]">{t("giorno", { giorno: String(d.giornoAddebito) })}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-gray-50 p-3.5">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("mandato")}</div>
                  <div className="font-mono text-[12px]">{a.mandatoRef}</div>
                  <div className="text-xs text-gray-500">{t("firmata", { data: dataLunga(a.mandatoFirmatoIl) })}</div>
                  <div className="mt-2">
                    <span className="text-gray-500">{t("titolare")}:</span> {a.titolareConto} · <span className="font-mono">{a.iban}</span>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <a href={`/api/public/area/abbonamenti/${a.id}/mandato`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                      <FileText className="w-3.5 h-3.5" /> {t("pdfMandato")}
                    </a>
                    {a.stato !== "cancellato" && (
                      <button type="button" onClick={() => (contoId === a.id ? setContoId(null) : apriConto(a))} className="btn btn-secondary btn-sm">
                        <RefreshCw className="w-3.5 h-3.5" /> {t("cambiaConto")}
                      </button>
                    )}
                  </div>
                  {a.mandatiPrecedenti.length > 0 && (
                    <div className="mt-3 text-[11px] text-gray-500">
                      <div className="font-semibold uppercase tracking-wide">{t("mandatiPrecedenti")}</div>
                      {a.mandatiPrecedenti.map((m) => (
                        <div key={m.mandatoRef}>
                          <span className="font-mono">{m.mandatoRef}</span> · {m.iban} · {t("sostituita", { data: dataBreve(m.sostituitoIl) })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl bg-gray-50 p-3.5">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("datiTitolo")}</div>
                  <div className="font-semibold">
                    {a.intestatario}
                    {a.nif ? <span className="font-normal text-gray-500"> · {a.nif}</span> : null}
                  </div>
                  <div className="text-gray-600 break-all">
                    {a.email}
                    {a.telefono ? ` · ${a.telefono}` : ""}
                  </div>
                  <div className="text-gray-600">{indirizzo || "—"}</div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button type="button" onClick={() => (editId === a.id ? setEditId(null) : apriDati(a))} className="btn btn-secondary btn-sm">
                      <Pencil className="w-3.5 h-3.5" /> {t("modificaDati")}
                    </button>
                    {a.stato !== "cancellato" && (
                      <button type="button" onClick={() => { setMsg(null); setBajaId(bajaId === a.id ? null : a.id); }} className="btn btn-secondary btn-sm text-bad hover:text-bad">
                        <Ban className="w-3.5 h-3.5" /> {t("baja")}
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">{t("datiNota", { email: d.creditore.email })}</p>
                </div>
              </div>

              {msg && msg.id === a.id && (
                <div className={cn("text-sm rounded-lg px-3 py-2 border flex items-center justify-between gap-3", msg.kind === "ok" ? "bg-ok/10 border-ok/30 text-ok" : "bg-bad/10 border-bad/30 text-bad")}>
                  <span>{msg.testo}</span>
                  <button type="button" onClick={() => setMsg(null)} aria-label="×">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {editId === a.id && (
                <div className="rounded-xl border border-brand/40 bg-brand/5 p-4 space-y-3">
                  <div className="text-sm font-bold">{t("datiTitolo")}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {campoDati("email", t("email"), { type: "email" })}
                    {campoDati("telefono", t("telefono"), { type: "tel" })}
                    {campoDati("via", t("via"), { span: 2 })}
                    {campoDati("cap", t("cap"))}
                    {campoDati("citta", t("citta"))}
                    {campoDati("provincia", t("provincia"))}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setEditId(null)} className="btn btn-secondary">
                      {t("annulla")}
                    </button>
                    <button type="button" onClick={() => salvaDati(a)} disabled={busy} className="btn btn-primary disabled:opacity-60">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t("salva")}
                    </button>
                  </div>
                </div>
              )}

              {bajaId === a.id && (
                <div className="rounded-xl border border-bad/40 bg-bad/5 p-4 space-y-3">
                  <div className="text-sm font-bold">{t("bajaTitolo")}</div>
                  <p className="text-sm text-gray-700">
                    {t("bajaTesto", {
                      fecha_fin: dataLunga(fineMese.toISOString()),
                      mes_siguiente: meseDopo.toLocaleDateString(LOCALE[lingua], { month: "long", year: "numeric", timeZone: "UTC" }),
                    })}
                  </p>
                  <div className="flex gap-2 justify-end flex-wrap">
                    <button type="button" onClick={() => setBajaId(null)} className="btn btn-secondary">
                      {t("annulla")}
                    </button>
                    <button type="button" onClick={() => disdici(a)} disabled={busy} className="btn btn-primary !bg-bad hover:!bg-bad/90 disabled:opacity-60">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />} {t("bajaConferma")}
                    </button>
                  </div>
                </div>
              )}

              {contoId === a.id && (
                <div className="rounded-xl border border-brand/40 bg-brand/5 p-4 space-y-3">
                  <div className="text-sm font-bold">{t("contoTitolo")}</div>
                  <p className="text-xs text-gray-600">{t("contoSotto", { ref: a.mandatoRef })}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>{t("titolareConto")}</label>
                      <input value={formConto.titolareConto} onChange={(e) => setFormConto((f) => ({ ...f, titolareConto: e.target.value }))} className={cn(inputCls, errori.titolareConto && "border-bad")} />
                      {errori.titolareConto && <p className="text-[11px] text-bad mt-1">{errori.titolareConto}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>{t("iban")}</label>
                      <input
                        value={formConto.iban}
                        onChange={(e) => setFormConto((f) => ({ ...f, iban: e.target.value }))}
                        onBlur={() => setFormConto((f) => ({ ...f, iban: f.iban.trim() ? formattaIban(f.iban) : "" }))}
                        className={cn(inputCls, "font-mono", errori.iban && "border-bad")}
                        placeholder="ES00 0000 0000 0000 0000 0000"
                        autoComplete="off"
                      />
                      {errori.iban && <p className="text-[11px] text-bad mt-1">{errori.iban}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>{t("bic")}</label>
                      <input value={formConto.bic} onChange={(e) => setFormConto((f) => ({ ...f, bic: e.target.value }))} className={cn(inputCls, "font-mono", errori.bic && "border-bad")} />
                      {errori.bic && <p className="text-[11px] text-bad mt-1">{errori.bic}</p>}
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3 text-[12px] text-gray-700 space-y-1">
                    <div>
                      <strong>{t("acreedor")}:</strong> {d.creditore.nome} · NIF {d.creditore.nif} · {d.creditore.indirizzo}
                    </div>
                    <div>
                      <strong>{t("identificador")}:</strong> <span className="font-mono">{d.creditore.identificador}</span>
                    </div>
                    <p className="pt-2 leading-relaxed">{MANDATO_LEGALE[lingua]}</p>
                  </div>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={accetto} onChange={(e) => setAccetto(e.target.checked)} className="mt-1" />
                    <span>{t("accettoMandato", { azienda: d.creditore.nome })}</span>
                  </label>
                  <div className="flex gap-2 justify-end flex-wrap">
                    <button type="button" onClick={() => setContoId(null)} className="btn btn-secondary">
                      {t("annulla")}
                    </button>
                    <button type="button" onClick={() => firmaConto(a)} disabled={busy} className="btn btn-primary disabled:opacity-60">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {t("firmaConto")}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500 text-center">{t("firmaNota")}</p>
                </div>
              )}

              <div>
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">{t("fatture")}</div>
                {a.fatture.length === 0 ? (
                  <p className="text-xs text-gray-500">{t("nessunaFattura")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                          <th className="py-1.5 pr-3 font-semibold">{t("numero")}</th>
                          <th className="py-1.5 pr-3 font-semibold">{t("periodo")}</th>
                          <th className="py-1.5 pr-3 font-semibold">{t("fecha")}</th>
                          <th className="py-1.5 pr-3 font-semibold text-right">{t("importo")}</th>
                          <th className="py-1.5 pr-3 font-semibold">{t("statoF")}</th>
                          <th className="py-1.5 font-semibold"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.fatture.map((f) => (
                          <tr key={f.id} className="border-t border-gray-100">
                            <td className="py-2 pr-3 font-semibold whitespace-nowrap">{f.numero ?? "—"}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {MESI_L[lingua][f.mese - 1]} {f.anno}
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap">{dataBreve(f.data)}</td>
                            <td className="py-2 pr-3 text-right whitespace-nowrap">{euro(f.importo)}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">
                              <span className={FATTURA_PILL[f.stato]}>{fatturaLabel(f.stato)}</span>
                              {f.stato === "pendiente" && f.dataAddebito && <div className="text-[11px] text-gray-400">{t("cargoEl", { data: dataBreve(f.dataAddebito) })}</div>}
                            </td>
                            <td className="py-2 text-right whitespace-nowrap">
                              <a href={`/api/public/area/fatture/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline font-medium">
                                <FileText className="w-3.5 h-3.5" /> PDF
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
