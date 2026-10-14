import { useEffect, useState } from 'react'

type Tema = 'claro' | 'escuro'

function temaAtual(): Tema {
  return document.documentElement.classList.contains('dark') ? 'escuro' : 'claro'
}

export function BotaoTema() {
  const [tema, setTema] = useState<Tema>(temaAtual)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'escuro')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'escuro' ? '#0E1116' : '#0F6E52')
    try {
      localStorage.setItem('tema', tema)
    } catch {
      // armazenamento indisponível: o tema vale só nesta sessão
    }
  }, [tema])

  const proximo = tema === 'escuro' ? 'claro' : 'escuro'
  return (
    <button
      type="button"
      onClick={() => setTema(proximo)}
      aria-label={`Usar tema ${proximo}`}
      title={`Usar tema ${proximo}`}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-borda bg-cartao text-texto-2"
    >
      {tema === 'escuro' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
