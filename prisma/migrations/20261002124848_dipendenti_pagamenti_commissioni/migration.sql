-- AlterTable
ALTER TABLE "Dipendente" ADD COLUMN     "attivo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "benefitMensili" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "percentualeCommissione" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "rimborsiMensili" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'dipendente';

-- AlterTable
ALTER TABLE "Fattura" ADD COLUMN     "commercialeId" INTEGER;

-- CreateTable
CREATE TABLE "PagamentoMensile" (
    "id" SERIAL NOT NULL,
    "dipendenteId" INTEGER NOT NULL,
    "anno" INTEGER NOT NULL,
    "mese" INTEGER NOT NULL,
    "voce" TEXT NOT NULL,
    "importo" DOUBLE PRECISION NOT NULL,
    "data" TIMESTAMP(3),
    "note" TEXT,
    "spesaId" INTEGER,
    "fatturaId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PagamentoMensile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PagamentoMensile_spesaId_key" ON "PagamentoMensile"("spesaId");

-- CreateIndex
CREATE INDEX "PagamentoMensile_anno_mese_idx" ON "PagamentoMensile"("anno", "mese");

-- CreateIndex
CREATE INDEX "PagamentoMensile_dipendenteId_anno_idx" ON "PagamentoMensile"("dipendenteId", "anno");

-- CreateIndex
CREATE INDEX "PagamentoMensile_fatturaId_idx" ON "PagamentoMensile"("fatturaId");

-- CreateIndex
CREATE INDEX "Fattura_commercialeId_idx" ON "Fattura"("commercialeId");

-- AddForeignKey
ALTER TABLE "Fattura" ADD CONSTRAINT "Fattura_commercialeId_fkey" FOREIGN KEY ("commercialeId") REFERENCES "Dipendente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagamentoMensile" ADD CONSTRAINT "PagamentoMensile_dipendenteId_fkey" FOREIGN KEY ("dipendenteId") REFERENCES "Dipendente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagamentoMensile" ADD CONSTRAINT "PagamentoMensile_spesaId_fkey" FOREIGN KEY ("spesaId") REFERENCES "Spesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagamentoMensile" ADD CONSTRAINT "PagamentoMensile_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "Fattura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

