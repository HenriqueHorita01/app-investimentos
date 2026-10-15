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

/** Observação dos dividendos lançados de uma vez ao cadastrar uma posição antiga. */
export const OBS_PROVENTOS_ANTERIORES = 'Proventos recebidos antes do cadastro'
