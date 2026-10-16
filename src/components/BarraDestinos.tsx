import type { ParteDestino } from '../lib/objetivos'
import { formatarBRL, formatarPercentual } from '../lib/formato'

const pct = (f: number) => formatarPercentual(f, false)

/** Barra empilhada com a divisão de um valor entre destinos (investido, reserva, objetivos). */
export function BarraDestinos({ partes, altura = 'h-2' }: { partes: ParteDestino[]; altura?: string }) {
  const descricao = partes.map((p) => `${p.nome} ${pct(p.fracao)}`).join(', ')
  return (
    <div className={`flex ${altura} overflow-hidden rounded-full bg-linha`} role="img" aria-label={descricao}>
      {partes.map((p) => (
        <div key={p.chave} style={{ width: `${p.fracao * 100}%`, background: p.cor }} title={`${p.nome}: ${pct(p.fracao)}`} />
      ))}
    </div>
  )
}

/** Legenda compacta: "● Investido 50% · ● Viagem 20% · …" (uma linha que quebra). */
export function LegendaCompacta({ partes }: { partes: ParteDestino[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-texto-2">
      {partes.map((p) => (
        <span key={p.chave} className="flex items-center gap-1">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.cor }} />
          {p.nome} {pct(p.fracao)}
        </span>
      ))}
    </div>
  )
}

/** Legenda detalhada: uma linha por destino com % e valor. */
export function LegendaDetalhada({ partes }: { partes: ParteDestino[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {partes.map((p) => (
        <div key={p.chave} className="flex items-center justify-between gap-2 text-[13px]">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.cor }} />
            <span className="truncate font-bold">{p.nome}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-2">
            <span className="text-xs text-texto-2">{pct(p.fracao)}</span>
            <span className="w-[92px] text-right font-mono">{formatarBRL(p.valor)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
