import * as fs from "fs";
import "dotenv/config";
import { prisma } from "../lib/prisma";

// Usage: npx tsx scripts/save-fattura.ts <pdfPath> <mese> <anno> <fornitoreId|null> [importo] [dataFatturaISO]
async function main() {
  const [, , pdfPath, meseS, annoS, fornS, importoS, dataS] = process.argv;
  if (!pdfPath || !meseS || !annoS) {
    console.error("Usage: save-fattura <pdfPath> <mese> <anno> <fornitoreId|null> [importo] [dataFatturaISO]");
    process.exit(2);
  }
  const mese = parseInt(meseS, 10);
  const anno = parseInt(annoS, 10);
  const fornitoreId =
    !fornS || fornS === "null" || fornS === "" ? null : parseInt(fornS, 10);
  const importo = importoS ? parseFloat(importoS) : 0;
  const dataFattura = dataS ? new Date(dataS) : null;
  const fileName = pdfPath.split("/").pop()!;
  const fileData = fs.readFileSync(pdfPath).toString("base64");

  const created = await prisma.fatturaFornitore.create({
    data: {
      fileName,
      fileData,
      fileMimeType: "application/pdf",
      fornitoreId,
      mese,
      anno,
      importo,
      dataFattura,
    },
    select: { id: true, fileName: true, fornitoreId: true },
  });
  console.log(JSON.stringify(created));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
