import type { Lingua } from "@/components/abbonamenti/tipi";

// Testi di contratto, mandato SEPA ed email degli abbonamenti in es / it / en.
// Il contratto e le email sono i valori di partenza di Configurazione ›
// Abbonamenti (si modificano da lì); il testo legale del mandato è quello
// ufficiale dello schema SEPA Core e non si tocca.
// Segnaposto del contratto: {prodotto} {piano} {prezzo} {imposta} {totale}
// {giornoAddebito} {azienda} {nif} {indirizzo} {email} {intestatario}
// {nifCliente} {data}

export const MESI_L: Record<Lingua, string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  it: ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

export const LOCALE: Record<Lingua, string> = { es: "es-ES", it: "it-IT", en: "en-GB" };

export const CONTRATTO_DEFAULT: Record<Lingua, string> = {
  es: `CONTRATO DE SUSCRIPCIÓN AL SERVICIO {prodotto}

Entre {azienda}, NIF {nif}, con domicilio en {indirizzo}, correo {email} (en adelante, «el proveedor»), y {intestatario}, NIF {nifCliente} (en adelante, «el cliente»).

1. Objeto. El proveedor da acceso al cliente al servicio {prodotto} en el plan {piano}, con los módulos y límites de ese plan, alojado y mantenido por el proveedor. La configuración inicial (instalación, importación de datos, dominio, formación) no forma parte de esta suscripción: se presupuesta y se factura aparte.

2. Precio. {prezzo} € al mes más {imposta}: {totale} € al mes. El proveedor puede actualizar el precio avisando con 30 días de antelación; el cliente puede darse de baja antes de que se aplique.

3. Pago. Por domiciliación bancaria SEPA (adeudo directo básico, recurrente) en la cuenta indicada en la orden de domiciliación, el día {giornoAddebito} de cada mes o el siguiente día hábil, por la cuota del mes en curso. El proveedor emite la factura de cada cuota y la envía por correo electrónico. Este contrato vale como pre-notificación de los adeudos: no se enviará un aviso previo de cada cuota. Si un adeudo se devuelve, el proveedor puede suspender el acceso hasta que se pague y repercutir los gastos bancarios de la devolución.

4. Duración y baja. Mensual, con renovación automática. Cualquiera de las partes puede terminarlo con un correo electrónico; la baja tiene efecto al final del mes en curso y no se devuelven las cuotas ya cobradas. Al terminar, el cliente puede exportar sus datos durante 30 días; después se eliminan.

5. Uso y datos. El cliente es responsable de los datos que introduce y del uso de sus accesos. El proveedor trata los datos personales como encargado del tratamiento, solo para prestar el servicio, con las medidas de seguridad adecuadas, y no los cede a terceros salvo los proveedores técnicos necesarios (alojamiento, correo). Los datos del contrato y de la orden de domiciliación se conservan mientras dure la relación y durante los plazos legales.

6. Disponibilidad. El proveedor procura un servicio continuo y avisa de las paradas programadas. No responde de daños indirectos ni de pérdidas de negocio; su responsabilidad se limita a las cuotas de los últimos 12 meses.

7. Ley y fuero. Legislación española; juzgados de Santa Cruz de Tenerife, salvo norma imperativa en contrario.

Aceptado electrónicamente el {data} por {intestatario}.`,
  it: `CONTRATTO DI ABBONAMENTO AL SERVIZIO {prodotto}

Tra {azienda}, NIF {nif}, con sede in {indirizzo}, email {email} (di seguito «il fornitore»), e {intestatario}, P.IVA/NIF {nifCliente} (di seguito «il cliente»).

1. Oggetto. Il fornitore dà al cliente l'accesso al servizio {prodotto} nel piano {piano}, con i moduli e i limiti di quel piano, ospitato e mantenuto dal fornitore. La configurazione iniziale (installazione, importazione dei dati, dominio, formazione) non fa parte dell'abbonamento: si preventiva e si fattura a parte.

2. Prezzo. {prezzo} € al mese più {imposta}: {totale} € al mese. Il fornitore può aggiornare il prezzo con 30 giorni di preavviso; il cliente può recedere prima che si applichi.

3. Pagamento. Con addebito diretto SEPA (schema Core, ricorrente) sul conto indicato nel mandato, il giorno {giornoAddebito} di ogni mese o il primo giorno lavorativo successivo, per la quota del mese in corso. Il fornitore emette la fattura di ogni quota e la invia per email. Questo contratto vale come pre-notifica degli addebiti: non sarà inviato un avviso per ogni quota. Se un addebito viene respinto, il fornitore può sospendere l'accesso fino al pagamento e addebitare le spese bancarie del rigetto.

4. Durata e recesso. Mensile, con rinnovo automatico. Ciascuna parte può recedere con un'email; il recesso ha effetto alla fine del mese in corso e le quote già incassate non si rimborsano. Alla fine il cliente può esportare i suoi dati per 30 giorni; poi vengono eliminati.

5. Uso e dati. Il cliente è responsabile dei dati che inserisce e dell'uso dei suoi accessi. Il fornitore tratta i dati personali come responsabile del trattamento, solo per erogare il servizio, con misure di sicurezza adeguate, e non li cede a terzi salvo i fornitori tecnici necessari (hosting, posta). I dati del contratto e del mandato si conservano per la durata del rapporto e per i termini di legge.

6. Disponibilità. Il fornitore cura la continuità del servizio e avvisa delle interruzioni programmate. Non risponde di danni indiretti o perdite d'affari; la responsabilità è limitata alle quote degli ultimi 12 mesi.

7. Legge e foro. Legge spagnola; tribunali di Santa Cruz de Tenerife, salvo norma imperativa contraria.

Accettato elettronicamente il {data} da {intestatario}.`,
  en: `SUBSCRIPTION AGREEMENT FOR THE {prodotto} SERVICE

Between {azienda}, tax ID {nif}, registered at {indirizzo}, email {email} (the "provider"), and {intestatario}, tax ID {nifCliente} (the "customer").

1. Subject. The provider gives the customer access to the {prodotto} service on the {piano} plan, with the modules and limits of that plan, hosted and maintained by the provider. The initial set-up (installation, data import, domain, training) is not part of this subscription: it is quoted and invoiced separately.

2. Price. {prezzo} € per month plus {imposta}: {totale} € per month. The provider may update the price with 30 days' notice; the customer may cancel before it applies.

3. Payment. By SEPA direct debit (Core scheme, recurrent) on the account stated in the mandate, on day {giornoAddebito} of each month or the next business day, for the current month's fee. The provider issues an invoice for each fee and sends it by email. This agreement serves as pre-notification of the debits: no separate notice will be sent for each fee. If a debit is returned, the provider may suspend access until payment and pass on the bank charges of the return.

4. Term and cancellation. Monthly, renewed automatically. Either party may terminate by email; cancellation takes effect at the end of the current month and fees already collected are not refunded. On termination the customer may export their data for 30 days; afterwards it is deleted.

5. Use and data. The customer is responsible for the data entered and for the use of their credentials. The provider processes personal data as a processor, only to deliver the service, with appropriate security measures, and does not share it with third parties except the technical providers needed (hosting, email). Agreement and mandate data are kept for the duration of the relationship and the statutory periods.

6. Availability. The provider strives for continuous service and announces scheduled downtime. It is not liable for indirect damages or loss of business; liability is limited to the fees of the last 12 months.

7. Law and jurisdiction. Spanish law; courts of Santa Cruz de Tenerife, unless mandatory rules provide otherwise.

Accepted electronically on {data} by {intestatario}.`,
};

