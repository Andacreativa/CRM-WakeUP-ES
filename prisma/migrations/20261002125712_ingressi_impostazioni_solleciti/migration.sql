-- AlterTable
ALTER TABLE "AltroIngresso" ADD COLUMN     "categoria" TEXT;

-- CreateTable
CREATE TABLE "Sollecito" (
    "id" SERIAL NOT NULL,
    "fatturaId" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canale" TEXT NOT NULL DEFAULT 'email',
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sollecito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Impostazione" (
    "chiave" TEXT NOT NULL,
    "valore" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Impostazione_pkey" PRIMARY KEY ("chiave")
);

-- CreateIndex
CREATE INDEX "Sollecito_fatturaId_idx" ON "Sollecito"("fatturaId");

-- AddForeignKey
ALTER TABLE "Sollecito" ADD CONSTRAINT "Sollecito_fatturaId_fkey" FOREIGN KEY ("fatturaId") REFERENCES "Fattura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

