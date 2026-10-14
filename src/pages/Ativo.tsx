import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { carregarAtivo, excluirMovimentacao, salvarCotacaoManual, type AtivoComPosicao } from '../lib/dados'
import { formatarBRL, formatarBRLComSinal, formatarData, formatarNumero, formatarPercentual, hojeSP, lerNumero } from '../lib/formato'
import { ehRendaVariavel, NOME_TIPO, rotuloAtivo, type Movimentacao } from '../lib/tipos'
import { useCarregar } from '../lib/useCarregar'
import { Campo, Cartao, Carregando, corSinal, Erro } from '../components/ui'

const NOME_MOV: Record<Movimentacao['tipo'], string> = {
  aporte: 'Aporte',
  resgate: 'Resgate',
  dividendo: 'Dividendo',
  jcp: 'JCP',
  amortizacao: 'Amortização',
  ajuste: 'Ajuste',
}

export default function Ativo() {
  const { id = '' } = useParams()
  const { dados: a, erro, carregando, recarregar } = useCarregar(() => carregarAtivo(id), [id])

  const voltar = (
    <Link to="/carteira" className="-mb-1 flex min-h-8 items-center gap-1 text-sm text-positivo">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      Carteira
    </Link>
  )

  if (carregando && !a) return <>{voltar}<Carregando /></>
  if (erro) return <>{voltar}<Erro mensagem={erro} tentar={recarregar} /></>
  if (!a) return <>{voltar}<Erro mensagem="Ativo não encontrado." /></>

  const rv = ehRendaVariavel(a.tipo)
  const p = a.posicao
  const proventos = a.movimentacoes.filter((m) => m.tipo === 'dividendo' || m.tipo === 'jcp').reverse()

  return (
    <>
      {voltar}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{rotuloAtivo(a)}</h1>
          <div className="text-[13px] text-texto-2">
            {rv
              ? [NOME_TIPO[a.tipo], a.ticker !== a.nome ? a.nome : null, a.instituicao].filter(Boolean).join(' · ')
              : [`CDB ${a.taxa ? formatarNumero(a.taxa) + '% CDI' : ''}`, a.vencimento && `vence ${formatarData(a.vencimento)}`, a.instituicao].filter(Boolean).join(' · ')}
          </div>
        </div>
        <Link to={`/lancar?ativo=${a.id}`} className="shrink-0 rounded-full bg-botao px-3.5 py-2 text-[13px] font-bold text-white">
          + Lançar
        </Link>
      </div>

      {rv ? (
        <Cartao className="grid grid-cols-2 gap-3.5">
          <Dado rotulo="Cotas">{formatarNumero(p.quantidade)}</Dado>
          <Dado rotulo="Custo médio">{formatarBRL(p.custoMedio)}</Dado>
          <Dado rotulo={a.ultimaCotacao ? `Cotação (${formatarData(a.ultimaCotacao.data).slice(0, 5)})` : 'Cotação'}>
            {p.cotacao != null ? formatarBRL(p.cotacao) : <span className="text-reservado-texto">sem cotação</span>}
          </Dado>
          <Dado rotulo="Valor atual">{formatarBRL(p.valorAtual)}</Dado>
          <Dado rotulo="Variação" cor={corSinal(p.variacao)}>
            {formatarBRLComSinal(p.variacao)}
            <span className="ml-1 text-xs">({formatarPercentual(p.variacaoPercentual)})</span>
          </Dado>
          <Dado rotulo="Retorno c/ dividendos" cor={corSinal(p.retornoTotal)}>{formatarBRLComSinal(p.retornoTotal)}</Dado>
        </Cartao>
      ) : (
        <Cartao className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3.5">
            <Dado rotulo="Aplicado (líquido)">{formatarBRL(p.investido)}</Dado>
            <Dado rotulo="Saldo bruto">{formatarBRL(p.valorAtual)}</Dado>
          </div>
          <div className="text-xs text-texto-2">O rendimento diário pelo CDI será calculado na Fase 3. Por enquanto o saldo é o valor aplicado.</div>
        </Cartao>
      )}

      {rv && a.ticker && <FormCotacao ticker={a.ticker} atual={a} aoSalvar={recarregar} />}

      {rv && (
        <Cartao className="flex flex-col gap-2.5">
          <div className="flex justify-between">
            <div className="text-sm font-bold">Dividendos recebidos</div>
            <div className="font-mono text-sm text-positivo">{formatarBRL(p.proventos)}</div>
          </div>
          {proventos.length === 0 && <div className="text-[13px] text-texto-2">Nenhum dividendo lançado.</div>}
          {proventos.map((m) => (
            <div key={m.id} className="flex justify-between text-[13px]">
              <div className="text-texto-2">
                {formatarData(m.data).slice(0, 5)}
                {m.preco_unitario ? ` · ${formatarBRL(m.preco_unitario)}/cota` : ''}
              </div>
              <div className="font-mono">{formatarBRL(m.valor_total)}</div>
            </div>
          ))}
        </Cartao>
      )}

      <Historico movs={a.movimentacoes} rv={rv} aoExcluir={recarregar} />
    </>
  )
}

