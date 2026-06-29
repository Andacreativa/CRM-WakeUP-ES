import SalesSidebar from "@/components/SalesSidebar";

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sales-bg min-h-screen flex">
      <SalesSidebar />
      <main className="flex-1 md:ml-60 min-h-screen p-4 pt-14 md:p-8">
        <div className="max-w-[1100px] mx-auto px-6">{children}</div>
      </main>
    </div>
  );
}