// Testo legale del mandato SEPA Core (traduzioni ufficiali EPC)
export const MANDATO_LEGALE: Record<Lingua, string> = {
  es: "Mediante la firma de esta orden de domiciliación, el deudor autoriza (A) al acreedor a enviar instrucciones a la entidad del deudor para adeudar su cuenta y (B) a la entidad para efectuar los adeudos en su cuenta siguiendo las instrucciones del acreedor. Como parte de sus derechos, el deudor está legitimado al reembolso por su entidad en los términos y condiciones del contrato suscrito con la misma. La solicitud de reembolso deberá efectuarse dentro de las ocho semanas que siguen a la fecha de adeudo en cuenta. Puede obtener información adicional sobre sus derechos en su entidad financiera.",
  it: "Con la sottoscrizione del presente mandato, il debitore autorizza (A) il creditore a richiedere alla banca del debitore l'addebito del suo conto e (B) la banca del debitore a procedere a tale addebito conformemente alle disposizioni impartite dal creditore. Il debitore ha diritto di ottenere il rimborso dalla propria banca secondo gli accordi e le condizioni che regolano il rapporto con quest'ultima. Se del caso, il rimborso deve essere richiesto nel termine di otto settimane a decorrere dalla data di addebito in conto. Ulteriori informazioni sui propri diritti si possono chiedere alla propria banca.",
  en: "By signing this mandate form, you authorise (A) the creditor to send instructions to your bank to debit your account and (B) your bank to debit your account in accordance with the instructions from the creditor. As part of your rights, you are entitled to a refund from your bank under the terms and conditions of your agreement with your bank. A refund must be claimed within eight weeks starting from the date on which your account was debited. Your rights are explained in a statement that you can obtain from your bank.",
};

