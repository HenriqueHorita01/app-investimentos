import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { paraSimulador } from '../../lib/carteiraPlano'
import { recalcular, simularAporte, type LinhaSim, type ModoSim, type ResultadoSim } from '../../lib/carteiraSimulador'
import { formatarBRL, formatarNumero, formatarPercentual, lerNumero } from '../../lib/formato'
import { Cartao } from '../ui'
import type { DadosMinhaCarteira } from '../../pages/MinhaCarteira'

const MOTIVO: Record<string, string> = {
  sem_preco: 'sem preço — informe a cotação ou um preço de referência',
  abaixo_do_minimo: 'abaixo da aplicação mínima',
  nao_cabe_unidade: 'não dá uma cota/ação inteira',
}

const pctF = (f: number) => formatarPercentual(f, false)

export function Simulador({ dados }: { dados: DadosMinhaCarteira }) {
  const [params, setParams] = useSearchParams()
  const [valorTexto, setValorTexto] = useState(params.get('valor') ?? '')
  const [modo, setModo] = useState<ModoSim>(params.get('modo') === 'proporcional' ? 'proporcional' : 'rebalanceamento')
  /** Ajustes manuais: id → quantidade (renda variável) ou valor (renda fixa). */
  const [ajustes, setAjustes] = useState<Record<string, string>>({})

  const { categorias, itens } = useMemo(() => paraSimulador(dados.planejamento), [dados])
  const orcamento = lerNumero(valorTexto)
  const base = useMemo(
    () => (orcamento > 0 ? simularAporte(categorias, itens, orcamento, modo) : null),
    [categorias, itens, orcamento, modo],
  )

  // Aplica os ajustes manuais por cima da sugestão.
  const resultado: ResultadoSim | null = useMemo(() => {
    if (!base) return null
    if (!Object.keys(ajustes).length) return base
    const linhas = base.linhas.map((l): LinhaSim => {
      const t = ajustes[l.item.id]
      if (t == null) return l
      const n = lerNumero(t)
      if (!(n >= 0)) return { ...l, quantidade: 0, efetivo: 0, diferenca: l.ideal }
      if (l.item.rendaVariavel) {
        const q = Math.floor(n / l.item.lote) * l.item.lote
        const efetivo = Math.round(q * (l.item.preco ?? 0) * 100) / 100
        return { ...l, quantidade: q, efetivo, diferenca: l.ideal - efetivo }
      }
      return { ...l, efetivo: Math.round(n * 100) / 100, diferenca: l.ideal - n }
    })
    return recalcular(base, categorias, itens, linhas)
  }, [base, ajustes, categorias, itens])

  function mudarValor(v: string) {
    setValorTexto(v)
    setAjustes({})
    const p = new URLSearchParams(params)
    if (v) p.set('valor', v)
    else p.delete('valor')
    setParams(p, { replace: true })
  }

  const semCategorias = categorias.length === 0
  const passou = resultado ? resultado.totalEfetivo - resultado.orcamento : 0
  const errosMinimo = resultado?.linhas.filter((l) => !l.item.rendaVariavel && l.efetivo > 0 && l.efetivo + 1e-9 < (l.item.aplicacaoMinima ?? 0)) ?? []

  return (
    <>
      <Cartao className="flex flex-col gap-3">
        <label htmlFor="sim-valor" className="text-sm font-bold">Quanto você vai investir este mês?</label>
        <input
          id="sim-valor"
          className="campo font-mono text-lg"
          inputMode="decimal"
          placeholder="1.000,00"
          value={valorTexto}
          onChange={(e) => mudarValor(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-segmento p-1" role="tablist" aria-label="Modo de simulação">
          {(
            [
              ['rebalanceamento', 'Rebalancear'],
              ['proporcional', 'Proporcional'],
            ] as const
          ).map(([m, rotulo]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => {
                setModo(m)
                setAjustes({})
              }}
              className={`rounded-[9px] py-2.5 text-sm ${modo === m ? 'bg-segmento-ativo font-bold shadow-sm' : 'text-texto-2'}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="text-xs text-texto-2">
          {modo === 'rebalanceamento'
            ? 'Olha a carteira atual e manda o dinheiro primeiro para o que está mais abaixo da meta. Nunca sugere vender.'
            : 'Divide o valor exatamente pelos percentuais planejados, sem olhar como a carteira está hoje.'}
        </div>
      </Cartao>

      {semCategorias && (
        <Cartao className="text-sm text-texto-2">
          Nenhuma categoria configurada. Configure em{' '}
          <button type="button" className="font-bold text-positivo" onClick={() => setParams({ area: 'planejamento' })}>
            Planejamento
          </button>
          .
        </Cartao>
      )}

      {resultado && !semCategorias && (
        <>
          <Avisos resultado={resultado} />

          <PorTipo resultado={resultado} dados={dados} />

          <Cartao className="grid grid-cols-2 gap-x-2 gap-y-3 text-center">
            <div>
              <div className="text-xs text-texto-2">Orçamento</div>
              <div className="font-mono text-[15px]">{formatarBRL(resultado.orcamento)}</div>
            </div>
            <div>
              <div className="text-xs text-texto-2">Compras simuladas</div>
              <div className={`font-mono text-[15px] ${passou > 0.004 ? 'text-negativo' : ''}`}>{formatarBRL(resultado.totalEfetivo)}</div>
            </div>
            <div>
              <div className="text-xs text-texto-2">A definir</div>
              <div className="font-mono text-[15px]">{formatarBRL(resultado.aDefinir)}</div>
            </div>
            <div>
              <div className="text-xs text-texto-2">Sobra</div>
              <div className="font-mono text-[15px] text-reservado-texto">{formatarBRL(Math.max(0, resultado.sobra))}</div>
            </div>
            <div className="col-span-2 text-[11px] text-texto-2">
              "A definir" é o valor de tipos em que você ainda não escolheu o investimento. A sobra (o que não fecha uma cota ou o mínimo) fica
              guardada para os próximos aportes, sem rendimento.
            </div>
          </Cartao>
          {passou > 0.004 && (
            <div role="alert" className="rounded-xl bg-cartao p-3 text-sm text-negativo">
              Os ajustes passaram {formatarBRL(passou)} do orçamento. Reduza alguma compra.
            </div>
          )}
          {errosMinimo.map((l) => (
            <div key={l.item.id} role="alert" className="rounded-xl bg-cartao p-3 text-sm text-negativo">
              {l.item.rotulo}: a aplicação mínima é {formatarBRL(l.item.aplicacaoMinima ?? 0)}.
            </div>
          ))}

          <AntesDepois resultado={resultado} />

          {resultado.linhas.length > 0 && <div className="px-1 pt-1 text-sm font-bold">Compras por investimento</div>}

          {dados.planejamento.categorias.map((c) => {
            const linhas = resultado.linhas.filter((l) => l.item.categoriaId === c.categoria.id)
            if (!linhas.length) return null
            const dist = resultado.porCategoria.find((d) => d.id === c.categoria.id)!
            return (
              <Cartao key={c.categoria.id} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.categoria.cor ?? 'var(--texto-2)' }} />
                    <span className="truncate text-sm font-bold">{c.categoria.nome}</span>
                  </span>
                  <span className="shrink-0 text-xs text-texto-2">
                    ideal {formatarBRL(dist.idealAporte)} · compra <b className="text-texto">{formatarBRL(dist.efetivoAporte)}</b>
                  </span>
                </div>
                {linhas.map((l) => (
                  <LinhaCompra
                    key={l.item.id}
                    l={l}
                    ajuste={ajustes[l.item.id]}
                    aoAjustar={(v) => setAjustes((a) => ({ ...a, [l.item.id]: v }))}
                    aoRestaurar={() =>
                      setAjustes((a) => {
                        const { [l.item.id]: _, ...resto } = a
                        void _
                        return resto
                      })
                    }
                  />
                ))}
              </Cartao>
            )
          })}

          <Cartao className="text-xs text-texto-2">
            Isto é só uma simulação: nada muda na carteira. Para registrar as compras, use <b className="text-texto">Lançar</b> em cada linha (já vai
            preenchido). O registro do aporte do mês com saldo e histórico chega na etapa 3.
          </Cartao>
        </>
      )}
    </>
  )
}

/** Quanto do aporte vai para cada tipo de investimento — funciona sem nenhum ativo cadastrado. */
function PorTipo({ resultado, dados }: { resultado: ResultadoSim; dados: DadosMinhaCarteira }) {
  const sugeridos = resultado.linhas.filter((l) => l.item.sugerido)
  const somaIdeal = resultado.porCategoria.reduce((s, c) => s + c.idealAporte, 0)
  return (
    <Cartao className="flex flex-col gap-3">
      <div>
        <div className="text-sm font-bold">Quanto colocar em cada tipo</div>
        <div className="text-xs text-texto-2">
          {resultado.modo === 'rebalanceamento'
            ? 'Considera o que você já tem para aproximar cada tipo da meta.'
            : 'Divide o aporte pelos percentuais de cada tipo.'}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-2 text-[13px]">
        <span className="text-[11px] text-texto-2">Tipo · meta</span>
        <span className="text-right text-[11px] text-texto-2">Tem hoje</span>
        <span className="text-right text-[11px] text-texto-2">Aportar</span>
        {resultado.porCategoria.map((c) => {
          const cat = dados.planejamento.categorias.find((x) => x.categoria.id === c.id)?.categoria
          return (
            <div key={c.id} className="contents">
              <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat?.cor ?? 'var(--texto-2)' }} />
                  <span className="truncate">{c.nome}</span>
                </span>
                <span className="pl-3.5 text-[11px] text-texto-2">
                  meta {pctF(c.meta)} · depois {pctF(c.depois)}
                  {!c.temInvestimentos && c.idealAporte > 0.004 && (
                    <>
                      {' · '}
                      <Link to={`/ativos/novo?categoria=${c.id}&voltar=/minha-carteira`} className="font-bold text-positivo">escolher</Link>
                    </>
                  )}
                </span>
              </span>
              <span className="text-right font-mono text-texto-2">{formatarBRL(c.valorAntes)}</span>
              <span className={`text-right font-mono font-bold ${c.idealAporte > 0.004 ? '' : 'text-texto-2'}`}>{formatarBRL(c.idealAporte)}</span>
            </div>
          )
        })}
        <span className="border-t border-linha pt-2 text-[11px] font-bold">Total</span>
        <span className="border-t border-linha pt-2 text-right font-mono text-texto-2">
          {formatarBRL(resultado.porCategoria.reduce((s, c) => s + c.valorAntes, 0))}
        </span>
        <span className="border-t border-linha pt-2 text-right font-mono font-bold">{formatarBRL(somaIdeal)}</span>
      </div>
      {sugeridos.length > 0 && (
        <div className="text-[11px] text-texto-2">
          Contado pelo tipo, ainda sem categoria definida: {sugeridos.map((l) => l.item.rotulo).join(', ')}. Confirme em Planejamento.
        </div>
      )}
    </Cartao>
  )
}

function Avisos({ resultado }: { resultado: ResultadoSim }) {
  const avisos: string[] = []
  if (Math.abs(resultado.somaPercentuais - 100) >= 0.01)
    avisos.push(`As categorias somam ${formatarNumero(resultado.somaPercentuais)}%; o simulador ajustou proporcionalmente para 100%.`)
  const semPreco = resultado.linhas.filter((l) => l.motivo === 'sem_preco').map((l) => l.item.rotulo)
  if (semPreco.length) avisos.push(`Sem preço para simular: ${semPreco.join(', ')}. Informe a cotação ou um preço de referência.`)
  if (!avisos.length) return null
  return (
    <Cartao className="flex flex-col gap-1.5 text-xs text-reservado-texto">
      {avisos.map((a) => (
        <div key={a}>⚠ {a}</div>
      ))}
    </Cartao>
  )
}

/** Distribuição por categoria: meta, antes e depois das compras. */
function AntesDepois({ resultado }: { resultado: ResultadoSim }) {
  const escala = Math.max(0.0001, ...resultado.porCategoria.flatMap((c) => [c.meta, c.antes, c.depois]))
  return (
    <Cartao className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-bold">Distribuição: antes → depois</div>
        <div className="flex gap-3 text-[11px] text-texto-2">
          <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-campo" />antes</span>
          <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-positivo" />depois</span>
          <span className="flex items-center gap-1"><span className="h-3 w-0.5 bg-texto" />meta</span>
        </div>
      </div>
      {resultado.porCategoria.map((c) => (
        <div key={c.id} className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="truncate">{c.nome}</span>
            <span className="shrink-0 font-mono text-texto-2">
              {pctF(c.antes)} → <b className="text-texto">{pctF(c.depois)}</b> · meta {pctF(c.meta)}
            </span>
          </div>
          <div className="relative h-3 rounded bg-linha">
            <div className="absolute inset-y-0 left-0 rounded bg-campo" style={{ width: `${(c.antes / escala) * 100}%` }} />
            <div className="absolute inset-y-[3px] left-0 rounded bg-positivo" style={{ width: `${(c.depois / escala) * 100}%` }} />
            <div className="absolute -inset-y-0.5 w-0.5 bg-texto" style={{ left: `${(c.meta / escala) * 100}%` }} aria-hidden="true" />
          </div>
        </div>
      ))}
    </Cartao>
  )
}

function LinhaCompra({ l, ajuste, aoAjustar, aoRestaurar }: { l: LinhaSim; ajuste: string | undefined; aoAjustar: (v: string) => void; aoRestaurar: () => void }) {
  const it = l.item
  const valorCampo = ajuste ?? (it.rendaVariavel ? String(l.quantidade) : String(l.efetivo).replace('.', ','))
  const lancar =
    l.efetivo > 0
      ? it.rendaVariavel
        ? `/lancar?ativo=${it.id}&qtd=${l.quantidade}&preco=${String(it.preco ?? '').replace('.', ',')}`
        : `/lancar?ativo=${it.id}&valor=${String(l.efetivo).replace('.', ',')}`
      : null
  return (
    <div className="flex flex-col gap-1.5 border-t border-linha pt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-bold">{it.rotulo}</span>
        <span className="shrink-0 text-xs text-texto-2">{formatarNumero(Math.round(l.percentual * 100) / 100)}% planejado</span>
      </div>
      <div className="grid grid-cols-[1fr_1fr_88px] items-end gap-2 text-xs">
        <div>
          <div className="text-texto-2">Ideal</div>
          <div className="font-mono">{formatarBRL(l.ideal)}</div>
        </div>
        <div>
          <div className="text-texto-2">{it.rendaVariavel ? 'Preço' : 'Mínimo'}</div>
          <div className="font-mono">
            {it.rendaVariavel ? (it.preco != null ? formatarBRL(it.preco) : '—') : it.aplicacaoMinima ? formatarBRL(it.aplicacaoMinima) : '—'}
          </div>
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="text-texto-2">{it.rendaVariavel ? `Qtd.${it.lote > 1 ? ` (lote ${it.lote})` : ''}` : 'Valor'}</span>
          <input
            className={`campo !px-2 !py-1.5 text-right font-mono !text-sm ${ajuste != null ? '!border-reservado' : ''}`}
            inputMode={it.rendaVariavel ? 'numeric' : 'decimal'}
            value={valorCampo}
            onChange={(e) => aoAjustar(e.target.value)}
            aria-label={`${it.rendaVariavel ? 'Quantidade' : 'Valor'} de ${it.rotulo}`}
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span>
          Compra <b className="font-mono">{formatarBRL(l.efetivo)}</b>
          {Math.abs(l.diferenca) >= 0.01 && (
            <span className="text-texto-2"> · {l.diferenca > 0 ? `sobra ${formatarBRL(l.diferenca)}` : `usa ${formatarBRL(-l.diferenca)} da sobra`}</span>
          )}
        </span>
        <span className="flex shrink-0 gap-3 font-bold">
          {ajuste != null && (
            <button type="button" className="text-texto-2" onClick={aoRestaurar}>Desfazer</button>
          )}
          {lancar && <Link to={lancar} className="text-positivo">Lançar</Link>}
        </span>
      </div>
      {l.motivo && l.efetivo === 0 && <div className="text-[11px] text-reservado-texto">{MOTIVO[l.motivo]}</div>}
    </div>
  )
}
