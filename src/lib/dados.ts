import { supabase } from './supabase'
import type { Ativo, CategoriaCarteira, CdiDia, Cotacao, Movimentacao, Objetivo, TipoAtivo, TipoMovimentacao } from './tipos'
import { ehRendaVariavel, rotuloAtivo } from './tipos'
import { CATEGORIAS_PADRAO } from './carteiraPlano'
import { calcularPosicao, progressoObjetivos, type Posicao, type ProgressoObjetivo, type SerieIpca } from './calculos'

export interface AtivoComPosicao extends Ativo {
  posicao: Posicao
  ultimaCotacao: Cotacao | null
  movimentacoes: Movimentacao[]
}

export interface Carteira {
  ativos: AtivoComPosicao[]
  /** Objetivos comuns (sem a reserva de emergência). */
  objetivos: Objetivo[]
  progresso: ProgressoObjetivo[]
  /** Destino especial "Reserva de emergência" (criado na primeira carga). */
  reserva: Objetivo
  progressoReserva: ProgressoObjetivo
  /** Último dia com CDI gravado (null se a tabela estiver vazia). */
  cdiAte: string | null
  /** CDI do último dia, % ao dia. */
  cdiUltimo: number | null
  /** Série usada nos cálculos (para simular alterações antes de gravar). */
  cdi: CdiDia[]
  /** IPCA mensal ("AAAA-MM" → %), para aplicações IPCA+. */
  ipca: SerieIpca
  /** Último mês com IPCA divulgado ("AAAA-MM"). */
  ipcaAte: string | null
}

const num = (v: unknown) => (v == null ? null : Number(v))

function normalizarMov(m: Movimentacao): Movimentacao {
  return { ...m, quantidade: num(m.quantidade), preco_unitario: num(m.preco_unitario), valor_total: Number(m.valor_total), taxa: num(m.taxa) }
}

