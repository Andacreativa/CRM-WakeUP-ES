"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Errore di autenticazione");
        return;
      }
      const requested = params.get("next");
      const next = requested && requested !== "/" ? requested : "/finance";
      router.replace(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="glass-card rounded-2xl w-full max-w-sm p-8 space-y-5"
    >
      <div className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm">
          <img
            src="/logo anda.png"
            alt="Anda"
            className="w-11 h-11 object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Anda</h1>
        <p className="text-sm text-gray-500">
          Gestionale Anda Agencia de Publicidad SL
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 bg-white"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
              aria-label={
                showPassword ? "Nascondi password" : "Mostra password"
              }
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !username || !password}
        className="glass-btn-primary w-full text-white text-sm font-medium py-2.5 rounded-xl disabled:opacity-60"
      >
        {loading ? "Accesso..." : "Accedi"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
