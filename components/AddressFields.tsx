'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { PAESI } from '@/lib/constants'

const COUNTRY_TO_ISO: Record<string, string> = {
  Italia: 'IT',
  Spagna: 'ES',
  Francia: 'FR',
  Germania: 'DE',
  Portogallo: 'PT',
  'Regno Unito': 'GB',
}

// Nominatim restituisce i nomi delle province per esteso (es. "Santa Cruz de Tenerife", "Roma")
// Nessun mapping hardcoded — usiamo direttamente i campi address restituiti dall'API.
async function fetchFromNominatim(cap: string, isoCountry: string) {
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(cap)}&country=${isoCountry.toLowerCase()}&format=json&addressdetails=1&limit=1`
  const res = await fetch(url, { headers: { 'Accept-Language': 'it,es,en' } })
  if (!res.ok) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any[]
  const place = Array.isArray(data) ? data[0] : null
  if (!place?.address) return null
  const a = place.address
  const citta: string =
    a.city || a.town || a.village || a.municipality || a.hamlet || a.locality || ''
  // Per la Spagna `county` è tipicamente la provincia ("Santa Cruz de Tenerife").
  // Per l'Italia `county` è la provincia ("Roma"). `state` è la regione/comunità autonoma.
  const provincia: string =
    a.province || a.county || a.state_district || ''
  return { citta, provincia }
}

// Per l'Italia usiamo zippopotam come fallback per la sola città quando Nominatim non risponde.
async function fetchFromZippopotam(cap: string, isoCountry: string) {
  const url = `https://api.zippopotam.us/${isoCountry.toLowerCase()}/${encodeURIComponent(cap)}`
  const res = await fetch(url)
  if (!res.ok) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any
  const place = data?.places?.[0]
  if (!place) return null
  return { citta: place['place name'] ?? '', provincia: '' }
}

export interface AddressValue {
  via: string
  cap: string
  citta: string
  provincia: string
  paese: string
}

interface Props {
  value: AddressValue
  onChange: (v: AddressValue) => void
  inputClass?: string
}

export default function AddressFields({ value, onChange, inputClass }: Props) {
  const [loading, setLoading] = useState(false)
  const cls =
    inputClass ??
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300'

  const fetchCap = async (cap: string, paese: string) => {
    const iso = COUNTRY_TO_ISO[paese]
    if (!iso) return
    const trimmed = (cap || '').trim()
    if (trimmed.length < 4) return
    setLoading(true)
    try {
      // Primo tentativo: Nominatim (restituisce nomi province per esteso per IT, ES, etc.)
      let result = await fetchFromNominatim(trimmed, iso).catch(() => null)
      // Fallback: zippopotam (almeno per la città) se Nominatim non risponde
      if (!result || (!result.citta && !result.provincia)) {
        result = await fetchFromZippopotam(trimmed, iso).catch(() => null)
      }
      if (result) {
        onChange({
          ...value,
          cap: trimmed,
          citta: result.citta || value.citta,
          provincia: result.provincia || value.provincia,
        })
      }
    } catch (e) {
      console.error('address lookup', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="text-xs font-medium text-gray-600 block mb-1">Via</label>
        <input
          type="text"
          value={value.via}
          onChange={e => onChange({ ...value, via: e.target.value })}
          placeholder="Via Roma 1"
          className={cls}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1 flex items-center gap-2">
          Codice Postale
          {loading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
        </label>
        <input
          type="text"
          value={value.cap}
          onChange={e => onChange({ ...value, cap: e.target.value })}
          onBlur={e => fetchCap(e.target.value, value.paese)}
          placeholder="00100"
          className={cls}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Stato</label>
        <select
          value={value.paese}
          onChange={e => {
            const newPaese = e.target.value
            onChange({ ...value, paese: newPaese })
            if (value.cap) fetchCap(value.cap, newPaese)
          }}
          className={cls}
        >
          {PAESI.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Città</label>
        <input
          type="text"
          value={value.citta}
          onChange={e => onChange({ ...value, citta: e.target.value })}
          placeholder="Roma"
          className={cls}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Provincia</label>
        <input
          type="text"
          value={value.provincia}
          onChange={e => onChange({ ...value, provincia: e.target.value })}
          placeholder="RM"
          className={cls}
        />
      </div>
    </div>
  )
}

// Helper per costruire una stringa indirizzo umana
export function formatAddress(a: Partial<AddressValue>): string {
  const parts = [
    a.via,
    [a.cap, a.citta].filter(Boolean).join(' '),
    [a.provincia, a.paese].filter(Boolean).join(' · '),
  ].filter(p => p && String(p).trim() !== '')
  return parts.join(', ')
}
