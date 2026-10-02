-- AlterTable
ALTER TABLE "Fattura" ADD COLUMN     "presentata" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "presentataIl" TIMESTAMP(3);
