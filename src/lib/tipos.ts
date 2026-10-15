export type TipoAtivo = 'fii' | 'acao' | 'cdb' | 'lci_lca' | 'tesouro' | 'etf' | 'outro'
export type Indexador = 'cdi' | 'ipca' | 'pre' | 'selic' | 'nenhum'
export type TipoMovimentacao = 'aporte' | 'resgate' | 'dividendo' | 'jcp' | 'amortizacao' | 'ajuste'
/** Coluna legada: a reserva de emergência agora é um destino (objetivo do tipo reserva). */
export type Finalidade = 'investimento' | 'reserva_emergencia'

export interface Ativo {
  id: string
  ticker: string | null
  nome: string
  tipo: TipoAtivo
  instituicao: string | null
  indexador: Indexador
  taxa: number | null
  vencimento: string | null
  ativo: boolean
  finalidade: Finalidade
  criado_em: string
  // ---- Planejamento (aba Minha Carteira) ----
  /** Categoria da Minha Carteira (null = fora da carteira). */
  categoria_id: string | null
  /** % da carteira total desejado (null = pendente de configuração). */
  percentual_alvo: number | null
  /** Preço para simular quando ainda não há cotação. */
  preco_referencia: number | null
  /** Renda fixa: aplicação mínima e incremento depois dela. */
  aplicacao_minima: number | null
  incremento_minimo: number | null
  liquidez: string | null
  /** Renda variável: quantidade mínima por compra (1 = fracionário). */
  lote: number
}

export interface CategoriaCarteira {
  id: string
  nome: string
  /** % da carteira total (as categorias somam 100). */
  percentual: number
  ordem: number
  cor: string | null
  criado_em: string
}

export interface Movimentacao {
  id: string
  ativo_id: string
  data: string
  tipo: TipoMovimentacao
  quantidade: number | null
  preco_unitario: number | null
  valor_total: number
  observacao: string | null
  /** null = livre; senão, id do objetivo ou da reserva de emergência. */
  objetivo_id: string | null
  criado_em: string
}

export interface Objetivo {
  id: string
  nome: string
  /** null só na reserva de emergência sem meta. */
  valor_alvo: number | null
  /** 'reserva_emergencia' = destino especial da aba Reserva (um por usuário). */
  tipo: 'objetivo' | 'reserva_emergencia'
  prazo: string | null
  cor: string | null
  concluido: boolean
  criado_em: string
}

export interface CdiDia {
  data: string
  /** % ao dia, ex.: 0.0508 */
  taxa_dia: number
}

export interface Cotacao {
  ticker: string
  data: string
  fechamento: number
  fonte: string
}

/** Tipos cadastráveis. */
export const TIPOS_MVP: TipoAtivo[] = ['fii', 'acao', 'etf', 'cdb', 'lci_lca', 'tesouro']

export const NOME_TIPO: Record<TipoAtivo, string> = {
  fii: 'FII',
  acao: 'Ação',
  cdb: 'CDB',
  lci_lca: 'LCI/LCA',
  tesouro: 'Tesouro',
  etf: 'ETF',
  outro: 'Outro',
}

/** Agrupamento usado no gráfico e nos filtros da Carteira. */
export type Classe = 'fii' | 'acao' | 'renda_fixa' | 'outro'

export const NOME_CLASSE: Record<Classe, string> = {
  fii: 'FIIs',
  acao: 'Ações',
  renda_fixa: 'Renda fixa',
  outro: 'Outros',
}

export function classeDoTipo(tipo: TipoAtivo): Classe {
  if (tipo === 'fii') return 'fii'
  if (tipo === 'acao' || tipo === 'etf') return 'acao'
  if (tipo === 'cdb' || tipo === 'lci_lca' || tipo === 'tesouro') return 'renda_fixa'
  return 'outro'
}

export function ehRendaVariavel(tipo: TipoAtivo): boolean {
  return tipo === 'fii' || tipo === 'acao' || tipo === 'etf'
}

/** Nome curto para listas: ticker na renda variável, nome na renda fixa. */
export function rotuloAtivo(a: Pick<Ativo, 'ticker' | 'nome'>): string {
  return a.ticker || a.nome
}

/** Observação dos dividendos lançados de uma vez ao cadastrar uma posição antiga. */
export const OBS_PROVENTOS_ANTERIORES = 'Proventos recebidos antes do cadastro'

/** Indexadores de renda fixa e como a taxa é lida em cada um. */
export const INDEXADORES: { id: Indexador; nome: string; rotuloTaxa: string; exemplo: string; taxaObrigatoria: boolean }[] = [
  { id: 'cdi', nome: '% do CDI', rotuloTaxa: 'Taxa (% do CDI)', exemplo: '110', taxaObrigatoria: true },
  { id: 'ipca', nome: 'IPCA +', rotuloTaxa: 'Taxa real (IPCA + % a.a.)', exemplo: '6,5', taxaObrigatoria: true },
  { id: 'pre', nome: 'Prefixado', rotuloTaxa: 'Taxa (% a.a.)', exemplo: '12,5', taxaObrigatoria: true },
  { id: 'selic', nome: 'Selic', rotuloTaxa: 'Taxa adicional (% a.a.)', exemplo: '0,1', taxaObrigatoria: false },
]

/** "102% CDI", "IPCA + 6,5%", "12,5% a.a.", "Selic + 0,1%" (vazio se não houver taxa). */
export function descreverTaxa(a: Pick<Ativo, 'indexador' | 'taxa'>): string {
  const t = a.taxa != null ? a.taxa.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : null
  if (a.indexador === 'cdi') return t ? `${t}% CDI` : 'CDI'
  if (a.indexador === 'ipca') return t ? `IPCA + ${t}%` : 'IPCA'
  if (a.indexador === 'selic') return t ? `Selic + ${t}%` : 'Selic'
  if (a.indexador === 'pre') return t ? `${t}% a.a.` : 'Prefixado'
  return ''
}
