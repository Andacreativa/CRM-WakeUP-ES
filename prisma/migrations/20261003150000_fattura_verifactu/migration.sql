-- Fatture: bozza/emessa, descrizione e righe, causa a 0 %, rettificative,
-- stato VeriFactu; registri di fatturazione concatenati. Solo aggiunte:
-- le fatture esistenti restano "emessa", tipo F1, senza registri.
-- AlterTable
ALTER TABLE "Fattura" ADD COLUMN     "causaIgic" TEXT,
ADD COLUMN     "descrizione" TEXT,
ADD COLUMN     "emessaIl" TIMESTAMP(3),
ADD COLUMN     "rettificaDiId" INTEGER,
ADD COLUMN     "stato" TEXT NOT NULL DEFAULT 'emessa',
ADD COLUMN     "tipoFattura" TEXT NOT NULL DEFAULT 'F1',
ADD COLUMN     "vfQr" TEXT,
ADD COLUMN     "vfStato" TEXT,
ADD COLUMN     "voci" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "RegistroVerifactu" (
    "id" SERIAL NOT NULL,
    "fatturaId" INTEGER NOT NULL,
    "ambiente" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "subsanacion" BOOLEAN NOT NULL DEFAULT false,
    "nifEmittente" TEXT NOT NULL,
    "numSerie" TEXT NOT NULL,
    "dataFattura" TEXT NOT NULL,
    "huellaPrecedente" TEXT,
    "huella" TEXT NOT NULL,
    "generatoIl" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'in_coda',
    "csv" TEXT,
    "codiceErrore" TEXT,
    "descrizioneErrore" TEXT,
    "risposta" TEXT,
    "tentativi" INTEGER NOT NULL DEFAULT 0,
    "ultimoErrore" TEXT,
    "inviatoIl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroVerifactu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroVerifactu_fatturaId_idx" ON "RegistroVerifactu"("fatturaId");

-- CreateIndex
CREATE INDEX "RegistroVerifactu_ambiente_id_idx" ON "RegistroVerifactu"("ambiente", "id");

-- CreateIndex
CREATE INDEX "RegistroVerifactu_stato_idx" ON "RegistroVerifactu"("stato");

-- CreateIndex
CREATE INDEX "Fattura_rettificaDiId_idx" ON "Fattura"("rettificaDiId");

-- AddForeignKey
ALTER TABLE "Fattura" ADD CONSTRAINT "Fattura_rettificaDiId_fkey" FOREIGN KEY ("rettificaDiId") REFERENCES "Fattura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroVerifactu" ADD CONSTRAINT "RegistroVerifactu_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "Fattura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