/** IPCA mensal inteiro (são poucas linhas). */
async function carregarIpca(): Promise<SerieIpca> {
  const { data, error } = await supabase.from('ipca_mensal').select('mes, variacao').order('mes')
  erro(error)
  return new Map((data ?? []).map((l) => [String(l.mes).slice(0, 7), Number(l.variacao)]))
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
export async function cdiDesde(desde: string): Promise<CdiDia[]> {
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
  const ativos = ((ativosR.data ?? []) as Ativo[]).map((a) => ({
    ...a,
    taxa: num(a.taxa),
    percentual_alvo: num(a.percentual_alvo),
    preco_referencia: num(a.preco_referencia),
    aplicacao_minima: num(a.aplicacao_minima),
    incremento_minimo: num(a.incremento_minimo),
    liquido_manual: num(a.liquido_manual),
  }))
  const todosObjetivos = ((objetivosR.data ?? []) as Objetivo[]).map((o) => ({ ...o, valor_alvo: num(o.valor_alvo) }))
  const objetivos = todosObjetivos.filter((o) => o.tipo !== 'reserva_emergencia')
  const reserva = todosObjetivos.find((o) => o.tipo === 'reserva_emergencia') ?? (await criarReserva())
  const movs = movsBrutas.map(normalizarMov)

  // Calendário de dias úteis (série do CDI) desde a primeira aplicação em renda fixa:
  // serve para CDI, prefixado, Selic e IPCA+.
  const idsRf = new Set(ativos.filter((a) => !ehRendaVariavel(a.tipo)).map((a) => a.id))
  const primeira = movs.find((m) => idsRf.has(m.ativo_id))?.data
  const [cot, cdi, ipca] = await Promise.all([
    ultimasCotacoes(ativos.map((a) => a.ticker).filter((t): t is string => !!t)),
    primeira ? cdiDesde(primeira) : Promise.resolve([] as CdiDia[]),
    carregarIpca(),
  ])

  const comPosicao = ativos.map((a) => {
    const c = a.ticker ? (cot.get(a.ticker) ?? null) : null
    const doAtivo = movs.filter((m) => m.ativo_id === a.id)
    return { ...a, movimentacoes: doAtivo, ultimaCotacao: c, posicao: calcularPosicao(a, doAtivo, c?.fechamento ?? null, cdi, ipca) }
  })

  const usos = comPosicao.map((a) => ({ id: a.id, rotulo: rotuloAtivo(a), posicao: a.posicao }))
  return {
    ativos: comPosicao,
    objetivos,
    progresso: progressoObjetivos(objetivos, usos),
    reserva,
    progressoReserva: progressoObjetivos([reserva], usos)[0],
    cdiAte: cdiUltR.data?.[0]?.data ?? null,
    cdiUltimo: cdiUltR.data?.[0] ? Number(cdiUltR.data[0].taxa_dia) : null,
    cdi,
    ipca,
    ipcaAte: [...ipca.keys()].at(-1) ?? null,
  }
}

/** Cria o destino "Reserva de emergência" do usuário (um por usuário; índice único no banco). */
async function criarReserva(): Promise<Objetivo> {
  const { data, error } = await supabase
    .from('objetivos')
    .insert({ nome: 'Reserva de emergência', tipo: 'reserva_emergencia', cor: '#0E8A8A', valor_alvo: null })
    .select()
    .single()
  if (error?.code === '23505') {
    // Outra aba criou ao mesmo tempo: busca a existente.
    const r = await supabase.from('objetivos').select('*').eq('tipo', 'reserva_emergencia').single()
    erro(r.error)
    return { ...(r.data as Objetivo), valor_alvo: num(r.data.valor_alvo) }
  }
  erro(error)
  return { ...(data as Objetivo), valor_alvo: num(data.valor_alvo) }
}

/** Recalcula a posição do ativo com uma lista de lançamentos alterada (para validar antes de gravar). */
export function simularPosicao(a: AtivoComPosicao, movs: Movimentacao[], cdi: CdiDia[], ipca: SerieIpca = new Map()): Posicao {
  return calcularPosicao(a, movs, a.ultimaCotacao?.fechamento ?? null, cdi, ipca)
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
  categoria_id?: string | null
  percentual_alvo?: number | null
  preco_referencia?: number | null
  aplicacao_minima?: number | null
  incremento_minimo?: number | null
  liquidez?: string | null
}

export async function criarAtivo(novo: NovoAtivo): Promise<Ativo> {
  const { data, error } = await supabase.from('ativos').insert(novo).select().single()
  erro(error)
  return data as Ativo
}

export type EdicaoAtivo = Partial<
  Pick<
    Ativo,
    | 'tipo'
    | 'ticker'
    | 'nome'
    | 'instituicao'
    | 'indexador'
    | 'taxa'
    | 'vencimento'
    | 'categoria_id'
    | 'percentual_alvo'
    | 'preco_referencia'
    | 'aplicacao_minima'
    | 'incremento_minimo'
    | 'liquidez'
    | 'lote'
  >
>

export async function atualizarAtivo(id: string, campos: EdicaoAtivo): Promise<void> {
  const { error } = await supabase.from('ativos').update(campos).eq('id', id)
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
  // Renda fixa: condições próprias desta aplicação (vazias = herdam do ativo).
  taxa?: number | null
  indexador?: Movimentacao['indexador']
  vencimento?: string | null
  liquidez?: string | null
  carencia?: string | null
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

export type EdicaoMovimentacao = Partial<
  Pick<
    Movimentacao,
    'data' | 'quantidade' | 'preco_unitario' | 'valor_total' | 'observacao' | 'objetivo_id' | 'taxa' | 'indexador' | 'vencimento' | 'liquidez' | 'carencia'
  >
>

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

export async function atualizarObjetivo(
  id: string,
  dados: Partial<Omit<DadosObjetivo, 'valor_alvo'>> & { valor_alvo?: number | null; concluido?: boolean },
): Promise<void> {
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

// ============ Dividir um ativo entre destinos ============

/**
 * Move uma fração de um destino para outro no mesmo ativo (null = livre).
 * Divide os lançamentos da origem na proporção (função no banco, atômica).
 */
export async function moverEntreDestinos(ativoId: string, origem: string | null, destino: string | null, fracao: number): Promise<void> {
  const { error } = await supabase.rpc('mover_entre_destinos', { p_ativo: ativoId, p_origem: origem, p_destino: destino, p_fracao: fracao })
  erro(error)
}

/** Devolve ao livre tudo o que o ativo tem reservado para o objetivo. */
export async function liberarDoObjetivo(ativoId: string, objetivoId: string): Promise<void> {
  const { error } = await supabase.from('movimentacoes').update({ objetivo_id: null }).eq('ativo_id', ativoId).eq('objetivo_id', objetivoId)
  erro(error)
}

// ============ Minha Carteira: categorias ============

/** Categorias da Minha Carteira. Na primeira vez, cria a distribuição padrão (Alternativa B). */
export async function carregarCategorias(): Promise<CategoriaCarteira[]> {
  const { data, error } = await supabase.from('carteira_categorias').select('*').order('ordem').order('criado_em')
  erro(error)
  if (data && data.length) return data.map((c) => ({ ...c, percentual: Number(c.percentual) }))
  const ins = await supabase
    .from('carteira_categorias')
    .insert(CATEGORIAS_PADRAO.map((c, i) => ({ ...c, ordem: i })))
    .select()
  erro(ins.error)
  return (ins.data ?? []).map((c) => ({ ...c, percentual: Number(c.percentual) }))
}

export async function criarCategoria(dados: { nome: string; percentual: number; ordem: number; cor: string | null }): Promise<void> {
  const { error } = await supabase.from('carteira_categorias').insert(dados)
  erro(error)
}

export async function atualizarCategoria(id: string, dados: Partial<Pick<CategoriaCarteira, 'nome' | 'percentual' | 'ordem' | 'cor'>>): Promise<void> {
  const { error } = await supabase.from('carteira_categorias').update(dados).eq('id', id)
  erro(error)
}

/** Exclui a categoria. Os ativos dela continuam existindo, só saem da Minha Carteira. */
export async function excluirCategoria(id: string): Promise<void> {
  const { error } = await supabase.from('carteira_categorias').delete().eq('id', id)
  erro(error)
}

/** Grava os % de vários ativos de uma vez (ex.: "dividir igualmente"). */
export async function salvarPercentuais(itens: { id: string; percentual_alvo: number | null }[]): Promise<void> {
  for (const i of itens) {
    const { error } = await supabase.from('ativos').update({ percentual_alvo: i.percentual_alvo }).eq('id', i.id)
    erro(error)
  }
}

// ============ Saldo líquido manual ============

/**
 * Grava o saldo líquido informado pelo usuário (ex.: "disponível para resgate" do banco)
 * junto com a data e a assinatura atual dos lançamentos. Não altera nenhum lançamento.
 * `valor = null` restaura o cálculo automático.
 */
export async function salvarLiquidoManual(ativoId: string, valor: number | null, assinatura: string | null): Promise<void> {
  const { error } = await supabase
    .from('ativos')
    .update({
      liquido_manual: valor,
      liquido_manual_em: valor == null ? null : new Date().toISOString(),
      liquido_manual_assinatura: valor == null ? null : assinatura,
    })
    .eq('id', ativoId)
  erro(error)
}

/** Mantém o valor manual, marcando que ele vale para os lançamentos atuais. */
export async function confirmarLiquidoManual(ativoId: string, assinatura: string): Promise<void> {
  const { error } = await supabase.from('ativos').update({ liquido_manual_assinatura: assinatura }).eq('id', ativoId)
  erro(error)
}
