import { supabase } from './supabase'
import type { Ativo, CdiDia, Cotacao, Finalidade, Movimentacao, Objetivo, TipoAtivo, TipoMovimentacao } from './tipos'
import { ehRendaVariavel, rotuloAtivo } from './tipos'
import { calcularPosicao, progressoObjetivos, type Posicao, type ProgressoObjetivo } from './calculos'

export interface AtivoComPosicao extends Ativo {
  posicao: Posicao
  ultimaCotacao: Cotacao | null
  movimentacoes: Movimentacao[]
}

export interface Carteira {
  ativos: AtivoComPosicao[]
  objetivos: Objetivo[]
  progresso: ProgressoObjetivo[]
  /** Último dia com CDI gravado (null se a tabela estiver vazia). */
  cdiAte: string | null
  /** CDI do último dia, % ao dia. */
  cdiUltimo: number | null
  /** Série usada nos cálculos (para simular alterações antes de gravar). */
  cdi: CdiDia[]
}

const num = (v: unknown) => (v == null ? null : Number(v))

function normalizarMov(m: Movimentacao): Movimentacao {
  return { ...m, quantidade: num(m.quantidade), preco_unitario: num(m.preco_unitario), valor_total: Number(m.valor_total) }
}

function erro(e: { message: string } | null): asserts e is null {
  if (e) throw new Error(e.message)
}

/** Busca todas as linhas, paginando (o PostgREST devolve no máximo 1000 por vez). */
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const linhas: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    erro(error)
    linhas.push(...(data ?? []))
    if (!data || data.length < 1000) return linhas
  }
}

/** Última cotação de cada ticker (uma consulta, ordenada por data desc). */
async function ultimasCotacoes(tickers: string[]): Promise<Map<string, Cotacao>> {
  const mapa = new Map<string, Cotacao>()
  if (!tickers.length) return mapa
  const { data, error } = await supabase
    .from('cotacoes')
    .select('ticker, data, fechamento, fonte')
    .in('ticker', tickers)
    .order('data', { ascending: false })
  erro(error)
  for (const c of data ?? []) {
    if (!mapa.has(c.ticker)) mapa.set(c.ticker, { ...c, fechamento: Number(c.fechamento) })
  }
  return mapa
}

/** CDI diário a partir de uma data (só o necessário para os CDBs existentes). */
async function cdiDesde(desde: string): Promise<CdiDia[]> {
  const linhas = await todas<CdiDia>((de, ate) =>
    supabase.from('cdi_diario').select('data, taxa_dia').gte('data', desde).order('data').range(de, ate),
  )
  return linhas.map((l) => ({ data: l.data, taxa_dia: Number(l.taxa_dia) }))
}

/** Carteira completa: ativos + posição calculada no front (SPEC §4), objetivos e CDI. */
export async function carregarCarteira(): Promise<Carteira> {
  const [ativosR, objetivosR, cdiUltR, movsBrutas] = await Promise.all([
    supabase.from('ativos').select('*').eq('ativo', true).order('criado_em'),
    supabase.from('objetivos').select('*').order('criado_em'),
    supabase.from('cdi_diario').select('data, taxa_dia').order('data', { ascending: false }).limit(1),
    todas<Movimentacao>((de, ate) => supabase.from('movimentacoes').select('*').order('data').order('criado_em').range(de, ate)),
  ])
  erro(ativosR.error)
  erro(objetivosR.error)
  erro(cdiUltR.error)
  const ativos = (ativosR.data ?? []) as Ativo[]
  const objetivos = ((objetivosR.data ?? []) as Objetivo[]).map((o) => ({ ...o, valor_alvo: Number(o.valor_alvo) }))
  const movs = movsBrutas.map(normalizarMov)

  // CDI só desde a primeira aplicação em renda fixa atrelada ao CDI.
  const idsCdi = new Set(ativos.filter((a) => !ehRendaVariavel(a.tipo) && a.indexador === 'cdi').map((a) => a.id))
  const primeira = movs.find((m) => idsCdi.has(m.ativo_id))?.data
  const [cot, cdi] = await Promise.all([
    ultimasCotacoes(ativos.map((a) => a.ticker).filter((t): t is string => !!t)),
    primeira ? cdiDesde(primeira) : Promise.resolve([] as CdiDia[]),
  ])

  const comPosicao = ativos.map((a) => {
    const c = a.ticker ? (cot.get(a.ticker) ?? null) : null
    const doAtivo = movs.filter((m) => m.ativo_id === a.id)
    return { ...a, movimentacoes: doAtivo, ultimaCotacao: c, posicao: calcularPosicao(a, doAtivo, c?.fechamento ?? null, cdi) }
  })

  const investimentos = comPosicao.filter((a) => a.finalidade === 'investimento')
  return {
    ativos: comPosicao,
    objetivos,
    progresso: progressoObjetivos(
      objetivos,
      investimentos.map((a) => ({ id: a.id, rotulo: rotuloAtivo(a), posicao: a.posicao })),
    ),
    cdiAte: cdiUltR.data?.[0]?.data ?? null,
    cdiUltimo: cdiUltR.data?.[0] ? Number(cdiUltR.data[0].taxa_dia) : null,
    cdi,
  }
}