// Etichette del PDF (contratto + mandato) e del modulo
export const ETICHETTE: Record<
  Lingua,
  {
    mandato: string;
    contratto: string;
    ref: string;
    identificador: string;
    acreedor: string;
    deudor: string;
    nif: string;
    direccion: string;
    cuenta: string;
    iban: string;
    bic: string;
    tipoPago: string;
    recurrente: string;
    concepto: string;
    importe: string;
    alMes: string;
    fecha: string;
    lugar: string;
    firma: string;
    firmaElectronica: string;
    firmadoEl: string;
    ip: string;
    pagina: string;
    desde: string;
    diaCobro: string;
  }
> = {
  es: {
    mandato: "ORDEN DE DOMICILIACIÓN DE ADEUDO DIRECTO SEPA",
    contratto: "CONTRATO DE SUSCRIPCIÓN",
    ref: "Referencia de la orden de domiciliación",
    identificador: "Identificador del acreedor",
    acreedor: "Acreedor",
    deudor: "Deudor (titular de la cuenta)",
    nif: "NIF",
    direccion: "Dirección",
    cuenta: "Cuenta de cargo",
    iban: "IBAN",
    bic: "BIC",
    tipoPago: "Tipo de pago",
    recurrente: "Pago recurrente",
    concepto: "Concepto",
    importe: "Importe",
    alMes: "al mes",
    fecha: "Fecha",
    lugar: "Localidad",
    firma: "Firma del deudor",
    firmaElectronica: "Aceptado electrónicamente marcando la casilla de consentimiento en el formulario de suscripción.",
    firmadoEl: "Firmado el",
    ip: "Dirección IP",
    pagina: "Página",
    desde: "Primer cobro",
    diaCobro: "Día de cobro",
  },
  it: {
    mandato: "MANDATO PER ADDEBITO DIRETTO SEPA",
    contratto: "CONTRATTO DI ABBONAMENTO",
    ref: "Riferimento del mandato",
    identificador: "Codice identificativo del creditore",
    acreedor: "Creditore",
    deudor: "Debitore (titolare del conto)",
    nif: "P.IVA / NIF",
    direccion: "Indirizzo",
    cuenta: "Conto da addebitare",
    iban: "IBAN",
    bic: "BIC",
    tipoPago: "Tipo di pagamento",
    recurrente: "Pagamento ricorrente",
    concepto: "Causale",
    importe: "Importo",
    alMes: "al mese",
    fecha: "Data",
    lugar: "Luogo",
    firma: "Firma del debitore",
    firmaElectronica: "Accettato elettronicamente spuntando la casella di consenso nel modulo di sottoscrizione.",
    firmadoEl: "Firmato il",
    ip: "Indirizzo IP",
    pagina: "Pagina",
    desde: "Primo addebito",
    diaCobro: "Giorno di addebito",
  },
  en: {
    mandato: "SEPA DIRECT DEBIT MANDATE",
    contratto: "SUBSCRIPTION AGREEMENT",
    ref: "Mandate reference",
    identificador: "Creditor identifier",
    acreedor: "Creditor",
    deudor: "Debtor (account holder)",
    nif: "Tax ID",
    direccion: "Address",
    cuenta: "Account to be debited",
    iban: "IBAN",
    bic: "BIC",
    tipoPago: "Type of payment",
    recurrente: "Recurrent payment",
    concepto: "Description",
    importe: "Amount",
    alMes: "per month",
    fecha: "Date",
    lugar: "Place",
    firma: "Signature of the debtor",
    firmaElectronica: "Accepted electronically by ticking the consent box in the subscription form.",
    firmadoEl: "Signed on",
    ip: "IP address",
    pagina: "Page",
    desde: "First collection",
    diaCobro: "Collection day",
  },
};

