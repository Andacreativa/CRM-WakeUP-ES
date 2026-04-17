'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, FileText, Home, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import CompanyInfoModal from './CompanyInfoModal'

const BRAND = '#db291b'

const navItems = [
  { href: '/sales', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sales/contatti', label: 'Contatti', icon: Users },
  { href: '/sales/preventivi', label: 'Preventivi', icon: FileText },
]

export default function SalesSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-3 left-3 z-50 md:hidden p-2 rounded-lg shadow-lg"
        style={{ background: '#000000' }}
        onClick={() => setOpen(true)}
        aria-label="Apri menu"
      >
        <Menu size={20} color="#ffffff" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-60 flex flex-col z-50 transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
        style={{ background: '#000000' }}
      >
        <button
          className="md:hidden absolute top-3 right-3 p-1.5 rounded-lg text-gray-500 hover:text-white transition-colors"
          onClick={() => setOpen(false)}
        >
          <X size={18} />
        </button>

        <div className="px-6 py-5 border-b border-[#222222]">
          <div className="flex justify-start mb-5">
            <div
              className="rounded-full bg-white flex items-center justify-center"
              style={{ width: 80, height: 80 }}
            >
              <img
                src="/WAKE UP! labs - LOGO.png"
                alt="Wake Up Labs"
                style={{ width: 72, height: 72, objectFit: 'contain' }}
              />
            </div>
          </div>
          <button
            onClick={() => setInfoOpen(true)}
            className="block w-full cursor-pointer hover:opacity-80 transition-opacity mb-4"
            style={{ textAlign: 'left' }}
            aria-label="Mostra dati aziendali"
          >
            <p className="text-xs font-medium leading-tight" style={{ color: '#ffffff' }}>Anda Agencia de</p>
            <p className="text-xs font-medium leading-tight" style={{ color: '#ffffff' }}>Publicidad SL</p>
          </button>
          <div className="py-3 border-t border-[#222222]" style={{ textAlign: 'left' }}>
            <p className="text-xs font-medium" style={{ color: BRAND }}>CEO Dashboard</p>
            <p className="text-xs" style={{ color: '#888888' }}>Lorenzo Vanghetti</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  active ? 'text-white shadow-md' : 'hover:text-white'
                )}
                style={active ? { background: BRAND } : { color: '#fca5a5' }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = '#1a1a1a'
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                <Icon size={18} className="shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 pt-2 border-t border-[#222222]">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
            style={{ color: '#555555' }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLElement).style.color = '#ffffff'
              ;(e.currentTarget as HTMLElement).style.background = '#1a1a1a'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLElement).style.color = '#555555'
              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            <Home size={18} className="shrink-0" />
            Home
          </Link>
        </div>

        <div className="px-6 py-4">
          <p className="text-xs" style={{ color: '#555555' }}>
            © 2025 Anda Agencia de Publicidad SL
          </p>
        </div>
      </aside>

      <CompanyInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  )
}