/** Recalcula a posição do ativo com uma lista de lançamentos alterada (para validar antes de gravar). */
export function simularPosicao(a: AtivoComPosicao, movs: Movimentacao[], cdi: CdiDia[]): Posicao {
  return calcularPosicao(a, movs, a.ultimaCotacao?.fechamento ?? null, cdi)
}

// ============ Ativos ============

export interface NovoAtivo {
  tipo: TipoAtivo
  ticker: string | null
  nome: string
  instituicao: string | null
  indexador: Ativo['indexador']
  taxa: number | null
  vencimento: string | null
  finalidade: Finalidade
}

export async function criarAtivo(novo: NovoAtivo): Promise<Ativo> {
  const { data, error } = await supabase.from('ativos').insert(novo).select().single()
  erro(error)
  return data as Ativo
}

export async function alterarFinalidade(id: string, finalidade: Finalidade): Promise<void> {
  const { error } = await supabase.from('ativos').update({ finalidade }).eq('id', id)
  erro(error)
}

/** Exclui o ativo e, em cascata, todos os lançamentos dele. */
export async function excluirAtivo(id: string): Promise<void> {
  const { error } = await supabase.from('ativos').delete().eq('id', id)
  erro(error)
}

// ============ Lançamentos ============

export interface NovaMovimentacao {
  ativo_id: string
  data: string
  tipo: TipoMovimentacao
  quantidade: number | null
  preco_unitario: number | null
  valor_total: number
  observacao: string | null
  objetivo_id: string | null
}

/** Grava um ou mais lançamentos de uma vez (tudo ou nada). */
export async function criarMovimentacao(nova: NovaMovimentacao | NovaMovimentacao[]): Promise<void> {
  const { error } = await supabase.from('movimentacoes').insert(nova)
  erro(error)
}

export async function excluirMovimentacao(id: string): Promise<void> {
  const { error } = await supabase.from('movimentacoes').delete().eq('id', id)
  erro(error)
}

export type EdicaoMovimentacao = Partial<Pick<Movimentacao, 'data' | 'quantidade' | 'preco_unitario' | 'valor_total' | 'observacao' | 'objetivo_id'>>

export async function atualizarMovimentacao(id: string, campos: EdicaoMovimentacao): Promise<void> {
  const { error } = await supabase.from('movimentacoes').update(campos).eq('id', id)
  erro(error)
}

/** Troca o destino de um lançamento (null = livre). */
export async function alterarDestino(id: string, objetivoId: string | null): Promise<void> {
  const { error } = await supabase.from('movimentacoes').update({ objetivo_id: objetivoId }).eq('id', id)
  erro(error)
}

// ============ Objetivos ============

export interface DadosObjetivo {
  nome: string
  valor_alvo: number
  prazo: string | null
  cor: string | null
}

export async function criarObjetivo(dados: DadosObjetivo): Promise<Objetivo> {
  const { data, error } = await supabase.from('objetivos').insert(dados).select().single()
  erro(error)
  return data as Objetivo
}

export async function atualizarObjetivo(id: string, dados: Partial<DadosObjetivo> & { concluido?: boolean }): Promise<void> {
  const { error } = await supabase.from('objetivos').update(dados).eq('id', id)
  erro(error)
}

/** Exclui o objetivo. Os lançamentos dele voltam a ser livres (FK on delete set null). */
export async function excluirObjetivo(id: string): Promise<void> {
  const { error } = await supabase.from('objetivos').delete().eq('id', id)
  erro(error)
}

// ============ Cotações ============

/** Grava (ou corrige) a cotação manual do dia em `cotacoes`. */
export async function salvarCotacaoManual(ticker: string, data: string, fechamento: number): Promise<void> {
  const { error } = await supabase
    .from('cotacoes')
    .upsert({ ticker, data, fechamento, fonte: 'manual' }, { onConflict: 'ticker,data' })
  if (error?.code === '42501') {
    throw new Error('Já existe uma cotação automática para esta data. Escolha outra data.')
  }
  erro(error)
}
