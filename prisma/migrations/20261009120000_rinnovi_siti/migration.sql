-- AlterTable
ALTER TABLE "RichiestaFattura" ADD COLUMN     "rinnovoId" INTEGER,
ADD COLUMN     "rinnovoScadenza" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RinnovoSito" (
    "id" SERIAL NOT NULL,
    "dominio" TEXT NOT NULL,
    "clienteId" INTEGER,
    "nomeCliente" TEXT,
    "scadenza" TIMESTAMP(3) NOT NULL,
    "importo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fatturazione" TEXT NOT NULL DEFAULT 'rinnovo',
    "stato" TEXT NOT NULL DEFAULT 'attivo',
    "hosting" TEXT,
    "proprieta" TEXT NOT NULL DEFAULT 'nostra',
    "accesso" TEXT,
    "note" TEXT,
    "rinnovatoIl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RinnovoSito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RinnovoSito_dominio_key" ON "RinnovoSito"("dominio");

-- CreateIndex
CREATE INDEX "RinnovoSito_scadenza_idx" ON "RinnovoSito"("scadenza");

-- CreateIndex
CREATE INDEX "RinnovoSito_clienteId_idx" ON "RinnovoSito"("clienteId");

-- CreateIndex
CREATE INDEX "RichiestaFattura_rinnovoId_idx" ON "RichiestaFattura"("rinnovoId");

-- AddForeignKey
ALTER TABLE "RichiestaFattura" ADD CONSTRAINT "RichiestaFattura_rinnovoId_fkey" FOREIGN KEY ("rinnovoId") REFERENCES "RinnovoSito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RinnovoSito" ADD CONSTRAINT "RinnovoSito_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

