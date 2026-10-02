-- CreateTable
CREATE TABLE "RichiestaFattura" (
    "id" SERIAL NOT NULL,
    "codice" TEXT NOT NULL,
    "clienteId" INTEGER,
    "nomeCliente" TEXT,
    "contrattoId" INTEGER,
    "azienda" TEXT NOT NULL DEFAULT 'Spagna',
    "aziendaNota" TEXT,
    "descrizione" TEXT NOT NULL,
    "voci" TEXT NOT NULL DEFAULT '[]',
    "imponibile" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tipoIva" TEXT NOT NULL DEFAULT 'igic_exenta',
    "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mese" INTEGER NOT NULL,
    "anno" INTEGER NOT NULL,
    "dataInvio" TIMESTAMP(3),
    "serieCodice" TEXT,
    "serieIndice" INTEGER,
    "serieTotale" INTEGER,
    "ricorrenza" TEXT NOT NULL DEFAULT 'una_tantum',
    "responsabile" TEXT,
    "validazione" TEXT NOT NULL DEFAULT 'in_attesa',
    "validataIl" TIMESTAMP(3),
    "emessa" BOOLEAN NOT NULL DEFAULT false,
    "emessaIl" TIMESTAMP(3),
    "incassata" BOOLEAN NOT NULL DEFAULT false,
    "fatturaId" INTEGER,
    "origine" TEXT NOT NULL DEFAULT 'manuale',
    "legacyFatturaId" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RichiestaFattura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RichiestaFattura_codice_key" ON "RichiestaFattura"("codice");

-- CreateIndex
CREATE UNIQUE INDEX "RichiestaFattura_fatturaId_key" ON "RichiestaFattura"("fatturaId");

-- CreateIndex
CREATE UNIQUE INDEX "RichiestaFattura_legacyFatturaId_key" ON "RichiestaFattura"("legacyFatturaId");

-- CreateIndex
CREATE INDEX "RichiestaFattura_anno_mese_idx" ON "RichiestaFattura"("anno", "mese");

-- CreateIndex
CREATE INDEX "RichiestaFattura_clienteId_idx" ON "RichiestaFattura"("clienteId");

-- CreateIndex
CREATE INDEX "RichiestaFattura_contrattoId_idx" ON "RichiestaFattura"("contrattoId");

-- CreateIndex
CREATE INDEX "RichiestaFattura_serieCodice_idx" ON "RichiestaFattura"("serieCodice");

-- AddForeignKey
ALTER TABLE "RichiestaFattura" ADD CONSTRAINT "RichiestaFattura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RichiestaFattura" ADD CONSTRAINT "RichiestaFattura_contrattoId_fkey" FOREIGN KEY ("contrattoId") REFERENCES "Contratto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RichiestaFattura" ADD CONSTRAINT "RichiestaFattura_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "Fattura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

