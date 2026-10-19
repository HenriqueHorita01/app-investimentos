import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { acompanhar, type MesAcomp } from '../../lib/carteiraAcompanhamento'
import { formatarBRL, formatarBRLComSinal, formatarMesAno, formatarPercentual, hojeSP } from '../../lib/formato'
import { Cartao, corSinal } from '../ui'
import type { DadosMinhaCarteira } from '../../pages/MinhaCarteira'

type Base = 'aplicado' | 'valor'

export function Acompanhamento({ dados }: { dados: DadosMinhaCarteira }) {
  const hoje = hojeSP()
  const r = useMemo(
    () =>
      acompanhar(
        dados.planejamento,
        dados.carteira.ativos.map((a, i) => ({ plano: dados.ativosPlano[i], movimentacoes: a.movimentacoes })),
        hoje,
      ),
    [dados, hoje],
  )
  const [base, setBase] = useState<Base>('aplicado')

  if (!r.ativos.length) {
    return (
      <Cartao className="text-sm text-texto-2">
        Nenhum investimento em "Investido" ainda. O acompanhamento considera só essa parte (objetivos e reserva ficam fora).
      </Cartao>
    )
  }

  const total = base === 'aplicado' ? r.aplicado : r.valor
  return (
    <>
      <Cartao className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-bold">Carteira (parte Investido)</div>
          <div className="font-mono text-lg">{formatarBRL(r.aplicado)}</div>
        </div>
        <div className="-mt-2 text-right text-[11px] text-texto-2">aplicado</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
          <Dado rotulo="Valor atual (estim.)" valor={formatarBRL(r.valor)} />
          <Dado rotulo="Rendimento / valorização" valor={formatarBRLComSinal(r.rendimento)} cor={corSinal(r.rendimento)} />
          <Dado rotulo="Dividendos recebidos" valor={formatarBRLComSinal(r.dividendos)} cor={corSinal(r.dividendos)} />
          <Dado
            rotulo="Retorno total"
            valor={`${formatarBRLComSinal(r.retornoTotal)}${r.aplicado > 0 ? ` (${formatarPercentual(r.retornoTotal / r.aplicado)})` : ''}`}
            cor={corSinal(r.retornoTotal)}
          />
        </div>
        <div className="text-[11px] text-texto-2">
          Retorno = valor atual − aplicado + dividendos. Cada real conta uma vez: dividendo reinvestido vira aporte, não soma de novo no retorno.
        </div>
      </Cartao>

      <Cartao className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold">Planejado × atual</div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-segmento p-0.5 text-xs" role="tablist" aria-label="Base da distribuição">
            {(
              [
                ['aplicado', 'Aplicado'],
                ['valor', 'Valor atual'],
              ] as const
            ).map(([b, rotulo]) => (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={base === b}
                onClick={() => setBase(b)}
                className={`rounded-md px-2.5 py-1 ${base === b ? 'bg-segmento-ativo font-bold shadow-sm' : 'text-texto-2'}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
        {r.categorias.map((c) => {
          const v = base === 'aplicado' ? c.aplicado : c.valor
          const atual = total > 0 ? v / total : 0
          const alvo = c.alvo != null ? c.alvo / 100 : null
          const desvio = alvo != null ? (atual - alvo) * 100 : null
          return (
            <div key={c.id ?? 'sem'} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.cor }} />
                  <span className="truncate">{c.nome}</span>
                </span>
                <span className="shrink-0 font-mono text-xs">
                  {formatarPercentual(atual, false)}
                  {alvo != null && <span className="text-texto-2"> / {formatarPercentual(alvo, false)}</span>}
                </span>
              </div>
              <div
                className="relative h-2 rounded-sm bg-linha"
                title={`${c.nome}: ${formatarBRL(v)} (${formatarPercentual(atual, false)})${alvo != null ? ` · meta ${formatarPercentual(alvo, false)}` : ''}`}
              >
                <div className="h-2 rounded-sm" style={{ width: `${Math.min(100, atual * 100)}%`, background: c.cor }} />
                {alvo != null && (
                  <div className="absolute -top-1 h-4 w-0.5 rounded bg-texto" style={{ left: `calc(${Math.min(100, alvo * 100)}% - 1px)` }} aria-hidden="true" />
                )}
              </div>
              <div className="flex justify-between text-[11px] text-texto-2">
                <span>{formatarBRL(v)}</span>
                {desvio != null && (
                  <span>
                    {Math.abs(desvio) < 0.5 ? 'na meta' : `${desvio > 0 ? '+' : '−'}${Math.abs(desvio).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p. ${desvio > 0 ? 'acima' : 'abaixo'}`}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        <div className="text-[11px] text-texto-2">
          Barra = atual; traço = meta do Planejamento. Para decidir onde aportar, veja{' '}
          <Link to="/minha-carteira?area=prioridades" className="font-bold text-positivo">Prioridades</Link>.
        </div>
      </Cartao>

      <Evolucao meses={r.meses} />

      <Cartao className="flex flex-col gap-2">
        <div className="text-sm font-bold">Por investimento</div>
        {r.ativos.map((a) => {
          const ret = a.valor - a.aplicado + a.dividendos
          return (
            <Link key={a.id} to={`/ativo/${a.id}`} className="flex items-baseline justify-between gap-2 border-b border-linha py-1.5 text-[13px] last:border-0">
              <span className="min-w-0 truncate">{a.rotulo}</span>
              <span className="shrink-0 text-right">
                <span className="block font-mono">{formatarBRL(a.aplicado)}</span>
                <span className={`block text-[11px] ${corSinal(ret)}`}>
                  {formatarBRLComSinal(ret)}
                  {a.dividendos > 0.005 ? ` (dividendos ${formatarBRL(a.dividendos)})` : ''}
                </span>
              </span>
            </Link>
          )
        })}
        {r.dividendosAnteriores > 0.005 && (
          <div className="text-[11px] text-texto-2">Inclui {formatarBRL(r.dividendosAnteriores)} de dividendos recebidos antes do cadastro (sem mês na evolução).</div>
        )}
      </Cartao>
    </>
  )
}

/** Aplicado acumulado no fim de cada mês (últimos 12), com tabela dos movimentos. */
function Evolucao({ meses }: { meses: MesAcomp[] }) {
  const ultimos = meses.slice(-12)
  const [foco, setFoco] = useState<number | null>(null)
  if (!ultimos.length) return null
  const max = Math.max(...ultimos.map((m) => m.aplicadoAcumulado), 1)
  const L = 300
  const A = 120
  const passo = L / ultimos.length
  const larg = Math.max(4, Math.min(28, passo - 4))
  const m = foco != null ? ultimos[foco] : ultimos[ultimos.length - 1]
  return (
    <Cartao className="flex flex-col gap-2.5">
      <div className="text-sm font-bold">Evolução do aplicado</div>
      <div className="flex items-baseline justify-between text-xs" aria-live="polite">
        <span className="text-texto-2">{formatarMesAno(m.mes)}</span>
        <span>
          <span className="font-mono text-[13px]">{formatarBRL(m.aplicadoAcumulado)}</span>
          {m.aportes > 0.005 && <span className="text-texto-2"> · +{formatarBRL(m.aportes)} no mês</span>}
          {m.resgates > 0.005 && <span className="text-texto-2"> · −{formatarBRL(m.resgates)}</span>}
        </span>
      </div>
      <svg viewBox={`0 0 ${L} ${A + 16}`} className="w-full" role="img" aria-label="Aplicado acumulado por mês" onMouseLeave={() => setFoco(null)}>
        <line x1="0" x2={L} y1={A} y2={A} stroke="var(--linha)" strokeWidth="1" />
        {ultimos.map((mm, i) => {
          const h = Math.max(mm.aplicadoAcumulado > 0 ? 2 : 0, (mm.aplicadoAcumulado / max) * (A - 8))
          const x = i * passo + (passo - larg) / 2
          const ativo = foco === i || (foco == null && i === ultimos.length - 1)
          return (
            <g key={mm.mes} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)} onTouchStart={() => setFoco(i)}>
              <rect x={i * passo} y="0" width={passo} height={A + 16} fill="transparent" />
              <path
                d={`M${x},${A} V${A - h + Math.min(4, h)} Q${x},${A - h} ${x + Math.min(4, h)},${A - h} H${x + larg - Math.min(4, h)} Q${x + larg},${A - h} ${x + larg},${A - h + Math.min(4, h)} V${A} Z`}
                fill="var(--positivo)"
                opacity={ativo ? 1 : 0.55}
              />
              {(i === 0 || i === ultimos.length - 1 || ultimos.length <= 6) && (
                <text x={i * passo + passo / 2} y={A + 12} textAnchor="middle" fontSize="9" fill="var(--texto-2)">
                  {mm.mes.slice(5)}/{mm.mes.slice(2, 4)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <details className="text-xs">
        <summary className="cursor-pointer text-texto-2">Ver tabela</summary>
        <table className="mt-2 w-full">
          <thead className="text-texto-2">
            <tr>
              <th className="text-left font-normal">Mês</th>
              <th className="text-right font-normal">Aportes</th>
              <th className="text-right font-normal">Resgates</th>
              <th className="text-right font-normal">Dividendos</th>
              <th className="text-right font-normal">Aplicado</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {[...meses].reverse().map((mm) => (
              <tr key={mm.mes} className="border-t border-linha">
                <td className="py-1 font-sans">{mm.mes.slice(5)}/{mm.mes.slice(0, 4)}</td>
                <td className="text-right">{mm.aportes ? formatarBRL(mm.aportes) : '—'}</td>
                <td className="text-right">{mm.resgates ? formatarBRL(mm.resgates) : '—'}</td>
                <td className="text-right">{mm.dividendos ? formatarBRL(mm.dividendos) : '—'}</td>
                <td className="text-right">{formatarBRL(mm.aplicadoAcumulado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <div className="text-[11px] text-texto-2">
        Pelos lançamentos atuais em "Investido": se você mover parte de um investimento para um objetivo, ela sai também do histórico.
      </div>
    </Cartao>
  )
}

function Dado({ rotulo, valor, cor = '' }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-texto-2">{rotulo}</div>
      <div className={`font-mono text-[13px] ${cor}`}>{valor}</div>
    </div>
  )
}
