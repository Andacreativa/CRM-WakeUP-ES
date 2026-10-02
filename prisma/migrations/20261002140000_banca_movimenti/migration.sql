-- CreateTable
CREATE TABLE "ImportBancario" (
    "id" SERIAL NOT NULL,
    "banca" TEXT NOT NULL DEFAULT 'BBVA',
    "nomeFile" TEXT NOT NULL,
    "hashFile" TEXT NOT NULL,
    "conto" TEXT,
    "titolare" TEXT,
    "periodoDa" TIMESTAMP(3),
    "periodoA" TIMESTAMP(3),
    "righeLette" INTEGER NOT NULL DEFAULT 0,
    "righeNuove" INTEGER NOT NULL DEFAULT 0,
    "righeDuplicate" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBancario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoBancario" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "impronta" TEXT NOT NULL,
    "dataContabile" TIMESTAMP(3) NOT NULL,
    "dataValore" TIMESTAMP(3),
    "codice" TEXT,
    "concetto" TEXT NOT NULL,
    "beneficiario" TEXT,
    "osservazioni" TEXT,
    "importo" DOUBLE PRECISION NOT NULL,
    "saldo" DOUBLE PRECISION,
    "stato" TEXT NOT NULL DEFAULT 'da_abbinare',
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimentoBancario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbbinamentoBancario" (
    "id" SERIAL NOT NULL,
    "movimentoId" INTEGER NOT NULL,
    "spesaId" INTEGER,
    "fatturaId" INTEGER,
    "accontoId" INTEGER,
    "altroIngressoId" INTEGER,
    "importo" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbbinamentoBancario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoBancario_impronta_key" ON "MovimentoBancario"("impronta");

-- CreateIndex
CREATE INDEX "MovimentoBancario_dataContabile_idx" ON "MovimentoBancario"("dataContabile");

-- CreateIndex
CREATE INDEX "MovimentoBancario_stato_idx" ON "MovimentoBancario"("stato");

-- CreateIndex
CREATE INDEX "MovimentoBancario_importId_idx" ON "MovimentoBancario"("importId");

-- CreateIndex
CREATE INDEX "AbbinamentoBancario_movimentoId_idx" ON "AbbinamentoBancario"("movimentoId");

-- CreateIndex
CREATE INDEX "AbbinamentoBancario_spesaId_idx" ON "AbbinamentoBancario"("spesaId");

-- CreateIndex
CREATE INDEX "AbbinamentoBancario_fatturaId_idx" ON "AbbinamentoBancario"("fatturaId");

-- CreateIndex
CREATE INDEX "AbbinamentoBancario_accontoId_idx" ON "AbbinamentoBancario"("accontoId");

-- CreateIndex
CREATE INDEX "AbbinamentoBancario_altroIngressoId_idx" ON "AbbinamentoBancario"("altroIngressoId");

-- AddForeignKey
ALTER TABLE "MovimentoBancario" ADD CONSTRAINT "MovimentoBancario_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ImportBancario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbbinamentoBancario" ADD CONSTRAINT "AbbinamentoBancario_movimentoId_fkey" FOREIGN KEY ("movimentoId") REFERENCES "MovimentoBancario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbbinamentoBancario" ADD CONSTRAINT "AbbinamentoBancario_spesaId_fkey" FOREIGN KEY ("spesaId") REFERENCES "Spesa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbbinamentoBancario" ADD CONSTRAINT "AbbinamentoBancario_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "Fattura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbbinamentoBancario" ADD CONSTRAINT "AbbinamentoBancario_accontoId_fkey" FOREIGN KEY ("accontoId") REFERENCES "Acconto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbbinamentoBancario" ADD CONSTRAINT "AbbinamentoBancario_altroIngressoId_fkey" FOREIGN KEY ("altroIngressoId") REFERENCES "AltroIngresso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