// Email al cliente dopo la firma (allegato: contratto + mandato in PDF).
// Segnaposto: {nombre} {producto} {plan} {importe} {ref} {azienda} {codigo}
export const CONFERMA_DEFAULT: Record<Lingua, { oggetto: string; testo: string }> = {
  es: {
    oggetto: "Suscripción a {producto} confirmada — {azienda}",
    testo:
      "Hola {nombre},\n\ngracias por suscribirte a {producto}, plan {plan}: {importe} al mes.\n\nAdjuntamos el contrato y la orden de domiciliación SEPA (referencia {ref}). Las cuotas se cargarán en tu cuenta cada mes y recibirás la factura por correo electrónico.\n\nNos pondremos en contacto contigo para la configuración inicial.\n\nUn cordial saludo,\n{azienda}",
  },
  it: {
    oggetto: "Abbonamento a {producto} confermato — {azienda}",
    testo:
      "Ciao {nombre},\n\ngrazie per esserti abbonato a {producto}, piano {plan}: {importe} al mese.\n\nIn allegato il contratto e il mandato SEPA (riferimento {ref}). Le quote verranno addebitate sul tuo conto ogni mese e riceverai la fattura per email.\n\nTi contatteremo per la configurazione iniziale.\n\nCordiali saluti,\n{azienda}",
  },
  en: {
    oggetto: "Your {producto} subscription is confirmed — {azienda}",
    testo:
      "Hi {nombre},\n\nthank you for subscribing to {producto}, {plan} plan: {importe} per month.\n\nAttached are the agreement and the SEPA direct debit mandate (reference {ref}). The fees will be debited from your account every month and you will receive each invoice by email.\n\nWe will get in touch to arrange the initial set-up.\n\nKind regards,\n{azienda}",
  },
};

// Email con il link di firma (abbonamento creato da Sales).
// Segnaposto: {nombre} {producto} {plan} {importe} {link} {azienda}
export const LINK_DEFAULT: Record<Lingua, { oggetto: string; testo: string }> = {
  es: {
    oggetto: "Tu suscripción a {producto}: firma la domiciliación — {azienda}",
    testo:
      "Hola {nombre},\n\nhemos preparado tu suscripción a {producto}, plan {plan}: {importe} al mes.\n\nPara activarla, revisa tus datos, indica la cuenta de cargo y acepta el contrato y la orden de domiciliación SEPA en este enlace:\n{link}\n\nEl enlace es personal y caduca en 30 días.\n\nUn cordial saludo,\n{azienda}",
  },
  it: {
    oggetto: "Il tuo abbonamento a {producto}: firma l'addebito — {azienda}",
    testo:
      "Ciao {nombre},\n\nabbiamo preparato il tuo abbonamento a {producto}, piano {plan}: {importe} al mese.\n\nPer attivarlo, controlla i tuoi dati, indica il conto da addebitare e accetta il contratto e il mandato SEPA a questo link:\n{link}\n\nIl link è personale e scade tra 30 giorni.\n\nCordiali saluti,\n{azienda}",
  },
  en: {
    oggetto: "Your {producto} subscription: sign the direct debit — {azienda}",
    testo:
      "Hi {nombre},\n\nwe have prepared your {producto} subscription, {plan} plan: {importe} per month.\n\nTo activate it, check your details, enter the account to be debited and accept the agreement and the SEPA mandate at this link:\n{link}\n\nThe link is personal and expires in 30 days.\n\nKind regards,\n{azienda}",
  },
};

