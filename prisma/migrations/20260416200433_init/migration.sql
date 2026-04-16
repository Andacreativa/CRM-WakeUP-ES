-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "paese" TEXT NOT NULL DEFAULT 'Italia',
    "email" TEXT,
    "telefono" TEXT,
    "partitaIva" TEXT,
    "indirizzo" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fattura" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "azienda" TEXT NOT NULL DEFAULT 'Spagna',
    "aziendaNota" TEXT,
    "descrizione" TEXT,
    "mese" INTEGER NOT NULL,
    "anno" INTEGER NOT NULL DEFAULT 2025,
    "importo" DOUBLE PRECISION NOT NULL,
    "pagato" BOOLEAN NOT NULL DEFAULT false,
    "scadenza" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fattura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spesa" (
    "id" SERIAL NOT NULL,
    "azienda" TEXT NOT NULL DEFAULT 'Spagna',
    "aziendaNota" TEXT,
    "fornitore" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descrizione" TEXT,
    "note" TEXT,
    "ricevutaPath" TEXT,
    "mese" INTEGER NOT NULL,
    "anno" INTEGER NOT NULL DEFAULT 2025,
    "importo" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Spesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contatto" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "paese" TEXT NOT NULL DEFAULT 'Italia',
    "email" TEXT,
    "telefono" TEXT,
    "partitaIva" TEXT,
    "indirizzo" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'lead',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contatto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Preventivo" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "nomeCliente" TEXT NOT NULL,
    "emailCliente" TEXT,
    "aziendaCliente" TEXT,
    "azienda" TEXT NOT NULL DEFAULT 'Spagna',
    "oggetto" TEXT NOT NULL,
    "voci" TEXT NOT NULL,
    "iva" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "subtotale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'attesa',
    "note" TEXT,
    "condizioni" TEXT,
    "dataScadenza" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Preventivo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Fattura" ADD CONSTRAINT "Fattura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
