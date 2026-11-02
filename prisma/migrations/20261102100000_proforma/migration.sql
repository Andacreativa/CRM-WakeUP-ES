
-- CreateTable
CREATE TABLE "Proforma" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "validaFino" TIMESTAMP(3),
    "clienteId" INTEGER,
    "mese" INTEGER NOT NULL,
    "anno" INTEGER NOT NULL,
    "descrizione" TEXT,
    "voci" TEXT NOT NULL DEFAULT '[]',
    "importo" DOUBLE PRECISION NOT NULL,
    "tipoIva" TEXT NOT NULL DEFAULT 'igic_exenta',
    "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "causaIgic" TEXT,
    "commercialeId" INTEGER,
    "note" TEXT,
    "stato" TEXT NOT NULL DEFAULT 'aperta',
    "annullataIl" TIMESTAMP(3),
    "convertitaIl" TIMESTAMP(3),
    "fatturaId" INTEGER,
    "inviata" BOOLEAN NOT NULL DEFAULT false,
    "dataInvio" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Proforma_numero_key" ON "Proforma"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Proforma_fatturaId_key" ON "Proforma"("fatturaId");

-- CreateIndex
CREATE INDEX "Proforma_clienteId_idx" ON "Proforma"("clienteId");

-- CreateIndex
CREATE INDEX "Proforma_anno_idx" ON "Proforma"("anno");

-- CreateIndex
CREATE INDEX "Proforma_commercialeId_idx" ON "Proforma"("commercialeId");

-- AddForeignKey
ALTER TABLE "Proforma" ADD CONSTRAINT "Proforma_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proforma" ADD CONSTRAINT "Proforma_commercialeId_fkey" FOREIGN KEY ("commercialeId") REFERENCES "Dipendente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proforma" ADD CONSTRAINT "Proforma_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "Fattura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

