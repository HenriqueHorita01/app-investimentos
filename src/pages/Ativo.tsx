import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  alterarDestino,
  alterarFinalidade,
  atualizarAtivo,
  atualizarMovimentacao,
  carregarCarteira,
  criarMovimentacao,
  excluirAtivo,
  excluirMovimentacao,
  salvarCotacaoManual,
  simularPosicao,
  type AtivoComPosicao,
  type Carteira,
  type EdicaoAtivo,
  type EdicaoMovimentacao,
} from '../lib/dados'
import { ajustesParaSaldo, LIVRE } from '../lib/calculos'
import { formatarBRL, formatarBRLComSinal, formatarData, formatarNumero, formatarPercentual, hojeSP, lerNumero } from '../lib/formato'
import { corObjetivo } from '../lib/objetivos'
import { ehRendaVariavel, NOME_TIPO, rotuloAtivo, type Movimentacao, type Objetivo, type TipoAtivo } from '../lib/tipos'
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
  const navegar = useNavigate()
  const { dados, erro, carregando, recarregar } = useCarregar(carregarCarteira, [id])
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [editandoAtivo, setEditandoAtivo] = useState(false)
  const a = dados?.ativos.find((x) => x.id === id)
  const ehReserva = a?.finalidade === 'reserva_emergencia'

  const voltar = (
    <Link to={ehReserva ? '/reserva' : '/carteira'} className="-mb-1 flex min-h-8 items-center gap-1 text-sm text-positivo">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      {ehReserva ? 'Reserva' : 'Carteira'}
    </Link>
  )

  if (carregando && !dados) return <>{voltar}<Carregando /></>
  if (erro || !dados) return <>{voltar}<Erro mensagem={erro ?? 'Erro ao carregar.'} tentar={recarregar} /></>
  if (!a) return <>{voltar}<Erro mensagem="Ativo não encontrado." /></>

  const rv = ehRendaVariavel(a.tipo)
  const p = a.posicao
  const proventos = a.movimentacoes.filter((m) => m.tipo === 'dividendo' || m.tipo === 'jcp').reverse()
  const temReservado = Object.keys(p.porDestino).some((d) => d !== LIVRE)

  async function acao(fn: () => Promise<void>) {
    setErroAcao(null)
    try {
      await fn()
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : String(e))
    }
  }

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
          {ehReserva && <div className="mt-1 inline-block rounded bg-linha px-1.5 text-[11px] text-texto-2">Reserva de emergência · fora do patrimônio</div>}
        </div>
        <div className="flex shrink-0 gap-2">
          {!editandoAtivo && (
            <button type="button" onClick={() => setEditandoAtivo(true)} className="rounded-full border border-campo bg-cartao px-3.5 py-2 text-[13px] font-bold">
              Editar
            </button>
          )}
          <Link to={`/lancar?ativo=${a.id}`} className="rounded-full bg-botao px-3.5 py-2 text-[13px] font-bold text-white">
            + Lançar
          </Link>
        </div>
      </div>

      {editandoAtivo && (
        <EditarAtivo
          a={a}
          aoCancelar={() => setEditandoAtivo(false)}
          aoSalvar={() => {
            setEditandoAtivo(false)
            recarregar()
          }}
        />
      )}

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
            <Dado rotulo="Aplicado">{formatarBRL(p.investido)}</Dado>
            <Dado rotulo="Saldo bruto">{formatarBRL(p.valorAtual)}</Dado>
            {!p.semRendimento && (
              <Dado rotulo="Rendimento bruto" cor={corSinal(p.variacao)}>
                {formatarBRLComSinal(p.variacao)}
                <span className="ml-1 text-xs">({formatarPercentual(p.variacaoPercentual)})</span>
              </Dado>
            )}
          </div>
          <div className="text-xs text-texto-2">
            {p.semRendimento
              ? 'Cálculo automático só para CDB atrelado ao CDI. Por enquanto o saldo é o valor aplicado.'
              : `Estimativa pelo CDI diário do Banco Central${dados.cdiAte ? `, atualizado até ${formatarData(dados.cdiAte)}` : ''}. Sem IR; o extrato do banco é a referência final.`}
          </div>
        </Cartao>
      )}

      {!rv && a.movimentacoes.length > 0 && <FormCorrigirSaldo a={a} carteira={dados} aoSalvar={recarregar} />}

      {!ehReserva && p.valorAtual > 0.005 && <UsoDoAtivo a={a} objetivos={dados.objetivos} />}

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

      <Historico a={a} carteira={dados} aoMudar={recarregar} />

      <div className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-[13px] font-bold">
        <button
          type="button"
          className="text-texto-2"
          onClick={() => {
            if (!ehReserva && temReservado) {
              setErroAcao('Este ativo tem dinheiro reservado para objetivos. Troque o destino desses lançamentos para "Livre" antes de movê-lo para a reserva.')
              return
            }
            acao(async () => {
              await alterarFinalidade(a.id, ehReserva ? 'investimento' : 'reserva_emergencia')
              recarregar()
            })
          }}
        >
          {ehReserva ? 'Mover para a Carteira' : 'Mover para a Reserva de emergência'}
        </button>
        <button
          type="button"
          className="text-negativo"
          onClick={() => {
            const n = a.movimentacoes.length
            if (!confirm(`Excluir ${rotuloAtivo(a)}${n ? ` e seus ${n} lançamento(s)` : ''}? Não dá para desfazer.`)) return
            acao(async () => {
              await excluirAtivo(a.id)
              navegar(ehReserva ? '/reserva' : '/carteira', { replace: true })
            })
          }}
        >
          Excluir ativo
        </button>
      </div>
      {erroAcao && <div role="alert" className="px-1 text-sm text-negativo">{erroAcao}</div>}
    </>
  )
}

