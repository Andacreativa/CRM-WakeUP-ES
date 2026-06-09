"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function PageSizeSelect({
  pageSize,
  onChange,
}: {
  pageSize: number;
  onChange: (n: number) => void;
}) {
  return (
    <select
      value={pageSize}
      onChange={(e) => onChange(parseInt(e.target.value))}
      className="text-sm font-medium px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 outline-none cursor-pointer appearance-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
        paddingRight: "28px",
      }}
    >
      {PAGE_SIZE_OPTIONS.map((n) => (
        <option key={n} value={n}>
          {n} per pagina
        </option>
      ))}
    </select>
  );
}

interface PageNavProps {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  labelSuffix?: string;
  accentColor?: string;
}

export function PageNav({
  total,
  page,
  pageSize,
  onPage,
  labelSuffix,
  accentColor = "#e8308a",
}: PageNavProps) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(Math.max(1, page), totalPages);
  const from = (cur - 1) * pageSize + 1;
  const to = Math.min(cur * pageSize, total);

  // Compact page list: 1 ... cur-1 cur cur+1 ... last
  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (cur > 3) pages.push("…");
    for (
      let i = Math.max(2, cur - 1);
      i <= Math.min(totalPages - 1, cur + 1);
      i++
    ) {
      pages.push(i);
    }
    if (cur < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  const navBtn = (
    icon: React.ReactNode,
    target: number,
    disabled: boolean,
    key: string,
  ) => (
    <button
      key={key}
      onClick={() => !disabled && onPage(target)}
      disabled={disabled}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${disabled ? "border-gray-100 text-gray-300 cursor-not-allowed" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 mt-4 px-2">
      <div className="text-sm text-gray-500">
        {from}–{to} di {total}
        {labelSuffix ? ` ${labelSuffix}` : ""}
      </div>
      <div className="flex items-center gap-1">
        {navBtn(<ChevronsLeft className="w-4 h-4" />, 1, cur === 1, "first")}
        {navBtn(
          <ChevronLeft className="w-4 h-4" />,
          cur - 1,
          cur === 1,
          "prev",
        )}
        {pages.map((p, i) =>
          p === "…" ? (
            <span
              key={`e-${i}`}
              className="px-2 text-gray-400 text-sm select-none"
            >
              …
            </span>
          ) : (
            <button
              key={`p-${p}`}
              onClick={() => onPage(p)}
              className={`min-w-8 h-8 px-2 rounded-lg text-sm font-medium border ${p === cur ? "text-white border-transparent" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
              style={p === cur ? { background: accentColor } : undefined}
            >
              {p}
            </button>
          ),
        )}
        {navBtn(
          <ChevronRight className="w-4 h-4" />,
          cur + 1,
          cur === totalPages,
          "next",
        )}
        {navBtn(
          <ChevronsRight className="w-4 h-4" />,
          totalPages,
          cur === totalPages,
          "last",
        )}
      </div>
    </div>
  );
}
