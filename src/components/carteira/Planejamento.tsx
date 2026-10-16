import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  atualizarAtivo,
  atualizarCategoria,
  criarCategoria,
  excluirCategoria,
  salvarPercentuais,
} from '../../lib/dados'
import { dividirIgualmente, percentualNoPlano, TOLERANCIA_PCT, type AtivoPlano, type CategoriaPlano } from '../../lib/carteiraPlano'
import { formatarBRL, formatarData, formatarNumero, lerNumero } from '../../lib/formato'
import { CORES_OBJETIVO } from '../../lib/objetivos'
import { descreverTaxa, ehRendaVariavel, NOME_TIPO, rotuloAtivo, type CategoriaCarteira } from '../../lib/tipos'
import { Campo, Cartao } from '../ui'
import type { DadosMinhaCarteira } from '../../pages/MinhaCarteira'

/** "20%" / "3,333%" (recebe pontos percentuais, não fração). */
export const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}%`
const br = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','))

export function Planejamento({ dados, aoMudar }: { dados: DadosMinhaCarteira; aoMudar: () => void }) {
  const { planejamento } = dados
  const valorCarteira = planejamento.valorCarteira
  const automaticos = planejamento.categorias.reduce((s, c) => s + c.pendentes, 0)
  const desequilibradas = planejamento.categorias.filter((c) => c.ativos.length > 0 && !c.fechada)

  return (
    <>
      <Cartao className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-bold">Distribuição planejada</div>
          <div className={`text-[13px] font-bold ${planejamento.categoriasOk ? 'text-positivo' : 'text-negativo'}`}>
            {planejamento.categoriasOk ? '100% ✓' : `Soma ${pct(planejamento.somaCategorias)}`}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] text-texto-2">Meta</div>
          <div className="flex h-3 overflow-hidden rounded-full bg-linha" role="img" aria-label="Distribuição planejada por categoria">
            {planejamento.categorias.map((c) => (
              <div key={c.categoria.id} style={{ width: `${Math.min(100, c.categoria.percentual)}%`, background: c.categoria.cor ?? 'var(--texto-2)' }} />
            ))}
          </div>
          <div className="text-[11px] text-texto-2">Hoje {valorCarteira > 0.005 ? '' : '(carteira ainda vazia)'}</div>
          <div className="flex h-3 overflow-hidden rounded-full bg-linha" role="img" aria-label="Distribuição atual por categoria">
            {planejamento.categorias.map((c) => (
              <div key={c.categoria.id} style={{ width: `${c.atual * 100}%`, background: c.categoria.cor ?? 'var(--texto-2)' }} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-1 text-xs">
          <span className="text-[11px] text-texto-2">Categoria</span>
          <span className="text-right text-[11px] text-texto-2">Meta</span>
          <span className="text-right text-[11px] text-texto-2">Hoje</span>
          {planejamento.categorias.map((c) => (
            <div key={c.categoria.id} className="contents">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.categoria.cor ?? 'var(--texto-2)' }} />
                <span className="truncate">{c.categoria.nome}</span>
              </span>
              <span className="text-right font-mono text-texto-2">{pct(c.categoria.percentual)}</span>
              <span className="text-right font-mono font-bold">{pct(Math.round(c.atual * 1000) / 10)}</span>
            </div>
          ))}
        </div>
        {!planejamento.categoriasOk && (
          <div role="alert" className="rounded-lg bg-fundo p-2.5 text-xs text-negativo">
            As categorias somam {pct(planejamento.somaCategorias)}.{' '}
            {planejamento.somaCategorias < 100
              ? `Faltam ${pct(100 - planejamento.somaCategorias)} para fechar 100%.`
              : `Passou ${pct(planejamento.somaCategorias - 100)} de 100%.`}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 border-t border-linha pt-3 text-[13px]">
          <div>
            <div className="text-xs text-texto-2">Valor atual (parte Investido)</div>
            <div className="font-mono">{formatarBRL(valorCarteira)}</div>
          </div>
          <div>
            <div className="text-xs text-texto-2">Pendências</div>
            <div className={desequilibradas.length ? 'text-reservado-texto' : 'text-positivo'}>
              {desequilibradas.length ? `${desequilibradas.length} categoria(s) sem fechar` : 'Tudo configurado'}
            </div>
            {automaticos > 0 && <div className="text-[11px] text-texto-2">{automaticos} com % automático</div>}
          </div>
        </div>
        <div className="text-xs text-texto-2">
          A Minha Carteira usa só a parte <b>Investido</b> dos investimentos. Reserva de emergência e objetivos ficam de fora.
        </div>
      </Cartao>

      <EditorCategorias categorias={dados.categorias} aoMudar={aoMudar} />

      {planejamento.foraDaCarteira.length > 0 && (
        <ForaDaCarteira ativos={planejamento.foraDaCarteira} categorias={dados.categorias} aoMudar={aoMudar} />
      )}

      {planejamento.categorias.map((c) => (
        <CartaoCategoria key={c.categoria.id} c={c} dados={dados} aoMudar={aoMudar} />
      ))}
    </>
  )
}

// ============ Categorias ============

interface LinhaCategoria {
  id: string | null
  nome: string
  percentual: string
  cor: string
  excluir: boolean
}

function EditorCategorias({ categorias, aoMudar }: { categorias: CategoriaCarteira[]; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [linhas, setLinhas] = useState<LinhaCategoria[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  function abrir() {
    setLinhas(categorias.map((c) => ({ id: c.id, nome: c.nome, percentual: br(c.percentual), cor: c.cor ?? CORES_OBJETIVO[0], excluir: false })))
    setErro(null)
    setEditando(true)
  }

  const ativas = linhas.filter((l) => !l.excluir)
  const soma = ativas.reduce((s, l) => s + (lerNumero(l.percentual) || 0), 0)
  const ok = Math.abs(soma - 100) < TOLERANCIA_PCT
  const mudar = (i: number, campo: Partial<LinhaCategoria>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...campo } : l)))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    for (const l of ativas) {
      const v = lerNumero(l.percentual)
      if (!l.nome.trim()) return setErro('Toda categoria precisa de um nome.')
      if (!(v >= 0 && v <= 100)) return setErro(`Percentual inválido em "${l.nome}".`)
    }
    if (!ok && !confirm(`As categorias somam ${pct(soma)}, não 100%. Salvar mesmo assim?`)) return
    setSalvando(true)
    try {
      for (const [i, l] of linhas.entries()) {
        if (l.id && l.excluir) await excluirCategoria(l.id)
        else if (l.id) await atualizarCategoria(l.id, { nome: l.nome.trim(), percentual: lerNumero(l.percentual), ordem: i, cor: l.cor })
        else if (!l.excluir) await criarCategoria({ nome: l.nome.trim(), percentual: lerNumero(l.percentual), ordem: i, cor: l.cor })
      }
      setEditando(false)
      aoMudar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setSalvando(false)
    }
  }

  if (!editando) {
    return (
      <Cartao className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-bold">Categorias</div>
          <button type="button" onClick={abrir} className="text-[13px] font-bold text-positivo">Editar</button>
        </div>
        {categorias.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 text-[13px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.cor ?? 'var(--texto-2)' }} />
              <span className="truncate">{c.nome}</span>
            </span>
            <span className="shrink-0 font-mono">{pct(c.percentual)}</span>
          </div>
        ))}
      </Cartao>
    )
  }

  return (
    <Cartao>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-bold">Editar categorias</div>
          <div className={`text-[13px] font-bold ${ok ? 'text-positivo' : 'text-negativo'}`}>Soma {pct(soma)}</div>
        </div>
        {linhas.map((l, i) =>
          l.excluir ? (
            <div key={l.id ?? i} className="flex items-center justify-between text-xs text-texto-2">
              <span className="line-through">{l.nome}</span>
              <button type="button" className="font-bold text-positivo" onClick={() => mudar(i, { excluir: false })}>Desfazer</button>
            </div>
          ) : (
            <div key={l.id ?? i} className="flex flex-col gap-2 border-b border-linha pb-3">
              <div className="grid grid-cols-[minmax(0,1fr)_86px] gap-2">
                <input aria-label="Nome da categoria" className="campo !py-2.5" value={l.nome} onChange={(e) => mudar(i, { nome: e.target.value })} />
                <div className="relative">
                  <input
                    aria-label={`Percentual de ${l.nome}`}
                    className="campo !py-2.5 !pr-6 text-right font-mono"
                    inputMode="decimal"
                    value={l.percentual}
                    onChange={(e) => mudar(i, { percentual: e.target.value })}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-texto-2">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  {CORES_OBJETIVO.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Cor ${c}`}
                      aria-pressed={l.cor === c}
                      onClick={() => mudar(i, { cor: c })}
                      className={`h-6 w-6 rounded-full ${l.cor === c ? 'ring-2 ring-texto ring-offset-2 ring-offset-cartao' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="text-xs font-bold text-negativo"
                  onClick={() => (l.id ? mudar(i, { excluir: true }) : setLinhas((ls) => ls.filter((_, j) => j !== i)))}
                >
                  Remover
                </button>
              </div>
            </div>
          ),
        )}
        <button
          type="button"
          onClick={() =>
            setLinhas((ls) => [...ls, { id: null, nome: '', percentual: br(Math.max(0, 100 - soma)), cor: CORES_OBJETIVO[ls.length % CORES_OBJETIVO.length], excluir: false }])
          }
          className="self-start text-[13px] font-bold text-positivo"
        >
          + Categoria
        </button>
        {linhas.some((l) => l.excluir) && (
          <div className="text-xs text-texto-2">Os investimentos de uma categoria removida continuam no app, só saem da Minha Carteira.</div>
        )}
        {!ok && <div className="text-xs text-negativo">A soma precisa dar 100% ({soma < 100 ? `faltam ${pct(100 - soma)}` : `passou ${pct(soma - 100)}`}).</div>}
        {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
        <div className="flex gap-2">
          <button type="submit" disabled={salvando} className="flex-1 rounded-xl bg-botao p-3 text-sm font-bold text-white disabled:opacity-60">
            {salvando ? 'Salvando…' : 'Salvar categorias'}
          </button>
          <button type="button" onClick={() => setEditando(false)} className="rounded-xl border border-campo px-4 text-sm">
            Cancelar
          </button>
        </div>
      </form>
    </Cartao>
  )
}

// ============ Ativos fora da carteira ============

function ForaDaCarteira({ ativos, categorias, aoMudar }: { ativos: AtivoPlano[]; categorias: CategoriaCarteira[]; aoMudar: () => void }) {
  const [erro, setErro] = useState<string | null>(null)
  async function escolher(id: string, categoriaId: string) {
    if (!categoriaId) return
    setErro(null)
    try {
      await atualizarAtivo(id, { categoria_id: categoriaId })
      aoMudar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <Cartao className="flex flex-col gap-3 border border-reservado/40">
      <div>
        <div className="text-sm font-bold">Investimentos sem categoria</div>
        <div className="text-xs text-texto-2">Você já tem estes investimentos. Escolha a categoria para eles entrarem na Minha Carteira.</div>
      </div>
      {ativos.map((a) => (
        <div key={a.ativo.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-bold">{rotuloAtivo(a.ativo)}</span>
            <span className="font-mono">{formatarBRL(a.valorLivre)}</span>
          </div>
          <select
            aria-label={`Categoria de ${rotuloAtivo(a.ativo)}`}
            className="campo !py-2 text-sm"
            defaultValue=""
            onChange={(e) => escolher(a.ativo.id, e.target.value)}
          >
            <option value="">Escolher categoria…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
      ))}
      {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
    </Cartao>
  )
}

// ============ Uma categoria e seus investimentos ============

function CartaoCategoria({ c, dados, aoMudar }: { c: CategoriaPlano; dados: DadosMinhaCarteira; aoMudar: () => void }) {
  const [adicionando, setAdicionando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const cat = c.categoria
  // Ativos que podem entrar: qualquer um que ainda não está em categoria.
  const semCategoria = dados.ativosPlano.filter((a) => a.ativo.categoria_id == null)

  async function acao(fn: () => Promise<void>) {
    setErro(null)
    try {
      await fn()
      aoMudar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Cartao className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: cat.cor ?? 'var(--texto-2)' }} />
          <span className="truncate text-[15px] font-bold">{cat.nome}</span>
        </div>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-[15px]">meta {pct(cat.percentual)}</span>
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="relative h-2.5 rounded-full bg-linha" role="img" aria-label={`Hoje ${pct(Math.round(c.atual * 1000) / 10)} da carteira; meta ${pct(cat.percentual)}`}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, c.atual * 100)}%`, background: cat.cor ?? 'var(--texto-2)' }} />
          <div className="absolute -inset-y-1 w-0.5 bg-texto" style={{ left: `${Math.min(100, cat.percentual)}%` }} aria-hidden="true" />
        </div>
        <div className="flex justify-between text-xs">
          <span>
            Hoje <b>{pct(Math.round(c.atual * 1000) / 10)}</b> da carteira
            <span className="text-texto-2"> · {formatarBRL(c.valorAtual)}</span>
          </span>
          <span className={c.atual * 100 > cat.percentual + 0.5 ? 'text-reservado-texto' : c.atual * 100 < cat.percentual - 0.5 ? 'text-texto-2' : 'text-positivo'}>
            {c.atual * 100 > cat.percentual + 0.5 ? 'acima da meta' : c.atual * 100 < cat.percentual - 0.5 ? 'abaixo da meta' : 'na meta'}
          </span>
        </div>
      </div>

      {c.ativos.length > 0 && (
        <div className={`text-xs ${c.fechada ? 'text-positivo' : 'text-reservado-texto'}`}>
          {c.fechada
            ? c.pendentes > 0
              ? `Plano fecha ✓ · ${c.pendentes === 1 ? 'o pendente recebe' : `${c.pendentes} pendentes recebem`} ${pct(Math.round(c.automaticoPorPendente * 1000) / 1000)} automaticamente`
              : 'Plano dos investimentos fecha a categoria ✓'
            : c.faltaDistribuir > 0
              ? `Plano: distribuído ${pct(c.somaAtivos)} de ${pct(cat.percentual)} · faltam ${pct(c.faltaDistribuir)}`
              : `Plano: distribuído ${pct(c.somaAtivos)} · passou ${pct(-c.faltaDistribuir)} da categoria`}
        </div>
      )}

      {c.ativos.length === 0 && <div className="text-[13px] text-texto-2">Nenhum investimento nesta categoria ainda.</div>}

      {c.ativos.map((a) =>
        editandoId === a.ativo.id ? (
          <EditarPlanoAtivo
            key={a.ativo.id}
            a={a}
            categoria={cat}
            categorias={dados.categorias}
            aoCancelar={() => setEditandoId(null)}
            aoSalvar={() => {
              setEditandoId(null)
              aoMudar()
            }}
          />
        ) : (
          <LinhaAtivoPlano key={a.ativo.id} a={a} c={c} aoEditar={() => setEditandoId(a.ativo.id)} />
        ),
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-linha pt-2.5 text-[13px] font-bold">
        <Link to={`/ativos/novo?categoria=${cat.id}&voltar=/minha-carteira`} className="text-positivo">+ Novo investimento</Link>
        {semCategoria.length > 0 && !adicionando && (
          <button type="button" className="text-positivo" onClick={() => setAdicionando(true)}>+ Já cadastrado</button>
        )}
        {c.ativos.length > 1 && (
          <button
            type="button"
            className="text-texto-2"
            onClick={() => {
              const partes = dividirIgualmente(cat.percentual, c.ativos.length)
              if (confirm(`Dividir ${pct(cat.percentual)} igualmente entre ${c.ativos.length} investimentos (${pct(partes[0])} cada)?`)) {
                acao(() => salvarPercentuais(c.ativos.map((a, i) => ({ id: a.ativo.id, percentual_alvo: partes[i] }))))
              }
            }}
          >
            Dividir igualmente
          </button>
        )}
      </div>

      {adicionando && (
        <div className="flex flex-col gap-2 rounded-xl bg-fundo p-3">
          <label htmlFor={`add-${cat.id}`} className="rotulo">Adicionar investimento já cadastrado</label>
          <select
            id={`add-${cat.id}`}
            className="campo !py-2 text-sm"
            defaultValue=""
            onChange={(e) => {
              const id = e.target.value
              if (id) acao(() => atualizarAtivo(id, { categoria_id: cat.id })).then(() => setAdicionando(false))
            }}
          >
            <option value="">Escolher…</option>
            {semCategoria.map((a) => (
              <option key={a.ativo.id} value={a.ativo.id}>
                {rotuloAtivo(a.ativo)} — {NOME_TIPO[a.ativo.tipo]}
                {a.valorLivre > 0.005 ? ` · investido ${formatarBRL(a.valorLivre)}` : ''}
              </option>
            ))}
          </select>
          <button type="button" className="self-start text-xs font-bold text-texto-2" onClick={() => setAdicionando(false)}>Cancelar</button>
        </div>
      )}
      {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
    </Cartao>
  )
}

function LinhaAtivoPlano({ a, c, aoEditar }: { a: AtivoPlano; c: CategoriaPlano; aoEditar: () => void }) {
  const at = a.ativo
  const rv = ehRendaVariavel(at.tipo)
  const categoria = c.categoria
  const noPlano = percentualNoPlano(c, a)
  const dentroCategoria = categoria.percentual > 0 ? (noPlano / categoria.percentual) * 100 : null
  const detalhes = rv
    ? [NOME_TIPO[at.tipo], at.instituicao, at.lote > 1 ? `lote ${at.lote}` : null]
    : [
        NOME_TIPO[at.tipo],
        descreverTaxa(at) || null,
        at.vencimento ? `vence ${formatarData(at.vencimento)}` : null,
        at.liquidez ? `liquidez ${at.liquidez}` : null,
        at.instituicao,
      ]
  return (
    <div className="flex flex-col gap-1.5 border-b border-linha pb-3 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/ativo/${at.id}`} className="text-sm font-bold">{rotuloAtivo(at)}</Link>
          {at.ticker && at.nome !== at.ticker && <div className="truncate text-xs text-texto-2">{at.nome}</div>}
          <div className="text-xs text-texto-2">{detalhes.filter(Boolean).join(' · ')}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm">{pct(Math.round(noPlano * 1000) / 1000)}</div>
          {a.pendente && <div className="text-[11px] font-bold text-reservado-texto">automático</div>}
          {dentroCategoria != null && <div className="text-[11px] text-texto-2">{pct(Math.round(dentroCategoria * 10) / 10)} da categoria</div>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-texto-2">{rv ? 'Preço' : 'Mínimo'}</div>
          <div className="font-mono">
            {rv ? (a.preco != null ? formatarBRL(a.preco) : '—') : at.aplicacao_minima != null ? formatarBRL(at.aplicacao_minima) : '—'}
          </div>
          {rv && a.preco != null && (
            <div className="text-[10px] text-texto-2">{a.fontePreco === 'cotacao' && a.dataPreco ? formatarData(a.dataPreco).slice(0, 5) : a.fontePreco === 'custo' ? 'custo médio' : 'referência'}</div>
          )}
        </div>
        <div>
          <div className="text-texto-2">{rv ? 'Possui' : 'Aplicado'}</div>
          <div className="font-mono">{rv ? `${formatarNumero(a.quantidadeLivre)} un.` : formatarBRL(a.investidoLivre)}</div>
          {a.dataAquisicao && <div className="text-[10px] text-texto-2">desde {formatarData(a.dataAquisicao)}</div>}
        </div>
        <div className="text-right">
          <div className="text-texto-2">Valor atual</div>
          <div className="font-mono">{formatarBRL(a.valorLivre)}</div>
          {rv && a.investidoLivre > 0 && <div className="text-[10px] text-texto-2">investido {formatarBRL(a.investidoLivre)}</div>}
        </div>
      </div>
      <div className="flex gap-3 text-xs font-bold">
        <button type="button" className="text-positivo" onClick={aoEditar}>Editar plano</button>
        <Link to={`/lancar?ativo=${at.id}`} className="text-texto-2">+ Lançar</Link>
        {a.valorLivre <= 0.005 && <span className="font-normal text-texto-2">· ainda não comprado</span>}
      </div>
    </div>
  )
}

function EditarPlanoAtivo({
  a,
  categoria,
  categorias,
  aoSalvar,
  aoCancelar,
}: {
  a: AtivoPlano
  categoria: CategoriaCarteira
  categorias: CategoriaCarteira[]
  aoSalvar: () => void
  aoCancelar: () => void
}) {
  const at = a.ativo
  const rv = ehRendaVariavel(at.tipo)
  const [categoriaId, setCategoriaId] = useState(categoria.id)
  const [percentual, setPercentual] = useState(br(at.percentual_alvo))
  const [preco, setPreco] = useState(br(at.preco_referencia))
  const [minimo, setMinimo] = useState(br(at.aplicacao_minima))
  const [incremento, setIncremento] = useState(br(at.incremento_minimo))
  const [liquidez, setLiquidez] = useState(at.liquidez ?? '')
  const [lote, setLote] = useState(String(at.lote))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const id = (s: string) => `pl-${s}-${at.id}`

  const opcional = (t: string) => (t.trim() ? lerNumero(t) : null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const pctN = opcional(percentual)
    if (pctN != null && !(pctN >= 0 && pctN <= 100)) return setErro('Percentual inválido (0 a 100).')
    const precoN = opcional(preco)
    if (precoN != null && !(precoN > 0)) return setErro('Preço de referência inválido.')
    const minN = opcional(minimo)
    const incN = opcional(incremento)
    if ((minN != null && !(minN >= 0)) || (incN != null && !(incN > 0))) return setErro('Valores de aplicação inválidos.')
    const loteN = Number(lote)
    if (!Number.isInteger(loteN) || loteN < 1) return setErro('Lote deve ser um número inteiro (1 ou mais).')
    setSalvando(true)
    try {
      await atualizarAtivo(at.id, {
        categoria_id: categoriaId || null,
        percentual_alvo: pctN,
        preco_referencia: precoN,
        aplicacao_minima: rv ? null : minN,
        incremento_minimo: rv ? null : incN,
        liquidez: rv ? null : liquidez.trim() || null,
        lote: rv ? loteN : 1,
      })
      aoSalvar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 rounded-xl bg-fundo p-3">
      <div className="text-[13px] font-bold">Plano de {rotuloAtivo(at)}</div>
      <div className="grid grid-cols-2 gap-2">
        <Campo id={id('cat')} rotulo="Categoria">
          <select id={id('cat')} className="campo !py-2.5 text-sm" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
            <option value="">Fora da carteira</option>
          </select>
        </Campo>
        <Campo id={id('pct')} rotulo="% da carteira">
          <input id={id('pct')} className="campo !py-2.5 font-mono" inputMode="decimal" placeholder="pendente" value={percentual} onChange={(e) => setPercentual(e.target.value)} />
        </Campo>
      </div>
      {rv ? (
        <div className="grid grid-cols-2 gap-2">
          <Campo id={id('preco')} rotulo="Preço de referência">
            <input id={id('preco')} className="campo !py-2.5 font-mono" inputMode="decimal" placeholder="usa a cotação" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </Campo>
          <Campo id={id('lote')} rotulo="Lote mínimo">
            <input id={id('lote')} className="campo !py-2.5 font-mono" inputMode="numeric" value={lote} onChange={(e) => setLote(e.target.value)} />
          </Campo>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Campo id={id('min')} rotulo="Aplicação mínima">
              <input id={id('min')} className="campo !py-2.5 font-mono" inputMode="decimal" placeholder="0,00" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
            </Campo>
            <Campo id={id('inc')} rotulo="Incremento mínimo">
              <input id={id('inc')} className="campo !py-2.5 font-mono" inputMode="decimal" placeholder="—" value={incremento} onChange={(e) => setIncremento(e.target.value)} />
            </Campo>
          </div>
          <Campo id={id('liq')} rotulo="Liquidez">
            <input id={id('liq')} className="campo !py-2.5" placeholder="diária, no vencimento, D+30…" value={liquidez} onChange={(e) => setLiquidez(e.target.value)} />
          </Campo>
          <Campo id={id('pref')} rotulo="Valor de referência (opcional)">
            <input id={id('pref')} className="campo !py-2.5 font-mono" inputMode="decimal" placeholder="—" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </Campo>
        </>
      )}
      <div className="text-xs text-texto-2">
        {rv ? 'Para ações, o lote 1 equivale a comprar pelo mercado fracionário.' : 'Taxa, indexador e vencimento ficam em '}
        {!rv && <Link to={`/ativo/${at.id}`} className="font-bold text-positivo">Editar ativo</Link>}
        {!rv && '.'} Deixe o % vazio para manter pendente.
      </div>
      {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
      <div className="flex gap-2">
        <button type="submit" disabled={salvando} className="flex-1 rounded-xl bg-botao p-3 text-sm font-bold text-white disabled:opacity-60">
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-xl border border-campo px-4 text-sm">
          Cancelar
        </button>
      </div>
    </form>
  )
}