function EditarAtivo({ a, aoSalvar, aoCancelar }: { a: AtivoComPosicao; aoSalvar: () => void; aoCancelar: () => void }) {
  const rv = ehRendaVariavel(a.tipo)
  const [tipo, setTipo] = useState<TipoAtivo>(a.tipo)
  const [ticker, setTicker] = useState(a.ticker ?? '')
  // Na renda variável, nome igual ao ticker = sem nome próprio (campo vazio).
  const [nome, setNome] = useState(rv && a.nome === a.ticker ? '' : a.nome)
  const [instituicao, setInstituicao] = useState(a.instituicao ?? '')
  const [taxa, setTaxa] = useState(a.taxa != null ? String(a.taxa).replace('.', ',') : '')
  const [vencimento, setVencimento] = useState(a.vencimento ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const tk = ticker.trim().toUpperCase()
  const mudouTicker = rv && tk !== (a.ticker ?? '')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    let campos: EdicaoAtivo
    if (rv) {
      if (!/^[A-Z]{4}\d{1,2}[A-Z]?$/.test(tk)) return setErro('Ticker inválido. Ex.: HGLG11, PETR4.')
      campos = { tipo, ticker: tk, nome: nome.trim() || tk, instituicao: instituicao.trim() || null }
    } else {
      const taxaN = lerNumero(taxa)
      if (!nome.trim()) return setErro('Informe um nome.')
      if (!(taxaN > 0)) return setErro('Informe a taxa (% do CDI). Ex.: 115.')
      campos = { nome: nome.trim(), taxa: taxaN, vencimento: vencimento || null, instituicao: instituicao.trim() || null }
    }
    setSalvando(true)
    try {
      await atualizarAtivo(a.id, campos)
      aoSalvar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setSalvando(false)
    }
  }

  return (
    <Cartao>
      <form onSubmit={salvar} className="flex flex-col gap-3.5">
        <div className="text-sm font-bold">Editar ativo</div>
        {rv ? (
          <>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-segmento p-1" role="tablist" aria-label="Tipo de ativo">
              {(['fii', 'acao'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tipo === t}
                  onClick={() => setTipo(t)}
                  className={`rounded-[9px] py-2 text-sm ${tipo === t ? 'bg-segmento-ativo font-bold shadow-sm' : 'text-texto-2'}`}
                >
                  {NOME_TIPO[t]}
                </button>
              ))}
            </div>
            <Campo id="ea-ticker" rotulo="Ticker">
              <input id="ea-ticker" className="campo font-mono uppercase" value={ticker} onChange={(e) => setTicker(e.target.value)} />
            </Campo>
            {mudouTicker && (
              <div className="text-xs text-reservado-texto">
                As cotações são guardadas por ticker: com o ticker novo, informe a cotação de novo.
              </div>
            )}
            <Campo id="ea-nome" rotulo="Nome (opcional)">
              <input id="ea-nome" className="campo" value={nome} placeholder={tk} onChange={(e) => setNome(e.target.value)} />
            </Campo>
          </>
        ) : (
          <>
            <Campo id="ea-nome" rotulo="Nome">
              <input id="ea-nome" className="campo" value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo id="ea-taxa" rotulo="Taxa (% do CDI)">
                <input id="ea-taxa" className="campo font-mono" inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value)} />
              </Campo>
              <Campo id="ea-venc" rotulo="Vencimento">
                <input id="ea-venc" type="date" className="campo !px-2 !text-sm" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
              </Campo>
            </div>
            <div className="text-xs text-texto-2">Mudar a taxa recalcula todo o rendimento desde a primeira aplicação.</div>
          </>
        )}
        <Campo id="ea-inst" rotulo="Instituição / corretora (opcional)">
          <input id="ea-inst" className="campo" value={instituicao} onChange={(e) => setInstituicao(e.target.value)} />
        </Campo>
        {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
        <div className="flex gap-2">
          <button type="submit" disabled={salvando} className="flex-1 rounded-xl bg-botao p-3 text-sm font-bold text-white disabled:opacity-60">
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
          <button type="button" onClick={aoCancelar} className="rounded-xl border border-campo px-4 text-sm">
            Cancelar
          </button>
        </div>
      </form>
    </Cartao>
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

function UsoDoAtivo({ a, objetivos }: { a: AtivoComPosicao; objetivos: Objetivo[] }) {
  const p = a.posicao
  const total = p.valorAtual
  const partes = Object.entries(p.porDestino)
    .map(([d, parcela]) => {
      const o = objetivos.find((x) => x.id === d)
      return { chave: d, nome: d === LIVRE ? 'Livre' : (o?.nome ?? 'Objetivo'), cor: d === LIVRE ? 'var(--positivo)' : o ? corObjetivo(o) : 'var(--reservado)', valor: parcela.valorAtual }
    })
    .sort((x, y) => (x.chave === LIVRE ? 1 : y.chave === LIVRE ? -1 : y.valor - x.valor))

  return (
    <Cartao className="flex flex-col gap-2.5">
      <div className="text-sm font-bold">Uso deste ativo</div>
      <div className="flex h-2.5 overflow-hidden rounded-[5px] bg-linha">
        {partes.map((x) => (
          <div key={x.chave} style={{ width: `${Math.max(0, (x.valor / total) * 100)}%`, background: x.cor }} />
        ))}
      </div>
      {partes.map((x) => (
        <div key={x.chave} className="flex justify-between text-[13px]">
          <span className="font-bold" style={{ color: x.chave === LIVRE ? 'var(--positivo)' : x.cor }}>{x.nome}</span>
          <span className="font-mono">{formatarBRL(x.valor)}</span>
        </div>
      ))}
      <Link to={`/lancar?ativo=${a.id}`} className="mt-1 rounded-xl border border-campo p-3 text-center text-sm font-bold">
        Reservar para objetivo
      </Link>
      <div className="text-xs text-texto-2">Para reservar o que já tem, troque o destino de um aporte na lista de lançamentos abaixo.</div>
    </Cartao>
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

function FormCorrigirSaldo({ a, carteira, aoSalvar }: { a: AtivoComPosicao; carteira: Carteira; aoSalvar: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [data, setData] = useState(hojeSP())
  const [saldo, setSaldo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    const v = lerNumero(saldo)
    if (!(v >= 0)) return setErro('Informe o saldo bruto do extrato.')
    if (data > hojeSP()) return setErro('A data não pode ser no futuro.')
    const { calculado, ajustes } = ajustesParaSaldo(a, a.movimentacoes, carteira.cdi, data, v)
    if (!ajustes.length) {
      setAviso(`O saldo calculado já é ${formatarBRL(calculado)}. Nada a corrigir.`)
      return
    }
    setSalvando(true)
    try {
      await criarMovimentacao(
        ajustes.map((x) => ({
          ativo_id: a.id,
          data,
          tipo: 'ajuste' as const,
          quantidade: null,
          preco_unitario: null,
          valor_total: x.valor,
          observacao: `Correção pelo extrato (calculado ${formatarBRL(calculado)}, extrato ${formatarBRL(v)})`,
          objetivo_id: x.objetivo_id,
        })),
      )
      setSaldo('')
      setAberto(false)
      aoSalvar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="rounded-[14px] border border-campo bg-cartao p-3 text-sm font-bold">
        Corrigir saldo pelo extrato
      </button>
    )
  }

  return (
    <Cartao>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <div className="text-sm font-bold">Corrigir saldo pelo extrato</div>
        <div className="text-xs text-texto-2">
          Digite o saldo bruto que aparece no banco. O app grava a diferença como ajuste de rendimento e continua calculando pelo CDI a partir dele.
        </div>
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2">
          <Campo id="aj-data" rotulo="Data do extrato">
            <input id="aj-data" type="date" className="campo !px-2 !text-sm" max={hojeSP()} value={data} onChange={(e) => setData(e.target.value)} required />
          </Campo>
          <Campo id="aj-saldo" rotulo="Saldo bruto">
            <input id="aj-saldo" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
          </Campo>
        </div>
        {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
        {aviso && <div className="text-sm text-texto-2">{aviso}</div>}
        <div className="flex gap-2">
          <button type="submit" disabled={salvando} className="flex-1 rounded-xl bg-botao p-3 text-sm font-bold text-white disabled:opacity-60">
            {salvando ? 'Salvando…' : 'Corrigir saldo'}
          </button>
          <button type="button" onClick={() => setAberto(false)} className="rounded-xl border border-campo px-4 text-sm">
            Cancelar
          </button>
        </div>
      </form>
    </Cartao>
  )
}

function Historico({ a, carteira, aoMudar }: { a: AtivoComPosicao; carteira: Carteira; aoMudar: () => void }) {
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const rv = ehRendaVariavel(a.tipo)
  const lista = [...a.movimentacoes].reverse()
  const podeTrocarDestino = a.finalidade === 'investimento'
  const objetivos = carteira.objetivos

  async function excluir(m: Movimentacao) {
    if (!confirm(`Excluir ${NOME_MOV[m.tipo].toLowerCase()} de ${formatarData(m.data)} (${formatarBRL(m.valor_total)})?`)) return
    const simulada = simularPosicao(a, a.movimentacoes.filter((x) => x.id !== m.id), carteira.cdi)
    if (simulada.inconsistente) {
      setErro('Excluir este aporte deixaria um resgate sem saldo. Exclua o resgate antes.')
      return
    }
    setErro(null)
    try {
      await excluirMovimentacao(m.id)
      aoMudar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    }
  }

  async function trocarDestino(m: Movimentacao, novo: string) {
    const objetivoId = novo || null
    const simulada = simularPosicao(
      a,
      a.movimentacoes.map((x) => (x.id === m.id ? { ...x, objetivo_id: objetivoId } : x)),
      carteira.cdi,
    )
    if (simulada.inconsistente) {
      setErro('Não dá para trocar: algum resgate ficaria maior do que o saldo do destino. Ajuste o resgate também.')
      return
    }
    setErro(null)
    try {
      await alterarDestino(m.id, objetivoId)
      aoMudar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Cartao className="flex flex-col gap-3">
      <div className="text-sm font-bold">Lançamentos</div>
      {lista.length === 0 && <div className="text-[13px] text-texto-2">Nenhum lançamento ainda.</div>}
      {lista.map((m) => {
        const comDestino = podeTrocarDestino && (m.tipo === 'aporte' || m.tipo === 'resgate' || (!rv && m.tipo === 'ajuste'))
        const nome = !rv && m.tipo === 'ajuste' ? 'Ajuste de saldo' : NOME_MOV[m.tipo]
        const opcoes = objetivos.filter((o) => !o.concluido || o.id === m.objetivo_id)

        if (editando === m.id) {
          return (
            <div key={m.id} className="border-b border-linha pb-2.5 last:border-0 last:pb-0">
              <EditarLancamento
                a={a}
                m={m}
                nome={nome}
                carteira={carteira}
                aoCancelar={() => setEditando(null)}
                aoSalvar={() => {
                  setEditando(null)
                  aoMudar()
                }}
              />
            </div>
          )
        }

        return (
          <div key={m.id} className="flex flex-col gap-1.5 border-b border-linha pb-2.5 last:border-0 last:pb-0">
            <button
              type="button"
              onClick={() => {
                setErro(null)
                setEditando(m.id)
              }}
              aria-label={`Editar ${nome.toLowerCase()} de ${formatarData(m.data)}`}
              className="flex items-center justify-between gap-2 text-left text-[13px]"
            >
              <div className="min-w-0">
                <span className="font-bold">{nome}</span>
                <span className="text-texto-2">
                  {' · '}
                  {formatarData(m.data)}
                  {rv && m.quantidade ? ` · ${formatarNumero(m.quantidade)} × ${formatarBRL(m.preco_unitario ?? 0)}` : ''}
                </span>
              </div>
              <span className={`shrink-0 font-mono ${m.tipo === 'resgate' || m.valor_total < 0 ? 'text-negativo' : ''}`}>
                {m.tipo === 'ajuste' ? formatarBRLComSinal(m.valor_total) : formatarBRL(m.valor_total)}
              </span>
            </button>
            {m.observacao && <div className="text-xs text-texto-2">{m.observacao}</div>}
            {comDestino && (opcoes.length > 0 || m.objetivo_id) && (
              <label className="flex items-center gap-2 text-xs text-texto-2">
                Destino
                <select
                  className="min-w-0 flex-1 rounded-lg border border-campo bg-cartao px-2 py-1.5 text-xs text-texto"
                  value={m.objetivo_id ?? ''}
                  onChange={(e) => trocarDestino(m, e.target.value)}
                  aria-label={`Destino do ${NOME_MOV[m.tipo].toLowerCase()} de ${formatarData(m.data)}`}
                >
                  <option value="">Livre (patrimônio)</option>
                  {opcoes.map((o) => (
                    <option key={o.id} value={o.id}>{o.nome}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setErro(null)
                  setEditando(m.id)
                }}
                className="flex items-center gap-1.5 rounded-lg border border-campo px-3 py-1.5 text-xs font-bold"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
                Editar
              </button>
              <button type="button" onClick={() => excluir(m)} className="flex items-center gap-1.5 rounded-lg border border-campo px-3 py-1.5 text-xs font-bold text-negativo">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                Excluir
              </button>
            </div>
          </div>
        )
      })}
      {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
    </Cartao>
  )
}

function EditarLancamento({
  a,
  m,
  nome,
  carteira,
  aoSalvar,
  aoCancelar,
}: {
  a: AtivoComPosicao
  m: Movimentacao
  nome: string
  carteira: Carteira
  aoSalvar: () => void
  aoCancelar: () => void
}) {
  const rv = ehRendaVariavel(a.tipo)
  // Renda variável com cotas: quantidade × preço. Demais: só valor.
  const porCota = rv && (m.tipo === 'aporte' || m.tipo === 'resgate' || m.tipo === 'dividendo')
  const ajusteCotas = rv && m.tipo === 'ajuste'
  const permiteNegativo = m.tipo === 'ajuste'
  const br = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))

  const [data, setData] = useState(m.data)
  const [qtd, setQtd] = useState(br(m.quantidade))
  const [preco, setPreco] = useState(br(m.preco_unitario))
  const [valor, setValor] = useState(br(m.valor_total))
  const [obs, setObs] = useState(m.observacao ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const qtdN = lerNumero(qtd)
  const precoN = lerNumero(preco)
  const total = porCota
    ? qtdN > 0 && precoN > 0
      ? Math.round(qtdN * precoN * 100) / 100
      : 0
    : Math.round(lerNumero(valor) * 100) / 100

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!data) return setErro('Informe a data.')
    if (data > hojeSP()) return setErro('A data não pode ser no futuro.')
    let campos: EdicaoMovimentacao
    if (porCota) {
      if (!(qtdN > 0)) return setErro('Informe a quantidade de cotas.')
      if (!(precoN > 0)) return setErro(m.tipo === 'dividendo' ? 'Informe o valor por cota.' : 'Informe o preço por cota.')
      campos = { data, quantidade: qtdN, preco_unitario: precoN, valor_total: total }
    } else if (ajusteCotas) {
      if (!Number.isFinite(qtdN) || qtdN === 0) return setErro('Informe a quantidade (use negativo para reduzir).')
      campos = { data, quantidade: qtdN }
    } else {
      if (!Number.isFinite(total) || total === 0 || (!permiteNegativo && total < 0)) {
        return setErro(permiteNegativo ? 'Informe o valor (use negativo para reduzir o saldo).' : 'Informe o valor.')
      }
      campos = { data, valor_total: total }
    }
    campos.observacao = obs.trim() || null

    const simulada = simularPosicao(
      a,
      a.movimentacoes.map((x) => (x.id === m.id ? { ...x, ...campos } : x)),
      carteira.cdi,
    )
    if (simulada.inconsistente) {
      return setErro('Com esses valores algum resgate ficaria maior do que o saldo disponível. Confira as quantidades e datas.')
    }

    setSalvando(true)
    try {
      await atualizarMovimentacao(m.id, campos)
      aoSalvar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 rounded-xl bg-fundo p-3">
      <div className="text-[13px] font-bold">Editar {nome.toLowerCase()}</div>
      <Campo id={`ed-data-${m.id}`} rotulo="Data">
        <input id={`ed-data-${m.id}`} type="date" className="campo" max={hojeSP()} value={data} onChange={(e) => setData(e.target.value)} required />
      </Campo>
      {porCota ? (
        <div className="grid grid-cols-2 gap-2">
          <Campo id={`ed-qtd-${m.id}`} rotulo={m.tipo === 'dividendo' ? 'Cotas na data-com' : 'Quantidade (cotas)'}>
            <input id={`ed-qtd-${m.id}`} className="campo font-mono" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </Campo>
          <Campo id={`ed-preco-${m.id}`} rotulo={m.tipo === 'dividendo' ? 'Valor por cota' : 'Preço por cota'}>
            <input id={`ed-preco-${m.id}`} className="campo font-mono" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
          </Campo>
        </div>
      ) : ajusteCotas ? (
        <Campo id={`ed-qtd-${m.id}`} rotulo="Quantidade (negativo para reduzir)">
          <input id={`ed-qtd-${m.id}`} className="campo font-mono" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} />
        </Campo>
      ) : (
        <Campo id={`ed-valor-${m.id}`} rotulo={permiteNegativo ? 'Valor (negativo para reduzir o saldo)' : 'Valor'}>
          <input id={`ed-valor-${m.id}`} className="campo font-mono" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
      )}
      <Campo id={`ed-obs-${m.id}`} rotulo="Observação (opcional)">
        <input id={`ed-obs-${m.id}`} className="campo" value={obs} onChange={(e) => setObs(e.target.value)} />
      </Campo>
      {porCota && (
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-texto-2">Total</span>
          <span className="font-mono text-base">{formatarBRL(total)}</span>
        </div>
      )}
      {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
      <div className="flex gap-2">
        <button type="submit" disabled={salvando} className="flex-1 rounded-xl bg-botao p-3 text-sm font-bold text-white disabled:opacity-60">
          {salvando ? 'Salvando…' : 'Salvar alterações'}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-xl border border-campo px-4 text-sm">
          Cancelar
        </button>
      </div>
    </form>
  )
}
