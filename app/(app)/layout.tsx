import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE, ruoloUtente } from "@/lib/auth";
import Providers from "@/components/Providers";
import AppShell from "@/components/shell/AppShell";

// Layout unico per tutta l'app autenticata: sidebar a sezioni, topbar,
// tab di pagina e corpo. Le aree finance / sales / crm condividono il guscio.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  return (
    <Providers>
      <AppShell username={session?.username ?? ""} ruolo={ruoloUtente(session?.username)}>
        {children}
      </AppShell>
    </Providers>
  );
}
