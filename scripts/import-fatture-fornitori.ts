import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
import { execSync } from "child_process";
import "dotenv/config";
import { prisma } from "../lib/prisma";

const DOWNLOADS = "/Users/b16451536/Downloads";
const ANNO = 2026;

const ZIPS = [
  {
    file: "Anda Agencia de Publicidad Gastos Enero 2026.zip",
    mese: 1,
    label: "Gennaio 2026",
  },
  {
    file: "Gastos Febrero 26 - Anda Agencia de Publicidad SL.zip",
    mese: 2,
    label: "Febbraio 2026",
  },
  {
    file: "Gastos Marzo 26 - Anda Agencia de Publicidad SL.zip",
    mese: 3,
    label: "Marzo 2026",
  },
];

function listPdfs(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("__MACOSX") || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listPdfs(p));
    else if (e.name.toLowerCase().endsWith(".pdf")) out.push(p);
  }
  return out.sort();
}

function normNome(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function findFornitore(
  q: string,
  fornitori: { id: number; nome: string }[],
): { id: number; nome: string } | null {
  const t = q.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    return fornitori.find((f) => f.id === parseInt(t, 10)) ?? null;
  }
  const n = normNome(t);
  if (!n) return null;
  return (
    fornitori.find((f) => normNome(f.nome) === n) ??
    fornitori.find((f) => normNome(f.nome).includes(n)) ??
    fornitori.find((f) => n.includes(normNome(f.nome))) ??
    null
  );
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const ask = (q: string) =>
  new Promise<string>((resolve) => rl.question(q, resolve));

async function main() {
  const fornitori = await prisma.fornitore.findMany({
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
  console.log(`📋 Anagrafica: ${fornitori.length} fornitori caricati`);
  console.log(
    `   (digita nome o id; invio per saltare e lasciare fornitore vuoto)\n`,
  );

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fatture-import-"));
  const importati: Record<string, number> = {};
  let totale = 0;

  try {
    for (const z of ZIPS) {
      const zipPath = path.join(DOWNLOADS, z.file);
      if (!fs.existsSync(zipPath)) {
        console.log(`⚠ ZIP non trovato: ${z.file} — skip`);
        importati[z.label] = 0;
        continue;
      }

      const tmp = path.join(tmpRoot, `mese-${z.mese}`);
      fs.mkdirSync(tmp, { recursive: true });
      console.log(`\n📦 Estrazione: ${z.file}`);
      execSync(`unzip -o "${zipPath}" -d "${tmp}"`, { stdio: "ignore" });

      const pdfs = listPdfs(tmp);
      console.log(`   ${pdfs.length} PDF trovati per ${z.label}\n`);
      importati[z.label] = 0;

      for (let i = 0; i < pdfs.length; i++) {
        const pdf = pdfs[i];
        const fileName = path.basename(pdf);
        console.log(`──────────────────────────────────────────────────`);
        console.log(`File ${i + 1}/${pdfs.length} - ${z.label}`);
        console.log(`📄 ${fileName}`);

        let fornitoreId: number | null = null;
        while (true) {
          const ans = (
            await ask("   Fornitore? (nome o ID, invio per saltare): ")
          ).trim();
          if (!ans) {
            console.log("   ↪ saltato (fornitore vuoto)");
            break;
          }
          const m = findFornitore(ans, fornitori);
          if (m) {
            fornitoreId = m.id;
            console.log(`   ✓ Matched: ${m.nome} (id ${m.id})`);
            break;
          }
          console.log(
            `   ✗ Nessun match per "${ans}". Riprova o invio per saltare.`,
          );
        }

        const fileData = fs.readFileSync(pdf).toString("base64");
        await prisma.fatturaFornitore.create({
          data: {
            fileName,
            fileData,
            fileMimeType: "application/pdf",
            fornitoreId,
            mese: z.mese,
            anno: ANNO,
            importo: 0,
          },
        });
        importati[z.label]++;
        totale++;
        console.log(`   💾 salvato (${importati[z.label]}/${pdfs.length})`);
      }
    }

    console.log(`\n══════════════ RIEPILOGO ══════════════`);
    for (const z of ZIPS) {
      console.log(`  ${z.label.padEnd(20)} : ${importati[z.label] ?? 0} fatture`);
    }
    console.log(`  ${"TOTALE".padEnd(20)} : ${totale} fatture importate`);
    console.log(`═══════════════════════════════════════\n`);
  } finally {
    rl.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error("\n❌ Errore:", e);
  rl.close();
  await prisma.$disconnect();
  process.exit(1);
});
