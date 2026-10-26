-- CreateTable
CREATE TABLE "MandatoSepaStorico" (
    "id" SERIAL NOT NULL,
    "abbonamentoId" INTEGER NOT NULL,
    "mandatoRef" TEXT NOT NULL,
    "titolareConto" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bic" TEXT,
    "firmatoIl" TIMESTAMP(3),
    "luogo" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "sostituitoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sostituitoIp" TEXT,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MandatoSepaStorico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MandatoSepaStorico_abbonamentoId_idx" ON "MandatoSepaStorico"("abbonamentoId");

-- AddForeignKey
ALTER TABLE "MandatoSepaStorico" ADD CONSTRAINT "MandatoSepaStorico_abbonamentoId_fkey" FOREIGN KEY ("abbonamentoId") REFERENCES "Abbonamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
