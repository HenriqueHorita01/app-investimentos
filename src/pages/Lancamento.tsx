import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { carregarCarteira, criarMovimentacao } from '../lib/dados'
import { formatarBRL, formatarNumero, hojeSP, lerNumero } from '../lib/formato'
import { ehRendaVariavel, NOME_TIPO, rotuloAtivo } from '../lib/tipos'
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
  const [data, setData] = useState(hojeSP())
  const [qtd, setQtd] = useState('')
  const [preco, setPreco] = useState('')
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const ativos = dados ?? []
  const ativo = ativos.find((a) => a.id === ativoId)
  const rv = ativo ? ehRendaVariavel(ativo.tipo) : true

  // Seleciona o primeiro ativo quando não veio nenhum na URL.
  useEffect(() => {
    if (!ativoId && ativos.length) setAtivoId(ativos[0].id)
  }, [ativos, ativoId])

  // Dividendo: sugere a quantidade de cotas atual.
  useEffect(() => {
    if (aba === 'dividendo' && ativo && rv && !qtd) setQtd(String(ativo.posicao.quantidade).replace('.', ','))
  }, [aba, ativo, rv, qtd])

  const qtdN = lerNumero(qtd)
  const precoN = lerNumero(preco)
  const total = rv ? (qtdN > 0 && precoN > 0 ? arred2(qtdN * precoN) : 0) : lerNumero(valor) > 0 ? arred2(lerNumero(valor)) : 0

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!ativo) return setErro('Escolha um ativo.')
    if (!data) return setErro('Informe a data.')
    if (data > hojeSP()) return setErro('A data não pode ser no futuro.')
    if (aba === 'dividendo' && !rv) return setErro('Dividendo só se aplica a FIIs e ações.')

    if (rv) {
      if (!(qtdN > 0)) return setErro('Informe a quantidade de cotas.')
      if (!(precoN > 0)) return setErro(aba === 'dividendo' ? 'Informe o valor por cota.' : 'Informe o preço por cota.')
      if (aba === 'resgate' && qtdN > ativo.posicao.quantidade + 1e-9) {
        return setErro(`Você tem ${formatarNumero(ativo.posicao.quantidade)} cotas; não dá para resgatar ${formatarNumero(qtdN)}.`)
      }
    } else {
      if (!(total > 0)) return setErro('Informe o valor.')
      if (aba === 'resgate' && total > ativo.posicao.valorAtual + 0.005) {
        return setErro(`O saldo aplicado é ${formatarBRL(ativo.posicao.valorAtual)}; o resgate não pode passar disso.`)
      }
    }

    setSalvando(true)
    try {
      await criarMovimentacao({
        ativo_id: ativo.id,
        data,
        tipo: aba,
        quantidade: rv ? qtdN : null,
        preco_unitario: rv ? precoN : null,
        valor_total: total,
        observacao: null,
      })
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
              {ativos.map((a) => (
                <option key={a.id} value={a.id}>
                  {rotuloAtivo(a)} — {ehRendaVariavel(a.tipo) ? NOME_TIPO[a.tipo] : 'Renda fixa'}
                </option>
              ))}
            </select>
            {ativo && aba === 'resgate' && (
              <div className="text-xs text-texto-2">
                Disponível: {rv ? `${formatarNumero(ativo.posicao.quantidade)} cotas` : formatarBRL(ativo.posicao.valorAtual)}
              </div>
            )}
          </div>

          <Campo id="data" rotulo="Data">
            <input id="data" type="date" className="campo" max={hojeSP()} value={data} onChange={(e) => setData(e.target.value)} required />
          </Campo>

          {aba === 'dividendo' && !rv ? (
            <div className="text-sm text-texto-2">Renda fixa não paga dividendo. Escolha um FII ou ação.</div>
          ) : rv ? (
            <div className="grid grid-cols-2 gap-3">
              <Campo id="qtd" rotulo={rotuloQtd}>
                <input id="qtd" className="campo font-mono" inputMode="decimal" placeholder="0" value={qtd} onChange={(e) => setQtd(e.target.value)} />
              </Campo>
              <Campo id="preco" rotulo={rotuloPreco}>
                <input id="preco" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={preco} onChange={(e) => setPreco(e.target.value)} />
              </Campo>
            </div>
          ) : (
            <Campo id="valor" rotulo={aba === 'aporte' ? 'Valor aplicado' : 'Valor resgatado'}>
              <input id="valor" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
            </Campo>
          )}

          <div className="flex items-baseline justify-between border-t border-linha pt-3">
            <div className="text-[13px] text-texto-2">Total</div>
            <div className="font-mono text-xl">{formatarBRL(total)}</div>
          </div>
        </Cartao>

        {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}

        <button type="submit" disabled={salvando} className="rounded-[14px] bg-botao p-4 text-base font-bold text-white disabled:opacity-60">
          {salvando ? 'Salvando…' : 'Salvar lançamento'}
        </button>
      </form>
    </>
  )
}
