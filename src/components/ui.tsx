import type { ReactNode } from 'react'

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[14px] bg-cartao p-4 ${className}`}>{children}</div>
}

export function Titulo({ children, direita }: { children: ReactNode; direita?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-[22px] font-bold">{children}</h1>
      {direita}
    </div>
  )
}

export function Carregando() {
  return <div className="py-10 text-center text-sm text-texto-2">Carregando…</div>
}

export function Erro({ mensagem, tentar }: { mensagem: string; tentar?: () => void }) {
  return (
    <Cartao className="flex flex-col gap-2">
      <div role="alert" className="text-sm text-negativo">{mensagem}</div>
      {tentar && (
        <button type="button" onClick={tentar} className="self-start text-sm font-bold text-positivo">
          Tentar de novo
        </button>
      )}
    </Cartao>
  )
}

/** Classe de cor para valores com sinal (positivo / negativo / neutro). */
export function corSinal(v: number): string {
  if (v > 0.005) return 'text-positivo'
  if (v < -0.005) return 'text-negativo'
  return 'text-texto-2'
}

export function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="rotulo">{rotulo}</label>
      {children}
    </div>
  )
}
