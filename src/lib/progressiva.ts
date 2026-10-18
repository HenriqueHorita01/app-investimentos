// Rentabilidade progressiva por tempo de aplicação (ex.: CDB Neon: 100% → 113% do CDI).
// Funções puras de faixas; o acúmulo diário fica em calculos.ts (rendaFixa).

export interface FaixaProgressiva {
  /** Início da faixa contado da data de início da contagem. */
  inicio: number
  unidade: 'dias' | 'meses'
  /** % do CDI desta faixa. */
  percentual: number
}

export interface ConfigProgressiva {
  /** Em ordem crescente de início; a primeira começa em 0. */
  faixas: FaixaProgressiva[]
  /** true = a taxa da faixa alcançada vale desde a data da aplicação (recalcula tudo). */
  retroativa: boolean
  /** individual = cada aporte conta o próprio tempo; compartilhada = desde o 1º aporte. */
  contagem: 'individual' | 'compartilhada'
}

/** CDB Neon — liquidez diária progressiva (configurável: ajuste os limites ao regulamento). */
export const PRESET_NEON: ConfigProgressiva = {
  faixas: [
    { inicio: 0, unidade: 'meses', percentual: 100 },
    { inicio: 6, unidade: 'meses', percentual: 103 },
    { inicio: 12, unidade: 'meses', percentual: 106 },
    { inicio: 18, unidade: 'meses', percentual: 109 },
    { inicio: 24, unidade: 'meses', percentual: 113 },
  ],
  retroativa: true,
  contagem: 'individual',
}
export const CARENCIA_NEON_DIAS = 30

/** Soma meses mantendo o dia (31/01 + 1 mês = 28/02 ou 29/02). */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}

export function somarDiasCorridos(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Data em que a faixa começa para uma contagem iniciada em `inicio`. */
export function inicioDaFaixa(inicio: string, f: FaixaProgressiva): string {
  return f.unidade === 'meses' ? somarMeses(inicio, f.inicio) : somarDiasCorridos(inicio, f.inicio)
}

/** Índice da faixa vigente em `data` (a última cujo início já chegou). */
export function faixaEm(cfg: ConfigProgressiva, inicio: string, data: string): number {
  let i = 0
  cfg.faixas.forEach((f, k) => {
    if (inicioDaFaixa(inicio, f) <= data) i = k
  })
  return i
}

/** Próxima faixa depois de `data` (ou null se já está na última). */
export function proximaFaixa(cfg: ConfigProgressiva, inicio: string, data: string): { indice: number; data: string; percentual: number } | null {
  const atual = faixaEm(cfg, inicio, data)
  const f = cfg.faixas[atual + 1]
  return f ? { indice: atual + 1, data: inicioDaFaixa(inicio, f), percentual: f.percentual } : null
}

/** Valida e normaliza a configuração vinda do banco (jsonb). */
export function lerConfig(v: unknown): ConfigProgressiva | null {
  if (!v || typeof v !== 'object') return null
  const c = v as Partial<ConfigProgressiva>
  if (!Array.isArray(c.faixas) || !c.faixas.length) return null
  const faixas = c.faixas
    .map((f) => ({ inicio: Number(f.inicio) || 0, unidade: f.unidade === 'dias' ? ('dias' as const) : ('meses' as const), percentual: Number(f.percentual) || 0 }))
    .sort((a, b) => (a.unidade === b.unidade ? a.inicio - b.inicio : (a.unidade === 'dias' ? a.inicio / 30 : a.inicio) - (b.unidade === 'dias' ? b.inicio / 30 : b.inicio)))
  return { faixas, retroativa: c.retroativa !== false, contagem: c.contagem === 'compartilhada' ? 'compartilhada' : 'individual' }
}

export function descreverFaixas(cfg: ConfigProgressiva): string {
  return cfg.faixas.map((f) => `${f.inicio === 0 ? 'início' : `${f.inicio} ${f.unidade}`}: ${f.percentual}%`).join(' · ')
}
