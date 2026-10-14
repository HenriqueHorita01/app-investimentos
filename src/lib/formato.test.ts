import { describe, expect, it } from 'vitest'
import { formatarData, formatarPercentual, hojeSP, lerNumero } from './formato'

describe('formato', () => {
  it('lê números no padrão brasileiro', () => {
    expect(lerNumero('1.234,56')).toBe(1234.56)
    expect(lerNumero('149,25')).toBe(149.25)
    expect(lerNumero('149.25')).toBe(149.25)
    expect(lerNumero('R$ 10')).toBe(10)
    expect(lerNumero('abc')).toBeNaN()
    expect(lerNumero('')).toBeNaN()
  })
  it('formata data sem erro de fuso', () => {
    expect(formatarData('2026-10-09')).toBe('09/10/2026')
  })
  it('hoje em São Paulo', () => {
    // 02:00 UTC de 14/10 ainda é 13/10 em São Paulo (UTC−3)
    expect(hojeSP(new Date('2026-10-14T02:00:00Z'))).toBe('2026-10-13')
  })
  it('percentual com sinal', () => {
    expect(formatarPercentual(0.0207)).toBe('+2,07%')
    expect(formatarPercentual(-0.008)).toBe('−0,8%')
  })
})
