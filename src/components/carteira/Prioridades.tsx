import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { paraSimulador } from '../../lib/carteiraPlano'
import { calcularPrioridades, pesosEfetivos, ROTULO_PRIORIDADE, type NivelPrioridade, type Prioridade } from '../../lib/carteiraSimulador'
import { formatarBRL, formatarNumero, formatarPercentual, lerNumero } from '../../lib/formato'
import { Cartao } from '../ui'
import type { DadosMinhaCarteira } from '../../pages/MinhaCarteira'

const ESTILO: Record<NivelPrioridade, { cor: string; icone: string }> = {
  alta: { cor: 'var(--reservado)', icone: '▲' },
  media: { cor: 'var(--fii)', icone: '◆' },
  equilibrado: { cor: 'var(--positivo)', icone: '✓' },
  acima: { cor: 'var(--texto-2)', icone: '⏸' },
}

const pctF = (f: number) => formatarPercentual(f, false)
const pp = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatarNumero(Math.round(Math.abs(v) * 10) / 10)} p.p.`

export function Prioridades({ dados }: { dados: DadosMinhaCarteira }) {
  const [, setParams] = useSearchParams()
  const [aporteTexto, setAporteTexto] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const aporte = lerNumero(aporteTexto) > 0 ? lerNumero(aporteTexto) : 0

  const { categorias, itens } = useMemo(() => paraSimulador(dados.planejamento), [dados])
  const pesos = useMemo(() => pesosEfetivos(categorias, itens), [categorias, itens])
  const total = itens.reduce((s, i) => s + i.valorAtual, 0)
  const somaPct = categorias.reduce((s, c) => s + c.percentual, 0) || 1

  const porCategoria = useMemo(
    () =>
      calcularPrioridades(
        categorias.map((c) => ({
          id: c.id,
          nome: c.nome,
          meta: c.percentual / somaPct,
          valor: itens.filter((i) => i.categoriaId === c.id).reduce((s, i) => s + i.valorAtual, 0),
        })),
        total,
        aporte,
      ),
    [categorias, itens, somaPct, total, aporte],
  )

  /** Prioridade dos ativos de uma categoria (metas e valores em relação à carteira inteira). */
  const ativosDe = (categoriaId: string): Prioridade[] =>
    calcularPrioridades(
      itens
        .filter((i) => i.categoriaId === categoriaId)
        .map((i) => ({
          id: i.id,
          nome: i.rotulo,
          meta: (pesos.get(i.id) ?? 0) / 100,
          valor: i.valorAtual,
          passoMinimo: i.rendaVariavel ? (i.preco != null ? i.preco * i.lote : null) : (i.aplicacaoMinima ?? null),
        })),
      total,
      aporte,
    )

  if (!itens.length) {
    return (
      <Cartao className="text-sm text-texto-2">
        Cadastre investimentos nas categorias em{' '}
        <button type="button" className="font-bold text-positivo" onClick={() => setParams({ area: 'planejamento' })}>
          Planejamento
        </button>{' '}
        para ver as prioridades de compra.
      </Cartao>
    )
  }

  return (
    <>
      <Cartao className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-bold">Carteira (parte livre)</div>
          <div className="font-mono text-sm">{formatarBRL(total)}</div>
        </div>
        <label htmlFor="pri-aporte" className="rotulo">Considerar um aporte de (opcional)</label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input id="pri-aporte" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={aporteTexto} onChange={(e) => setAporteTexto(e.target.value)} />
          <button
            type="button"
            disabled={!aporte}
            onClick={() => setParams({ area: 'simulador', valor: aporteTexto })}
            className="rounded-[10px] bg-botao px-3 text-sm font-bold text-white disabled:opacity-40"
          >
            Simular
          </button>
        </div>
        <div className="text-xs text-texto-2">
          {total <= 0.005
            ? 'Sua carteira ainda está vazia: tudo aparece como prioridade alta, na ordem do peso de cada categoria.'
            : 'A prioridade combina quanto falta em relação à meta (desvio relativo) e o valor em reais para corrigir. Nunca sugere vender.'}
        </div>
      </Cartao>

      <Legenda />

      {porCategoria.map((p, i) => {
        const cat = dados.planejamento.categorias.find((c) => c.categoria.id === p.id)!.categoria
        const aberto = aberta === p.id
        const ativos = aberto ? ativosDe(p.id) : []
        return (
          <Cartao key={p.id} className="flex flex-col gap-2.5">
            <button type="button" onClick={() => setAberta(aberto ? null : p.id)} aria-expanded={aberto} className="flex flex-col gap-2.5 text-left">
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 text-center font-mono text-xs text-texto-2">{i + 1}º</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cat.cor ?? 'var(--texto-2)' }} />
                  <span className="truncate text-sm font-bold">{p.nome}</span>
                </span>
                <Selo nivel={p.nivel} />
              </div>
              <BarraMeta atual={p.atual} meta={p.meta} cor={cat.cor ?? 'var(--texto-2)'} />
              <div className="flex flex-wrap justify-between gap-x-3 text-xs">
                <span className="text-texto-2">
                  Meta {pctF(p.meta)} · Atual {pctF(p.atual)} · <b className="text-texto">{pp(p.desvioPP)}</b>
                </span>
                <span className={p.necessidade > 0.004 ? 'font-bold' : 'text-texto-2'}>
                  {p.necessidade > 0.004 ? `Faltam ${formatarBRL(p.necessidade)}` : 'Sem necessidade de compra'}
                </span>
              </div>
            </button>
            {aberto && (
              <div className="flex flex-col gap-2 border-t border-linha pt-2.5">
                {ativos.length === 0 && <div className="text-xs text-texto-2">Nenhum investimento nesta categoria.</div>}
                {ativos.map((a) => (
                  <div key={a.id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="truncate font-bold">{a.nome}</span>
                      <Selo nivel={a.nivel} pequeno />
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-3 text-[11px] text-texto-2">
                      <span>
                        Meta {pctF(a.meta)} · Atual {pctF(a.atual)} · {pp(a.desvioPP)}
                      </span>
                      <span>
                        {a.necessidade > 0.004 ? `faltam ${formatarBRL(a.necessidade)}` : 'ok'}
                        {a.compravel === false && ' · ainda não dá 1 unidade/mínimo'}
                        {a.compravel == null && a.necessidade > 0.004 && ' · sem preço'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Cartao>
        )
      })}
    </>
  )
}

function Selo({ nivel, pequeno = false }: { nivel: NivelPrioridade; pequeno?: boolean }) {
  const e = ESTILO[nivel]
  return (
    <span
      className={`shrink-0 rounded-full font-bold ${pequeno ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}
      style={{ color: e.cor, background: `color-mix(in srgb, ${e.cor} 14%, transparent)` }}
    >
      {e.icone} {ROTULO_PRIORIDADE[nivel]}
    </span>
  )
}

function BarraMeta({ atual, meta, cor }: { atual: number; meta: number; cor: string }) {
  const escala = Math.max(meta * 1.6, atual, 0.0001)
  return (
    <div className="relative h-2.5 rounded-full bg-linha" role="img" aria-label={`Atual ${pctF(atual)}, meta ${pctF(meta)}`}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (atual / escala) * 100)}%`, background: cor }} />
      <div className="absolute -inset-y-1 w-0.5 bg-texto" style={{ left: `${(meta / escala) * 100}%` }} aria-hidden="true" />
    </div>
  )
}

function Legenda() {
  return (
    <div className="flex flex-wrap gap-2 px-1">
      {(Object.keys(ESTILO) as NivelPrioridade[]).map((n) => (
        <Selo key={n} nivel={n} pequeno />
      ))}
      <span className="text-[11px] text-texto-2">Toque numa categoria para ver os investimentos.</span>
    </div>
  )
}
