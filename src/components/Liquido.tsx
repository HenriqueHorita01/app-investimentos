import { useState, type FormEvent } from 'react'
import { confirmarLiquidoManual, salvarLiquidoManual, type AtivoComPosicao } from '../lib/dados'
import { assinaturaLancamentos, calcularLiquido, liquidoVigente } from '../lib/liquido'
import { formatarBRL, formatarBRLComSinal, formatarData, hojeSP, lerNumero } from '../lib/formato'
import { Cartao, corSinal } from './ui'

/** Selo que diz de onde vem o líquido: estimado (calculado) ou informado manualmente. */
export function SeloLiquido({ manual, desatualizado = false }: { manual: boolean; desatualizado?: boolean }) {
  const cor = desatualizado ? 'var(--negativo)' : manual ? 'var(--fii)' : 'var(--texto-2)'
  return (
    <span className="rounded-full px-1.5 text-[10px] font-bold" style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
      {desatualizado ? 'manual · revisar' : manual ? 'manual' : 'estimado'}
    </span>
  )
}

const Lapis = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M14 6l4 4" />
  </svg>
)

/**
 * Resumo de resgate de um investimento: investido, rendimento, IR, IOF, bruto e líquido.
 * O líquido é calculado automaticamente e pode ser substituído por um valor manual,
 * sem alterar lançamentos.
 */
export function CartaoLiquido({ a, aoMudar }: { a: AtivoComPosicao; aoMudar: () => void }) {
  const hoje = hojeSP()
  const calc = calcularLiquido(a, a.posicao, hoje)
  const vig = liquidoVigente(a, calc.liquido, a.movimentacoes)
  const assinatura = assinaturaLancamentos(a.movimentacoes)
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function acao(fn: () => Promise<void>) {
    setErro(null)
    setSalvando(true)
    try {
      await fn()
      setEditando(false)
      aoMudar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  function salvar(e: FormEvent) {
    e.preventDefault()
    const v = lerNumero(valor)
    if (!(v >= 0)) return setErro('Informe o valor líquido (o "disponível para resgate" do banco).')
    acao(() => salvarLiquidoManual(a.id, Math.round(v * 100) / 100, assinatura))
  }

  const linha = (rotulo: string, v: string, cor = '') => (
    <div className="flex justify-between text-[13px]">
      <span className="text-texto-2">{rotulo}</span>
      <span className={`font-mono ${cor}`}>{v}</span>
    </div>
  )

  return (
    <Cartao className="flex flex-col gap-2">
      <div className="text-sm font-bold">Se resgatar hoje</div>
      {linha('Total investido', formatarBRL(calc.investido))}
      {linha('Rendimento bruto', formatarBRLComSinal(calc.rendimentoBruto), corSinal(calc.rendimentoBruto))}
      {linha('IR estimado', calc.ir > 0.004 ? `− ${formatarBRL(calc.ir)}` : formatarBRL(0))}
      {calc.iof > 0.004 && linha('IOF estimado', `− ${formatarBRL(calc.iof)}`)}
      {linha('Saldo bruto', formatarBRL(calc.bruto))}

      <div className="mt-1 flex items-center justify-between gap-2 border-t border-linha pt-2">
        <span className="flex items-center gap-1.5 text-[13px] font-bold">
          Saldo líquido <SeloLiquido manual={vig.manual} desatualizado={vig.desatualizado} />
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-base font-bold">{formatarBRL(vig.valor)}</span>
          {!editando && (
            <button
              type="button"
              onClick={() => {
                setValor(String(vig.valor.toFixed(2)).replace('.', ','))
                setErro(null)
                setEditando(true)
              }}
              aria-label="Editar valor líquido"
              title="Editar valor líquido"
              className="rounded-lg border border-campo p-1.5 text-texto-2"
            >
              <Lapis />
            </button>
          )}
        </span>
      </div>

      {vig.manual && !editando && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-fundo p-2.5 text-xs">
          <div className="text-texto-2">
            Informado por você{vig.manualEm ? ` em ${formatarData(vig.manualEm.slice(0, 10))}` : ''}. Cálculo automático:{' '}
            <span className="font-mono">{formatarBRL(vig.calculado)}</span> (diferença {formatarBRLComSinal(vig.valor - vig.calculado)}).
          </div>
          {vig.desatualizado && (
            <div className="font-bold text-negativo">
              Houve lançamentos novos ou alterados depois desse valor. Ele pode estar desatualizado.
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-bold">
            <button type="button" disabled={salvando} className="text-positivo" onClick={() => acao(() => salvarLiquidoManual(a.id, null, null))}>
              Restaurar cálculo automático
            </button>
            {vig.desatualizado && (
              <button type="button" disabled={salvando} className="text-texto-2" onClick={() => acao(() => confirmarLiquidoManual(a.id, assinatura))}>
                Manter valor informado
              </button>
            )}
          </div>
        </div>
      )}

      {editando && (
        <form onSubmit={salvar} className="flex flex-col gap-2 rounded-lg bg-fundo p-2.5">
          <label htmlFor={`liq-${a.id}`} className="rotulo">Valor líquido atual (ex.: "disponível para resgate" do banco)</label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <input id={`liq-${a.id}`} className="campo font-mono" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
            <button type="submit" disabled={salvando} className="rounded-[10px] bg-botao px-3 text-sm font-bold text-white disabled:opacity-60">
              Salvar
            </button>
            <button type="button" onClick={() => setEditando(false)} className="rounded-[10px] border border-campo px-3 text-sm">
              Cancelar
            </button>
          </div>
          <div className="text-[11px] text-texto-2">Não altera aportes, rendimentos nem impostos: só o valor líquido exibido.</div>
        </form>
      )}
      {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
      <div className="text-[11px] text-texto-2">{calc.regra} Estimativa; dividendos já recebidos não entram.</div>
    </Cartao>
  )
}
