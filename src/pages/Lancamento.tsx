import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { carregarCarteira, cdiDesde, criarMovimentacao, salvarCotacaoManual, type NovaMovimentacao } from '../lib/dados'
import { ajusteAplicacaoAntiga, disponivel, LIVRE } from '../lib/calculos'
import { formatarBRL, formatarBRLComSinal, formatarNumero, formatarPercentual, hojeSP, lerNumero } from '../lib/formato'
import { ehRendaVariavel, NOME_TIPO, OBS_PROVENTOS_ANTERIORES, rotuloAtivo } from '../lib/tipos'
import { useCarregar } from '../lib/useCarregar'
import { Campo, Cartao, Carregando, Erro, Titulo } from '../components/ui'

type Aba = 'aporte' | 'resgate' | 'dividendo'
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'aporte', rotulo: 'Aporte' },
  { id: 'resgate', rotulo: 'Resgate' },
  { id: 'dividendo', rotulo: 'Dividendo' },
]

const arred2 = (v: number) => Math.round(v * 100) / 100

export default function Lancamento() {
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const { dados, erro: erroCarga, carregando, recarregar } = useCarregar(carregarCarteira)

  const [aba, setAba] = useState<Aba>('aporte')
  const [ativoId, setAtivoId] = useState(params.get('ativo') ?? '')
  /** '' = livre; senão, id do objetivo. */
  const [destino, setDestino] = useState(params.get('objetivo') ?? '')
  const [data, setData] = useState(hojeSP())
  const [qtd, setQtd] = useState(params.get('qtd') ?? '')  // pode vir do simulador
  const [preco, setPreco] = useState(params.get('preco') ?? '')  // pode vir do simulador
  const [valor, setValor] = useState(params.get('valor') ?? '')  // pode vir do simulador
  /** Renda fixa: aplicação feita antes de usar o app, que já tem rendimento. */
  const [antiga, setAntiga] = useState(false)
  const [saldoAtual, setSaldoAtual] = useState('')
  /** Renda variável: posição antiga — cotação de hoje e dividendos já recebidos. */
  const [cotacaoAtual, setCotacaoAtual] = useState('')
  const [dividendosAnteriores, setDividendosAnteriores] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const ativos = dados?.ativos ?? []
  const ativo = ativos.find((a) => a.id === ativoId)
  const rv = ativo ? ehRendaVariavel(ativo.tipo) : true
  const reservaId = dados?.reserva.id ?? ''
  const usaDestino = !!ativo && aba !== 'dividendo'
  const objetivos = (dados?.objetivos ?? []).filter((o) => !o.concluido || o.id === destino)
  const chaveDestino = usaDestino && destino ? destino : LIVRE
  const nomeDoDestino = (id: string) => (id === reservaId ? 'Reserva de emergência' : (objetivos.find((o) => o.id === id)?.nome ?? 'objetivo'))

  // ?objetivo=reserva (vindo do cadastro de aplicação da reserva) vira o id real da reserva.
  useEffect(() => {
    if (destino === 'reserva' && reservaId) setDestino(reservaId)
  }, [destino, reservaId])

  // Seleciona o primeiro ativo quando não veio nenhum na URL.
  useEffect(() => {
    if (!ativoId && ativos.length) setAtivoId(ativos[0].id)
  }, [ativos, ativoId])

  // Dividendo: sugere a quantidade de cotas atual.
  useEffect(() => {
    if (aba === 'dividendo' && ativo && rv && !qtd) setQtd(String(ativo.posicao.quantidade).replace('.', ','))
  }, [aba, ativo, rv, qtd])

  const qtdN = lerNumero(qtd)
  // Posição antiga de ação/FII: o usuário informa totais (investido e valor atual) e o app
  // deriva preço médio e cotação por cota.
  const posicaoAntiga = rv && aba === 'aporte' && antiga
  const investidoTotalN = posicaoAntiga ? lerNumero(preco) : NaN
  const precoN = posicaoAntiga ? (qtdN > 0 && investidoTotalN > 0 ? investidoTotalN / qtdN : NaN) : lerNumero(preco)
  const total = posicaoAntiga
    ? investidoTotalN > 0 ? arred2(investidoTotalN) : 0
    : rv ? (qtdN > 0 && precoN > 0 ? arred2(qtdN * precoN) : 0) : lerNumero(valor) > 0 ? arred2(lerNumero(valor)) : 0
  const disp = ativo ? disponivel(ativo.posicao, rv, chaveDestino) : 0
  const comRendimentoAnterior = !rv && aba === 'aporte' && antiga
  const saldoN = lerNumero(saldoAtual)
  const rendimentoAnterior = comRendimentoAnterior && saldoN > 0 && total > 0 ? arred2(saldoN - total) : 0
  const valorAtualTotalN = lerNumero(cotacaoAtual)
  const cotacaoN = posicaoAntiga && qtdN > 0 && valorAtualTotalN > 0 ? valorAtualTotalN / qtdN : NaN
  const dividendosN = lerNumero(dividendosAnteriores)
  const valorAtualAntiga = posicaoAntiga && valorAtualTotalN > 0 ? arred2(valorAtualTotalN) : 0
  const nomeDestino = chaveDestino === LIVRE ? 'livre' : `em "${nomeDoDestino(destino)}"`

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!ativo) return setErro('Escolha um ativo.')
    if (!data) return setErro('Informe a data.')
    if (data > hojeSP()) return setErro('A data não pode ser no futuro.')
    if (aba === 'dividendo' && !rv) return setErro('Dividendo só se aplica a FIIs e ações.')

    if (rv) {
      if (!(qtdN > 0)) return setErro('Informe a quantidade de cotas.')
      if (!(precoN > 0)) return setErro(aba === 'dividendo' ? 'Informe o valor por cota.' : posicaoAntiga ? 'Informe o valor total investido.' : 'Informe o preço por cota.')
      if (posicaoAntiga && cotacaoAtual.trim() && !(cotacaoN > 0)) return setErro('Valor atual total inválido.')
      if (posicaoAntiga && dividendosAnteriores.trim() && !(dividendosN >= 0)) return setErro('Valor de dividendos inválido.')
      if (aba === 'resgate' && qtdN > disp + 1e-9) {
        return setErro(`Você tem ${formatarNumero(disp)} cotas ${nomeDestino}; não dá para resgatar ${formatarNumero(qtdN)}.`)
      }
    } else {
      if (!(total > 0)) return setErro('Informe o valor.')
      if (comRendimentoAnterior && !(saldoN > 0)) return setErro('Informe o saldo bruto atual (o que aparece no banco).')
      if (aba === 'resgate' && total > disp + 0.005) {
        return setErro(`O saldo ${nomeDestino} é ${formatarBRL(disp)}; o resgate não pode passar disso.`)
      }
    }

    setSalvando(true)
    try {
      const objetivo_id = usaDestino && destino ? destino : null
      const principal = {
        ativo_id: ativo.id,
        data,
        tipo: aba,
        quantidade: rv ? qtdN : null,
        preco_unitario: rv ? precoN : null,
        valor_total: total,
        observacao: null,
        objetivo_id,
      }
      const lista: NovaMovimentacao[] = [principal]
      // Renda fixa antiga: aporte na data da aplicação + ajuste HOJE com a diferença entre o
      // saldo informado e o que o CDI já explica (não conta o rendimento duas vezes).
      if (comRendimentoAnterior) {
        const aj = ajusteAplicacaoAntiga(ativo, data, total, saldoN, await cdiDesde(data), hojeSP())
        if (aj.valor !== 0) {
          lista.push({ ...principal, data: aj.data, tipo: 'ajuste', valor_total: aj.valor, observacao: 'Rendimento anterior ao cadastro' })
        }
      }
      // Ação/FII antigo: aporte pelo preço médio + dividendos já recebidos.
      if (posicaoAntiga) {
        // Preço médio com 6 casas (limite da coluna) para o custo bater com o total investido.
        lista[0] = { ...principal, preco_unitario: Math.round(precoN * 1e6) / 1e6, observacao: 'Posição anterior ao cadastro' }
        if (dividendosN > 0) {
          lista.push({ ...principal, tipo: 'dividendo', quantidade: null, preco_unitario: null, valor_total: arred2(dividendosN), observacao: OBS_PROVENTOS_ANTERIORES, objetivo_id: null })
        }
      }
      await criarMovimentacao(lista)
      if (posicaoAntiga && cotacaoN > 0 && ativo.ticker) await salvarCotacaoManual(ativo.ticker, data, Math.round(cotacaoN * 1e6) / 1e6)
      navegar(`/ativo/${ativo.id}`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setSalvando(false)
    }
  }

  if (carregando && !dados) return <><Titulo>Novo lançamento</Titulo><Carregando /></>
  if (erroCarga) return <><Titulo>Novo lançamento</Titulo><Erro mensagem={erroCarga} tentar={recarregar} /></>

  if (!ativos.length) {
    return (
      <>
        <Titulo>Novo lançamento</Titulo>
        <Cartao className="flex flex-col gap-3">
          <div className="text-sm">Cadastre um ativo antes de lançar.</div>
          <Link to="/ativos/novo?voltar=/lancar" className="self-start rounded-xl bg-botao px-4 py-3 text-sm font-bold text-white">
            Cadastrar ativo
          </Link>
        </Cartao>
      </>
    )
  }

  const rotuloQtd = aba === 'dividendo' ? 'Cotas na data-com' : 'Quantidade (cotas)'
  const rotuloPreco = aba === 'dividendo' ? 'Valor por cota' : 'Preço por cota'
  const opcao = (a: (typeof ativos)[number]) => (
    <option key={a.id} value={a.id}>
      {rotuloAtivo(a)} — {ehRendaVariavel(a.tipo) ? NOME_TIPO[a.tipo] : 'Renda fixa'}
    </option>
  )

  return (
    <>
      <Titulo>Novo lançamento</Titulo>

      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-segmento p-1" role="tablist" aria-label="Tipo de lançamento">
          {ABAS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={aba === t.id}
              onClick={() => {
                setAba(t.id)
                setErro(null)
                if (t.id === 'dividendo' || aba === 'dividendo') {
                  setQtd('')
                  setPreco('')
                }
              }}
              className={`rounded-[9px] py-2.5 text-sm ${aba === t.id ? 'bg-segmento-ativo font-bold shadow-sm' : 'text-texto-2'}`}
            >
              {t.rotulo}
            </button>
          ))}
        </div>

        <Cartao className="flex flex-col gap-3.5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="ativo" className="rotulo">Ativo</label>
              <Link to="/ativos/novo?voltar=/lancar" className="text-xs text-positivo">+ Novo ativo</Link>
            </div>
            <select id="ativo" className="campo" value={ativoId} onChange={(e) => { setAtivoId(e.target.value); setQtd(''); setErro(null) }}>
              {ativos.map(opcao)}
            </select>
          </div>

          <Campo id="data" rotulo={comRendimentoAnterior ? 'Data da aplicação' : posicaoAntiga ? 'Data de hoje (ou do extrato)' : 'Data'}>
            <input id="data" type="date" className="campo" max={hojeSP()} value={data} onChange={(e) => setData(e.target.value)} required />
          </Campo>

          {aba === 'dividendo' && !rv ? (
            <div className="text-sm text-texto-2">Renda fixa não paga dividendo. Escolha um FII ou ação.</div>
          ) : rv ? (
            <>
              {aba === 'aporte' && (
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--positivo)]" checked={antiga} onChange={(e) => setAntiga(e.target.checked)} />
                  <span>
                    <b>Posição antiga (já tinha antes)</b>
                    <span className="block text-xs text-texto-2">Para registrar cotas que você já tinha, com o total investido e quanto vale hoje.</span>
                  </span>
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Campo id="qtd" rotulo={rotuloQtd}>
                  <input id="qtd" className="campo font-mono" inputMode="decimal" placeholder="0" value={qtd} onChange={(e) => setQtd(e.target.value)} />
                </Campo>
                <Campo id="preco" rotulo={posicaoAntiga ? 'Total investido' : rotuloPreco}>
                  <input id="preco" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={preco} onChange={(e) => setPreco(e.target.value)} />
                </Campo>
              </div>
              {posicaoAntiga && (
                <div className="grid grid-cols-2 gap-3">
                  <Campo id="cot-atual" rotulo="Valor atual total (opcional)">
                    <input id="cot-atual" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={cotacaoAtual} onChange={(e) => setCotacaoAtual(e.target.value)} />
                  </Campo>
                  <Campo id="div-ant" rotulo="Dividendos já recebidos (opcional)">
                    <input id="div-ant" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={dividendosAnteriores} onChange={(e) => setDividendosAnteriores(e.target.value)} />
                  </Campo>
                </div>
              )}
              {posicaoAntiga && total > 0 && qtdN > 0 && (
                <div className="flex flex-col gap-0.5 text-xs text-texto-2">
                  <span>Preço médio: {formatarBRL(precoN)} por cota</span>
                  {valorAtualAntiga > 0 && (
                    <span>
                      Cotação: {formatarBRL(cotacaoN)} por cota · valorização{' '}
                      <span className={valorAtualAntiga - total >= 0 ? 'text-positivo' : 'text-negativo'}>
                        {formatarBRLComSinal(valorAtualAntiga - total)} ({formatarPercentual((valorAtualAntiga - total) / total)})
                      </span>
                    </span>
                  )}
                  {dividendosN > 0 && <span>Dividendos já recebidos: <span className="text-positivo">{formatarBRL(dividendosN)}</span> (somam no patrimônio livre)</span>}
                </div>
              )}
            </>
          ) : (
            <>
              {aba === 'aporte' && (
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--positivo)]" checked={antiga} onChange={(e) => setAntiga(e.target.checked)} />
                  <span>
                    <b>Aplicação antiga (já rendeu)</b>
                    <span className="block text-xs text-texto-2">Para registrar um dinheiro que já estava aplicado, com o saldo de hoje.</span>
                  </span>
                </label>
              )}
              <Campo id="valor" rotulo={aba === 'aporte' ? (antiga ? 'Valor que você aplicou' : 'Valor aplicado') : 'Valor resgatado'}>
                <input id="valor" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
              </Campo>
              {comRendimentoAnterior && (
                <Campo id="saldo" rotulo="Saldo bruto hoje (no banco)">
                  <input id="saldo" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={saldoAtual} onChange={(e) => setSaldoAtual(e.target.value)} />
                </Campo>
              )}
              {comRendimentoAnterior && rendimentoAnterior !== 0 && (
                <div className="text-xs text-texto-2">
                  Rendimento até hoje: <span className={rendimentoAnterior > 0 ? 'text-positivo' : 'text-negativo'}>{formatarBRL(rendimentoAnterior)}</span>. A
                  partir de hoje o app calcula pelo CDI.
                </div>
              )}
            </>
          )}

          <div className="flex items-baseline justify-between border-t border-linha pt-3">
            <div className="text-[13px] text-texto-2">{comRendimentoAnterior ? 'Saldo registrado' : posicaoAntiga && valorAtualAntiga > 0 ? 'Valor atual' : 'Total'}</div>
            <div className="font-mono text-xl">{formatarBRL(comRendimentoAnterior && saldoN > 0 ? saldoN : posicaoAntiga && valorAtualAntiga > 0 ? valorAtualAntiga : total)}</div>
          </div>
        </Cartao>

        {usaDestino && (
          <Cartao className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="obj" className="rotulo">{aba === 'aporte' ? 'Destino do dinheiro' : 'Resgatar de'}</label>
              <Link to="/objetivos?novo=1&voltar=/lancar" className="text-xs text-positivo">+ Novo objetivo</Link>
            </div>
            <select id="obj" className="campo" value={destino} onChange={(e) => { setDestino(e.target.value); setErro(null) }}>
              <option value="">Livre</option>
              {reservaId && <option value={reservaId}>Reserva de emergência</option>}
              {objetivos.length > 0 && (
                <optgroup label="Objetivos">
                  {objetivos.map((o) => (
                    <option key={o.id} value={o.id}>{o.nome}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {aba === 'aporte' && destino && (
              <div className="text-xs text-texto-2">
                {destino === reservaId
                  ? 'Vai para a Reserva de emergência: fora do patrimônio, só para acompanhar o rendimento.'
                  : 'Fica reservado para o objetivo: conta como investimento, mas não como patrimônio livre. O rendimento vai para o objetivo.'}
              </div>
            )}
            {aba === 'aporte' && (
              <div className="text-xs text-texto-2">Depois dá para dividir o investimento entre vários destinos no detalhe do ativo.</div>
            )}
            {aba === 'resgate' && ativo && (
              <div className="text-xs text-texto-2">Disponível: {rv ? `${formatarNumero(disp)} cotas` : formatarBRL(disp)}</div>
            )}
          </Cartao>
        )}
        {aba === 'resgate' && ativo && !usaDestino && (
          <div className="-mt-2 px-1 text-xs text-texto-2">Disponível: {rv ? `${formatarNumero(disp)} cotas` : formatarBRL(disp)}</div>
        )}

        {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}

        <button type="submit" disabled={salvando} className="rounded-[14px] bg-botao p-4 text-base font-bold text-white disabled:opacity-60">
          {salvando ? 'Salvando…' : 'Salvar lançamento'}
        </button>
      </form>
    </>
  )
}
