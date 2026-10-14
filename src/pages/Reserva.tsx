import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { carregarCarteira, carregarMetaReserva, salvarMetaReserva } from '../lib/dados'
import { rendimentoNoMes } from '../lib/calculos'
import {
  formatarBRL,
  formatarBRLComSinal,
  formatarBRLInteiro,
  formatarData,
  formatarMesAno,
  formatarNumero,
  formatarPercentual,
  hojeSP,
  lerNumero,
} from '../lib/formato'
import { ehRendaVariavel, NOME_TIPO, rotuloAtivo } from '../lib/tipos'
import { useCarregar } from '../lib/useCarregar'
import { Campo, Cartao, Carregando, corSinal, Erro, Titulo } from '../components/ui'

async function carregarReserva() {
  const [carteira, meta] = await Promise.all([carregarCarteira(), carregarMetaReserva()])
  return { carteira, meta }
}

export default function Reserva() {
  const { dados, erro, carregando, recarregar } = useCarregar(carregarReserva)
  const hoje = hojeSP()

  const cabecalho = (
    <Titulo
      direita={
        <Link to="/ativos/novo?finalidade=reserva_emergencia&voltar=/reserva" className="rounded-full border border-campo bg-cartao px-3.5 py-2 text-[13px] font-bold">
          + Aplicação
        </Link>
      }
    >
      Reserva
    </Titulo>
  )

  if (carregando && !dados) return <>{cabecalho}<Carregando /></>
  if (erro || !dados) return <>{cabecalho}<Erro mensagem={erro ?? 'Erro ao carregar.'} tentar={recarregar} /></>

  const { carteira, meta } = dados
  const cdiAtual = carteira.cdiAte && carteira.cdiUltimo != null ? { data: carteira.cdiAte, taxa_dia: carteira.cdiUltimo } : null
  const ativos = carteira.ativos
    .filter((a) => a.finalidade === 'reserva_emergencia')
    .map((a) => ({ ...a, mes: rendimentoNoMes(a, a.movimentacoes, carteira.cdi, hoje, cdiAtual) }))
  const saldo = ativos.reduce((s, a) => s + a.posicao.valorAtual, 0)
  const aplicado = ativos.reduce((s, a) => s + a.posicao.investido, 0)
  const rendimento = saldo - aplicado
  const mesRealizado = ativos.reduce((s, a) => s + a.mes.realizado, 0)
  const mesTotal = ativos.reduce((s, a) => s + a.mes.total, 0)
  const temCalculo = ativos.some((a) => !a.posicao.semRendimento)
  // CDI anualizado (252 dias úteis) a partir da taxa diária mais recente.
  const cdiAno = carteira.cdiUltimo != null ? (1 + carteira.cdiUltimo / 100) ** 252 - 1 : null

  return (
    <>
      {cabecalho}

      <div className="flex flex-col gap-1.5 rounded-2xl border border-destaque-borda bg-destaque p-5 text-white">
        <div className="text-[13px] text-destaque-texto-2">Reserva de emergência · saldo bruto</div>
        <div className="font-mono text-[30px] font-medium">{formatarBRL(saldo)}</div>
        <div className={`text-[13px] ${rendimento < -0.005 ? 'text-destaque-negativo' : 'text-destaque-positivo'}`}>
          {formatarBRLComSinal(rendimento)} ({formatarPercentual(aplicado > 0 ? rendimento / aplicado : 0)}) de rendimento
        </div>
      </div>

      <MetaReserva meta={meta} saldo={saldo} aoMudar={recarregar} />

      <div className="grid grid-cols-2 gap-3">
        <Cartao className="!p-3.5">
          <div className="text-xs text-texto-2">Rendimento em {formatarMesAno(hoje)}</div>
          <div className="mt-1 font-mono text-[17px] text-positivo">{temCalculo ? `≈ ${formatarBRL(mesTotal)}` : '—'}</div>
          <div className="mt-0.5 text-[11px] text-texto-2">
            {temCalculo ? `${formatarBRL(mesRealizado)} até agora · estimativa` : 'Sem aplicação no CDI'}
          </div>
        </Cartao>
        <Cartao className="!p-3.5">
          <div className="text-xs text-texto-2">Aplicado</div>
          <div className="mt-1 font-mono text-[17px]">{formatarBRL(aplicado)}</div>
          <div className="mt-0.5 text-[11px] text-texto-2">
            CDI {cdiAno != null ? `${formatarPercentual(cdiAno, false)} a.a.` : '—'}
            {carteira.cdiAte ? ` · até ${formatarData(carteira.cdiAte).slice(0, 5)}` : ''}
          </div>
        </Cartao>
      </div>

      {ativos.length === 0 ? (
        <Cartao className="flex flex-col gap-3 text-sm">
          <div>
            Registre aqui o dinheiro da sua reserva de emergência (ex.: CDB de liquidez diária). Ele fica <b>fora do patrimônio</b> e serve só para
            acompanhar o rendimento.
          </div>
          <Link to="/ativos/novo?finalidade=reserva_emergencia&voltar=/reserva" className="self-start rounded-xl bg-botao px-4 py-3 text-sm font-bold text-white">
            Adicionar aplicação
          </Link>
        </Cartao>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-[14px] bg-cartao">
          {ativos.map((a, i) => {
            const p = a.posicao
            const rv = ehRendaVariavel(a.tipo)
            return (
              <Link key={a.id} to={`/ativo/${a.id}`} className={`flex justify-between gap-3 px-4 py-3.5 ${i < ativos.length - 1 ? 'border-b border-linha' : ''}`}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{rotuloAtivo(a)}</div>
                  <div className="text-xs text-texto-2">
                    {rv ? `${NOME_TIPO[a.tipo]} · ${formatarNumero(p.quantidade)} cotas` : `${a.taxa ? formatarNumero(a.taxa) + '% CDI' : NOME_TIPO[a.tipo]}`}
                    {a.instituicao ? ` · ${a.instituicao}` : ''}
                  </div>
                  {a.mes.ritmoMensal > 0 && <div className="text-xs text-positivo">≈ {formatarBRL(a.mes.ritmoMensal)}/mês</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm">{formatarBRL(p.valorAtual)}</div>
                  <div className={`text-xs ${p.semRendimento ? 'text-texto-2' : corSinal(p.variacao)}`}>
                    {p.semRendimento ? 'sem cálculo' : formatarBRLComSinal(p.variacao)}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <div className="px-1 text-xs text-texto-2">
        Rendimento bruto, calculado dia útil a dia útil pelo CDI do Banco Central. O valor do mês e o "por mês" de cada aplicação são estimativas
        pelo CDI atual; o extrato do banco é a referência final.
      </div>
    </>
  )
}

function MetaReserva({ meta, saldo, aoMudar }: { meta: number | null; saldo: number; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(meta != null ? String(meta).replace('.', ',') : '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const v = valor.trim() ? lerNumero(valor) : null
    if (v != null && !(v > 0)) return setErro('Informe um valor maior que zero.')
    setSalvando(true)
    try {
      await salvarMetaReserva(v)
      setEditando(false)
      aoMudar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setSalvando(false)
    }
  }

  if (editando || meta == null) {
    return (
      <Cartao>
        <form onSubmit={salvar} className="flex flex-col gap-3">
          <div className="text-sm font-bold">Meta da reserva</div>
          {meta == null && !editando && (
            <div className="text-xs text-texto-2">Defina quanto quer ter guardado. Uma referência comum é de 6 a 12 meses dos seus gastos.</div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <Campo id="meta-reserva" rotulo="Valor da meta">
              <input id="meta-reserva" className="campo font-mono" inputMode="decimal" placeholder="30.000,00" value={valor} onChange={(e) => setValor(e.target.value)} />
            </Campo>
            <button type="submit" disabled={salvando} className="h-[50px] rounded-[10px] bg-botao px-4 text-sm font-bold text-white disabled:opacity-60">
              {salvando ? '…' : 'Salvar'}
            </button>
          </div>
          {editando && (
            <div className="flex gap-4 text-[13px] font-bold">
              <button type="button" className="text-texto-2" onClick={() => setEditando(false)}>Cancelar</button>
              {meta != null && (
                <button type="button" className="text-negativo" onClick={() => setValor('')}>Limpar (remover meta)</button>
              )}
            </div>
          )}
          {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
        </form>
      </Cartao>
    )
  }

  const progresso = saldo / meta
  const falta = meta - saldo
  return (
    <Cartao className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-bold">Meta da reserva</div>
        <button type="button" onClick={() => setEditando(true)} className="text-[13px] font-bold text-positivo">Editar</button>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[22px] text-positivo">{formatarPercentual(Math.floor(progresso * 1000) / 1000, false)}</span>
        <span className="text-[13px] text-texto-2">de {formatarBRLInteiro(meta)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-[5px] bg-linha" role="progressbar" aria-valuenow={Math.round(progresso * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da meta da reserva">
        <div className="h-full rounded-[5px] bg-positivo" style={{ width: `${Math.min(100, progresso * 100)}%` }} />
      </div>
      <div className="text-xs text-texto-2">{falta > 0.005 ? `Faltam ${formatarBRL(falta)}` : 'Meta atingida!'}</div>
    </Cartao>
  )
}
