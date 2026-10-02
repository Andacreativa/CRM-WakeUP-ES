-- AlterTable
ALTER TABLE "Contatto" ADD COLUMN     "clienteId" INTEGER,
ADD COLUMN     "cognome" TEXT,
ADD COLUMN     "leadId" INTEGER,
ADD COLUMN     "principale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ruolo" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "citta" TEXT,
ADD COLUMN     "clienteId" INTEGER,
ADD COLUMN     "codice" TEXT,
ADD COLUMN     "convertitoIl" TIMESTAMP(3),
ADD COLUMN     "fonte" TEXT,
ADD COLUMN     "fonteDettaglio" TEXT,
ADD COLUMN     "legacyContattoId" INTEGER,
ADD COLUMN     "paese" TEXT,
ADD COLUMN     "partitaIva" TEXT,
ADD COLUMN     "priorita" TEXT NOT NULL DEFAULT 'media',
ADD COLUMN     "prossimaAzione" TEXT,
ADD COLUMN     "prossimaAzioneData" TIMESTAMP(3),
ADD COLUMN     "qualifica" TEXT NOT NULL DEFAULT 'fredda',
ADD COLUMN     "responsabile" TEXT,
ADD COLUMN     "settore" TEXT,
ADD COLUMN     "sitoWeb" TEXT,
ADD COLUMN     "stato" TEXT NOT NULL DEFAULT 'nuovo';

-- CreateTable
CREATE TABLE "AttivitaLead" (
    "id" SERIAL NOT NULL,
    "leadId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'nota',
    "oggetto" TEXT,
    "descrizione" TEXT,
    "esito" TEXT,
    "prossimaAzione" TEXT,
    "prossimaAzioneData" TIMESTAMP(3),
    "completata" BOOLEAN NOT NULL DEFAULT false,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttivitaLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttivitaLead_leadId_idx" ON "AttivitaLead"("leadId");

-- CreateIndex
CREATE INDEX "Contatto_clienteId_idx" ON "Contatto"("clienteId");

-- CreateIndex
CREATE INDEX "Contatto_leadId_idx" ON "Contatto"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_codice_key" ON "Lead"("codice");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_legacyContattoId_key" ON "Lead"("legacyContattoId");

-- CreateIndex
CREATE INDEX "Lead_stato_idx" ON "Lead"("stato");

-- CreateIndex
CREATE INDEX "Lead_clienteId_idx" ON "Lead"("clienteId");

-- AddForeignKey
ALTER TABLE "Contatto" ADD CONSTRAINT "Contatto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contatto" ADD CONSTRAINT "Contatto_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttivitaLead" ADD CONSTRAINT "AttivitaLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