function Dado({ rotulo, children, cor = '' }: { rotulo: string; children: ReactNode; cor?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-texto-2">{rotulo}</div>
      <div className={`font-mono text-base ${cor}`}>{children}</div>
    </div>
  )
}

function FormCotacao({ ticker, atual, aoSalvar }: { ticker: string; atual: AtivoComPosicao; aoSalvar: () => void }) {
  const [data, setData] = useState(hojeSP())
  const [preco, setPreco] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const v = lerNumero(preco)
    if (!(v > 0)) return setErro('Informe o preço de fechamento.')
    if (data > hojeSP()) return setErro('A data não pode ser no futuro.')
    setSalvando(true)
    try {
      await salvarCotacaoManual(ticker, data, v)
      setPreco('')
      aoSalvar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Cartao>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-bold">Atualizar cotação</div>
          {atual.ultimaCotacao && (
            <div className="text-xs text-texto-2">
              última: {formatarData(atual.ultimaCotacao.data)} · {atual.ultimaCotacao.fonte}
            </div>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-end gap-2">
          <Campo id="cot-data" rotulo="Data">
            <input id="cot-data" type="date" className="campo !px-2 !text-sm" max={hojeSP()} value={data} onChange={(e) => setData(e.target.value)} required />
          </Campo>
          <Campo id="cot-preco" rotulo="Fechamento">
            <input id="cot-preco" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </Campo>
          <button type="submit" disabled={salvando} className="h-[50px] rounded-[10px] bg-botao px-4 text-sm font-bold text-white disabled:opacity-60">
            {salvando ? '…' : 'Salvar'}
          </button>
        </div>
        {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
      </form>
    </Cartao>
  )
}

function Historico({ movs, rv, aoExcluir }: { movs: Movimentacao[]; rv: boolean; aoExcluir: () => void }) {
  const [erro, setErro] = useState<string | null>(null)
  const lista = [...movs].reverse()

  async function excluir(m: Movimentacao) {
    if (!confirm(`Excluir ${NOME_MOV[m.tipo].toLowerCase()} de ${formatarData(m.data)} (${formatarBRL(m.valor_total)})?`)) return
    setErro(null)
    try {
      await excluirMovimentacao(m.id)
      aoExcluir()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Cartao className="flex flex-col gap-2.5">
      <div className="text-sm font-bold">Lançamentos</div>
      {lista.length === 0 && <div className="text-[13px] text-texto-2">Nenhum lançamento ainda.</div>}
      {lista.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 text-[13px]">
          <div className="min-w-0">
            <span className="font-bold">{NOME_MOV[m.tipo]}</span>
            <span className="text-texto-2">
              {' · '}
              {formatarData(m.data)}
              {rv && m.quantidade ? ` · ${formatarNumero(m.quantidade)} × ${formatarBRL(m.preco_unitario ?? 0)}` : ''}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`font-mono ${m.tipo === 'resgate' ? 'text-negativo' : ''}`}>{formatarBRL(m.valor_total)}</span>
            <button type="button" onClick={() => excluir(m)} aria-label="Excluir lançamento" title="Excluir lançamento" className="rounded p-1 text-texto-2 hover:text-negativo">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
            </button>
          </div>
        </div>
      ))}
      {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
    </Cartao>
  )
}
