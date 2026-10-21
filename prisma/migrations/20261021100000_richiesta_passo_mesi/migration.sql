-- AlterTable: passo libero delle richieste di fattura («Ogni N mesi»).
-- Solo aggiunta di una colonna facoltativa: le righe esistenti restano NULL.
ALTER TABLE "RichiestaFattura" ADD COLUMN     "passoMesi" INTEGER;
