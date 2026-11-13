-- Righe del registro pagamenti pagate da una spesa unica (fattura
-- Metropolitan → benefit, addebito AEAT del trimestre → IRPF): solo aggiunte.

-- AlterTable
ALTER TABLE "PagamentoMensile" ADD COLUMN     "spesaCoperturaId" INTEGER;

-- CreateIndex
CREATE INDEX "PagamentoMensile_spesaCoperturaId_idx" ON "PagamentoMensile"("spesaCoperturaId");

-- AddForeignKey
ALTER TABLE "PagamentoMensile" ADD CONSTRAINT "PagamentoMensile_spesaCoperturaId_fkey" FOREIGN KEY ("spesaCoperturaId") REFERENCES "Spesa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
