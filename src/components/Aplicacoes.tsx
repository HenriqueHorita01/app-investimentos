import { useState } from 'react'
import { diasCorridos, tributacaoDoLote, type Lote, type Tributacao } from '../lib/calculos'
import { formatarBRL, formatarBRLComSinal, formatarData, formatarPercentual } from '../lib/formato'
import { descreverTaxa, type TipoAtivo } from '../lib/tipos'
import { corSinal } from './ui'

/** LCI/LCA: isentas de IR e IOF para pessoa física. */
export const ehIsenta = (tipo: TipoAtivo) => tipo === 'lci_lca'

export type SituacaoVencimento = 'vencida' | 'proxima' | null

/** Vencida = disponível para reinvestir; próxima = vence em até `janela` dias. */
export function situacaoVencimento(l: Pick<Lote, 'vencimento' | 'saldo'>, hoje: string, janela = 90): SituacaoVencimento {
  if (!l.vencimento || l.saldo <= 0.005) return null
  if (l.vencimento <= hoje) return 'vencida'
  if (diasCorridos(hoje, l.vencimento) <= janela) return 'proxima'
  return null
}

export interface TotaisLotes {
  aplicado: number
  bruto: number
  rendimento: number
  impostos: number
  liquido: number
}

export function totaisDosLotes(lotes: Lote[], hoje: string, isenta: boolean): TotaisLotes {
  return lotes
    .filter((l) => l.saldo > 0.005)
    .reduce(
      (t, l) => {
        const tr = tributacaoDoLote(l, hoje, isenta)
        return {
          aplicado: t.aplicado + l.custo,
          bruto: t.bruto + l.saldo,
          rendimento: t.rendimento + tr.rendimento,
          impostos: t.impostos + tr.ir + tr.iof,
          liquido: t.liquido + tr.liquido,
        }
      },
      { aplicado: 0, bruto: 0, rendimento: 0, impostos: 0, liquido: 0 },
    )
}

/** Lista as aplicações (lotes) de um investimento de renda fixa, uma a uma. */
export function ListaAplicacoes({
  lotes,
  tipo,
  hoje,
  nomeDestino,
  mostrarEncerradas = false,
}: {
  lotes: Lote[]
  tipo: TipoAtivo
  hoje: string
  /** Nome do destino (Investido, Reserva, objetivo) de cada aplicação. */
  nomeDestino?: (destino: string) => string
  mostrarEncerradas?: boolean
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const isenta = ehIsenta(tipo)
  const visiveis = lotes.filter((l) => mostrarEncerradas || l.saldo > 0.005)
  if (!visiveis.length) return <div className="text-[13px] text-texto-2">Nenhuma aplicação ativa.</div>
  return (
    <div className="flex flex-col">
      {visiveis.map((l, i) => {
        const tr = tributacaoDoLote(l, hoje, isenta)
        const sit = situacaoVencimento(l, hoje)
        const chave = `${l.movId}-${i}`
        const exp = aberto === chave
        return (
          <div key={chave} className="border-b border-linha py-2 last:border-0">
            <button type="button" onClick={() => setAberto(exp ? null : chave)} aria-expanded={exp} className="flex w-full items-start justify-between gap-2 text-left">
              <span className="min-w-0">
                <span className="text-[13px] font-bold">{formatarData(l.data)}</span>
                <span className="text-xs text-texto-2"> · {formatarBRL(l.aplicado)} · {descreverTaxa(l) || 'sem taxa'}</span>
                <span className="flex flex-wrap gap-1.5 pt-0.5">
                  {l.vencimento && <span className="text-[11px] text-texto-2">vence {formatarData(l.vencimento)}</span>}
                  {sit === 'vencida' && <Etiqueta cor="var(--positivo)">vencida · disponível para reinvestir</Etiqueta>}
                  {sit === 'proxima' && <Etiqueta cor="var(--reservado)">vence em {diasCorridos(hoje, l.vencimento!)} dias</Etiqueta>}
                  {l.saldo <= 0.005 && <Etiqueta cor="var(--texto-2)">encerrada</Etiqueta>}
                  {nomeDestino && <span className="text-[11px] text-texto-2">· {nomeDestino(l.destino)}</span>}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-[13px]">{formatarBRL(l.saldo)}</span>
                <span className={`block text-[11px] ${corSinal(tr.rendimento)}`}>{formatarBRLComSinal(tr.rendimento)}</span>
              </span>
            </button>
            {exp && <DetalheLote l={l} tr={tr} />}
          </div>
        )
      })}
    </div>
  )
}

function DetalheLote({ l, tr }: { l: Lote; tr: Tributacao }) {
  const linha = (rotulo: string, valor: string, cor = '') => (
    <div className="flex justify-between">
      <span className="text-texto-2">{rotulo}</span>
      <span className={`font-mono ${cor}`}>{valor}</span>
    </div>
  )
  return (
    <div className="mt-2 flex flex-col gap-1 rounded-lg bg-fundo p-2.5 text-xs">
      {linha('Aplicado', formatarBRL(l.aplicado))}
      {Math.abs(l.custo - l.aplicado) > 0.005 && linha('Custo restante (após resgates)', formatarBRL(l.custo))}
      {linha('Saldo bruto', formatarBRL(l.saldo))}
      {linha('Rendimento bruto', formatarBRLComSinal(tr.rendimento), corSinal(tr.rendimento))}
      {linha('Prazo', `${tr.dias} dias`)}
      {tr.isenta ? (
        linha('IR', 'isento (LCI/LCA)')
      ) : (
        <>
          {tr.iof > 0.004 && linha('IOF (menos de 30 dias)', `− ${formatarBRL(tr.iof)}`)}
          {linha(`IR (${formatarPercentual(tr.aliquotaIR, false)})`, `− ${formatarBRL(tr.ir)}`)}
        </>
      )}
      {linha('Líquido estimado', formatarBRL(tr.liquido))}
      {(l.liquidez || l.carencia) && (
        <div className="pt-1 text-texto-2">
          {[l.liquidez && `Liquidez: ${l.liquidez}`, l.carencia && `carência até ${formatarData(l.carencia)}`].filter(Boolean).join(' · ')}
        </div>
      )}
      {l.ipcaEstimado && <div className="pt-1 text-texto-2">IPCA dos meses ainda não divulgados é projetado pelo último conhecido.</div>}
      <div className="pt-1 text-[11px] text-texto-2">Estimativa, sem custódia/taxas da corretora. O extrato é a referência final.</div>
    </div>
  )
}

function Etiqueta({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="rounded-full px-1.5 text-[10px] font-bold" style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
      {children}
    </span>
  )
}
