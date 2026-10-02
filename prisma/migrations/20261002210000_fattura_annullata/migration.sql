-- AlterTable
ALTER TABLE "Fattura" ADD COLUMN     "annullata" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "annullataIl" TIMESTAMP(3);
