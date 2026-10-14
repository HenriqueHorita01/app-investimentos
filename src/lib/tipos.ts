export type TipoAtivo = 'fii' | 'acao' | 'cdb' | 'lci_lca' | 'tesouro' | 'etf' | 'outro'
export type Indexador = 'cdi' | 'ipca' | 'pre' | 'selic' | 'nenhum'
export type TipoMovimentacao = 'aporte' | 'resgate' | 'dividendo' | 'jcp' | 'amortizacao' | 'ajuste'

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
  criado_em: string
}

export interface Cotacao {
  ticker: string
  data: string
  fechamento: number
  fonte: string
}

/** Tipos cadastráveis no MVP (Fase 1). */
export const TIPOS_MVP: TipoAtivo[] = ['fii', 'acao', 'cdb']

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
