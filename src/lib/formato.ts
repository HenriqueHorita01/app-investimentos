const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlInteiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 })
const pct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

export const formatarBRL = (v: number) => brl.format(v)
export const formatarBRLInteiro = (v: number) => brlInteiro.format(v)
export const formatarNumero = (v: number) => numero.format(v)
/** "61,2 mil" para o centro do gráfico. */
export const formatarCompacto = (v: number) => compacto.format(v)

/** "+R$ 10,00" / "−R$ 10,00" (sinal tipográfico de menos). */
export function formatarBRLComSinal(v: number): string {
  if (Math.abs(v) < 0.005) return formatarBRL(0)
  return (v > 0 ? '+' : '−') + formatarBRL(Math.abs(v))
}

/** Recebe fração (0.0207) e devolve "+2,07%". */
export function formatarPercentual(fracao: number, comSinal = true): string {
  const v = fracao * 100
  if (Math.abs(v) < 0.005) return '0,0%'
  const sinal = v < 0 ? '−' : comSinal ? '+' : ''
  return sinal + pct.format(Math.abs(v)) + '%'
}

/** Data de hoje (AAAA-MM-DD) no fuso America/Sao_Paulo. */
export function hojeSP(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}

/** "2026-10-09" → "09/10/2026" (sem passar por Date, evita erro de fuso). */
export function formatarData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** "2026-10-13" → "Out/2026". */
export function formatarMesAno(iso: string): string {
  const [a, m] = iso.split('-')
  return `${MESES[Number(m) - 1]}/${a}`
}

/** Aceita "1.234,56", "1234,56" ou "1234.56". Retorna NaN se inválido. */
export function lerNumero(texto: string): number {
  let t = texto.trim().replace(/\s|R\$/g, '')
  if (!t) return NaN
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  return /^-?\d*\.?\d+$/.test(t) ? Number(t) : NaN
}
