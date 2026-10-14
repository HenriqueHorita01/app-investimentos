import { supabase } from './supabase'
import type { Ativo, Cotacao, Movimentacao, TipoAtivo, TipoMovimentacao } from './tipos'
import { calcularPosicao, type Posicao } from './calculos'

export interface AtivoComPosicao extends Ativo {
  posicao: Posicao
  ultimaCotacao: Cotacao | null
  movimentacoes: Movimentacao[]
}

const num = (v: unknown) => (v == null ? null : Number(v))

function normalizarMov(m: Movimentacao): Movimentacao {
  return { ...m, quantidade: num(m.quantidade), preco_unitario: num(m.preco_unitario), valor_total: Number(m.valor_total) }
}

function erro(e: { message: string } | null): asserts e is null {
  if (e) throw new Error(e.message)
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

/** Carteira completa: ativos ativos + posição calculada no front (SPEC §4). */
export async function carregarCarteira(): Promise<AtivoComPosicao[]> {
  const [ativosR, movsR] = await Promise.all([
    supabase.from('ativos').select('*').eq('ativo', true).order('criado_em'),
    supabase.from('movimentacoes').select('*').order('data'),
  ])
  erro(ativosR.error)
  erro(movsR.error)
  const ativos = (ativosR.data ?? []) as Ativo[]
  const movs = ((movsR.data ?? []) as Movimentacao[]).map(normalizarMov)
  const cot = await ultimasCotacoes(ativos.map((a) => a.ticker).filter((t): t is string => !!t))
  return ativos.map((a) => {
    const c = a.ticker ? (cot.get(a.ticker) ?? null) : null
    const doAtivo = movs.filter((m) => m.ativo_id === a.id)
    return { ...a, movimentacoes: doAtivo, ultimaCotacao: c, posicao: calcularPosicao(a, doAtivo, c?.fechamento ?? null) }
  })
}

export async function carregarAtivo(id: string): Promise<AtivoComPosicao | null> {
  const [ativoR, movsR] = await Promise.all([
    supabase.from('ativos').select('*').eq('id', id).maybeSingle(),
    supabase.from('movimentacoes').select('*').eq('ativo_id', id).order('data').order('criado_em'),
  ])
  erro(ativoR.error)
  erro(movsR.error)
  if (!ativoR.data) return null
  const ativo = ativoR.data as Ativo
  const movs = ((movsR.data ?? []) as Movimentacao[]).map(normalizarMov)
  const cot = ativo.ticker ? ((await ultimasCotacoes([ativo.ticker])).get(ativo.ticker) ?? null) : null
  return { ...ativo, movimentacoes: movs, ultimaCotacao: cot, posicao: calcularPosicao(ativo, movs, cot?.fechamento ?? null) }
}

export interface NovoAtivo {
  tipo: TipoAtivo
  ticker: string | null
  nome: string
  instituicao: string | null
  indexador: Ativo['indexador']
  taxa: number | null
  vencimento: string | null
}

export async function criarAtivo(novo: NovoAtivo): Promise<Ativo> {
  const { data, error } = await supabase.from('ativos').insert(novo).select().single()
  erro(error)
  return data as Ativo
}

export interface NovaMovimentacao {
  ativo_id: string
  data: string
  tipo: TipoMovimentacao
  quantidade: number | null
  preco_unitario: number | null
  valor_total: number
  observacao: string | null
}

export async function criarMovimentacao(nova: NovaMovimentacao): Promise<void> {
  const { error } = await supabase.from('movimentacoes').insert(nova)
  erro(error)
}

export async function excluirMovimentacao(id: string): Promise<void> {
  const { error } = await supabase.from('movimentacoes').delete().eq('id', id)
  erro(error)
}

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