// Email con la fattura della quota (allegato: PDF della fattura), all'email
// dell'abbonamento, nella sua lingua. {iban} è mascherato; {link} entra
// nell'area cliente senza password (vale 7 giorni).
export const FATTURA_DEFAULT: Record<Lingua, { oggetto: string; testo: string }> = {
  es: {
    oggetto: "Factura {numero} de tu suscripción a {producto} — {azienda}",
    testo:
      "Hola {nombre},\n\nadjuntamos la factura {numero} del {fecha}, por importe de {importe}, de tu suscripción a {producto}, plan {plan} ({mes}).\n\nEl importe se cargará en tu cuenta {iban} el {fecha_cargo} mediante adeudo directo SEPA (orden {ref}): no tienes que hacer nada.\n\nEn tu área de cliente puedes consultar y descargar todas tus facturas y actualizar tus datos o la cuenta de cargo:\n{link}\n\nUn cordial saludo,\n{azienda}",
  },
  it: {
    oggetto: "Fattura {numero} del tuo abbonamento a {producto} — {azienda}",
    testo:
      "Ciao {nombre},\n\nin allegato la fattura {numero} del {fecha}, di {importe}, del tuo abbonamento a {producto}, piano {plan} ({mes}).\n\nL'importo verrà addebitato sul tuo conto {iban} il {fecha_cargo} con addebito diretto SEPA (mandato {ref}): non devi fare nulla.\n\nNella tua area cliente trovi tutte le fatture da scaricare e puoi aggiornare i tuoi dati o il conto da addebitare:\n{link}\n\nCordiali saluti,\n{azienda}",
  },
  en: {
    oggetto: "Invoice {numero} for your {producto} subscription — {azienda}",
    testo:
      "Hi {nombre},\n\nattached is invoice {numero} dated {fecha}, for {importe}, for your {producto} subscription, {plan} plan ({mes}).\n\nThe amount will be debited from your account {iban} on {fecha_cargo} by SEPA direct debit (mandate {ref}): nothing to do on your side.\n\nIn your customer area you can view and download all your invoices and update your details or the account to be debited:\n{link}\n\nKind regards,\n{azienda}",
  },
};

// Email con il link di accesso all'area cliente (chiesto dal modulo: 60 minuti)
export const AREA_LINK_DEFAULT: Record<Lingua, { oggetto: string; testo: string }> = {
  es: {
    oggetto: "Acceso a tu área de cliente — {azienda}",
    testo:
      "Hola,\n\npara entrar en tu área de cliente (facturas, suscripción, cuenta de cargo) usa este enlace:\n{link}\n\nEl enlace es personal y caduca en 60 minutos. Si no lo has pedido tú, ignora este correo.\n\nUn cordial saludo,\n{azienda}",
  },
  it: {
    oggetto: "Accesso alla tua area cliente — {azienda}",
    testo:
      "Ciao,\n\nper entrare nella tua area cliente (fatture, abbonamento, conto da addebitare) usa questo link:\n{link}\n\nIl link è personale e scade tra 60 minuti. Se non l'hai chiesto tu, ignora questa email.\n\nCordiali saluti,\n{azienda}",
  },
  en: {
    oggetto: "Access to your customer area — {azienda}",
    testo:
      "Hi,\n\nto enter your customer area (invoices, subscription, account to be debited) use this link:\n{link}\n\nThe link is personal and expires in 60 minutes. If you did not request it, please ignore this email.\n\nKind regards,\n{azienda}",
  },
};

// Email dopo il cambio di conto dall'area (testo fisso; allegato: contratto
// e nuovo mandato in PDF)
export const CAMBIO_CONTO_TESTI: Record<Lingua, { oggetto: string; testo: string }> = {
  es: {
    oggetto: "Nueva orden de domiciliación {ref} — {azienda}",
    testo:
      "Hola {nombre},\n\nhemos registrado la nueva cuenta de cargo de tu suscripción a {producto} ({codigo}). Adjuntamos el contrato y la nueva orden de domiciliación SEPA (referencia {ref}), que sustituye a la anterior ({refPrecedente}).\n\nLos próximos recibos se cargarán en la cuenta {iban}. Los recibos ya enviados al banco se cargarán todavía en la cuenta anterior.\n\nUn cordial saludo,\n{azienda}",
  },
  it: {
    oggetto: "Nuovo mandato SEPA {ref} — {azienda}",
    testo:
      "Ciao {nombre},\n\nabbiamo registrato il nuovo conto da addebitare del tuo abbonamento a {producto} ({codigo}). In allegato il contratto e il nuovo mandato SEPA (riferimento {ref}), che sostituisce il precedente ({refPrecedente}).\n\nI prossimi addebiti andranno sul conto {iban}. Gli addebiti già mandati in banca passano ancora sul conto precedente.\n\nCordiali saluti,\n{azienda}",
  },
  en: {
    oggetto: "New SEPA mandate {ref} — {azienda}",
    testo:
      "Hi {nombre},\n\nwe have registered the new account to be debited for your {producto} subscription ({codigo}). Attached are the agreement and the new SEPA direct debit mandate (reference {ref}), which replaces the previous one ({refPrecedente}).\n\nThe next collections will be debited from account {iban}. Collections already sent to the bank will still be debited from the previous account.\n\nKind regards,\n{azienda}",
  },
};
