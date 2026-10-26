-- CreateTable
CREATE TABLE "PianoAbbonamento" (
    "id" SERIAL NOT NULL,
    "prodotto" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descrizione" TEXT,
    "prezzo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prezzoLibero" BOOLEAN NOT NULL DEFAULT false,
    "tipoIva" TEXT NOT NULL DEFAULT 'igic7',
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PianoAbbonamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Abbonamento" (
    "id" SERIAL NOT NULL,
    "codice" TEXT NOT NULL,
    "prodotto" TEXT NOT NULL,
    "pianoId" INTEGER,
    "pianoNome" TEXT NOT NULL,
    "prezzo" DOUBLE PRECISION NOT NULL,
    "tipoIva" TEXT NOT NULL DEFAULT 'igic7',
    "iva" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "totale" DOUBLE PRECISION NOT NULL,
    "intestatario" TEXT NOT NULL,
    "nif" TEXT,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "via" TEXT,
    "cap" TEXT,
    "citta" TEXT,
    "provincia" TEXT,
    "paese" TEXT NOT NULL DEFAULT 'Spagna',
    "titolareConto" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bic" TEXT,
    "mandatoRef" TEXT NOT NULL,
    "mandatoFirmatoIl" TIMESTAMP(3),
    "mandatoLuogo" TEXT,
    "mandatoIp" TEXT,
    "mandatoUserAgent" TEXT,
    "contrattoTesto" TEXT,
    "contrattoVersione" TEXT,
    "lingua" TEXT NOT NULL DEFAULT 'es',
    "stato" TEXT NOT NULL DEFAULT 'in_attesa',
    "dataInizio" TIMESTAMP(3),
    "dataFine" TIMESTAMP(3),
    "sospesoIl" TIMESTAMP(3),
    "cancellatoIl" TIMESTAMP(3),
    "tokenFirma" TEXT,
    "tokenScadenza" TIMESTAMP(3),
    "clienteId" INTEGER,
    "origine" TEXT NOT NULL DEFAULT 'modulo',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Abbonamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddebitoSepa" (
    "id" SERIAL NOT NULL,
    "abbonamentoId" INTEGER NOT NULL,
    "anno" INTEGER NOT NULL,
    "mese" INTEGER NOT NULL,
    "importo" DOUBLE PRECISION NOT NULL,
    "descrizione" TEXT NOT NULL,
    "endToEndId" TEXT NOT NULL,
    "seq" TEXT NOT NULL DEFAULT 'RCUR',
    "stato" TEXT NOT NULL DEFAULT 'previsto',
    "remessaId" INTEGER,
    "fatturaId" INTEGER,
    "dataIncasso" TIMESTAMP(3),
    "dataDevoluzione" TIMESTAMP(3),
    "motivoDevoluzione" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddebitoSepa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemessaSepa" (
    "id" SERIAL NOT NULL,
    "codice" TEXT NOT NULL,
    "msgId" TEXT NOT NULL,
    "dataAddebito" TIMESTAMP(3) NOT NULL,
    "numero" INTEGER NOT NULL DEFAULT 0,
    "totale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "versione" TEXT NOT NULL DEFAULT 'pain.008.001.08',
    "nomeFile" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'generata',
    "inviataIl" TIMESTAMP(3),
    "incassataIl" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemessaSepa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PianoAbbonamento_prodotto_codice_key" ON "PianoAbbonamento"("prodotto", "codice");

-- CreateIndex
CREATE UNIQUE INDEX "Abbonamento_codice_key" ON "Abbonamento"("codice");

-- CreateIndex
CREATE UNIQUE INDEX "Abbonamento_mandatoRef_key" ON "Abbonamento"("mandatoRef");

-- CreateIndex
CREATE UNIQUE INDEX "Abbonamento_tokenFirma_key" ON "Abbonamento"("tokenFirma");

-- CreateIndex
CREATE INDEX "Abbonamento_stato_idx" ON "Abbonamento"("stato");

-- CreateIndex
CREATE INDEX "Abbonamento_prodotto_idx" ON "Abbonamento"("prodotto");

-- CreateIndex
CREATE INDEX "Abbonamento_clienteId_idx" ON "Abbonamento"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "AddebitoSepa_endToEndId_key" ON "AddebitoSepa"("endToEndId");

-- CreateIndex
CREATE UNIQUE INDEX "AddebitoSepa_fatturaId_key" ON "AddebitoSepa"("fatturaId");

-- CreateIndex
CREATE INDEX "AddebitoSepa_anno_mese_idx" ON "AddebitoSepa"("anno", "mese");

-- CreateIndex
CREATE INDEX "AddebitoSepa_stato_idx" ON "AddebitoSepa"("stato");

-- CreateIndex
CREATE INDEX "AddebitoSepa_remessaId_idx" ON "AddebitoSepa"("remessaId");

-- CreateIndex
CREATE UNIQUE INDEX "AddebitoSepa_abbonamentoId_anno_mese_key" ON "AddebitoSepa"("abbonamentoId", "anno", "mese");

-- CreateIndex
CREATE UNIQUE INDEX "RemessaSepa_codice_key" ON "RemessaSepa"("codice");

-- CreateIndex
CREATE UNIQUE INDEX "RemessaSepa_msgId_key" ON "RemessaSepa"("msgId");

-- CreateIndex
CREATE INDEX "RemessaSepa_dataAddebito_idx" ON "RemessaSepa"("dataAddebito");

-- AddForeignKey
ALTER TABLE "Abbonamento" ADD CONSTRAINT "Abbonamento_pianoId_fkey" FOREIGN KEY ("pianoId") REFERENCES "PianoAbbonamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abbonamento" ADD CONSTRAINT "Abbonamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddebitoSepa" ADD CONSTRAINT "AddebitoSepa_abbonamentoId_fkey" FOREIGN KEY ("abbonamentoId") REFERENCES "Abbonamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddebitoSepa" ADD CONSTRAINT "AddebitoSepa_remessaId_fkey" FOREIGN KEY ("remessaId") REFERENCES "RemessaSepa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddebitoSepa" ADD CONSTRAINT "AddebitoSepa_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "Fattura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

