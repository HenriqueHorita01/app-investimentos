import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { criarAtivo } from '../lib/dados'
import { lerNumero } from '../lib/formato'
import { ehRendaVariavel, NOME_TIPO, TIPOS_MVP, type TipoAtivo } from '../lib/tipos'
import { Campo, Cartao, Titulo } from '../components/ui'

export default function NovoAtivo() {
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const voltarPara = params.get('voltar') // ex.: /lancar
  const [tipo, setTipo] = useState<TipoAtivo>('fii')
  const [ticker, setTicker] = useState('')
  const [nome, setNome] = useState('')
  const [instituicao, setInstituicao] = useState('')
  const [taxa, setTaxa] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const rv = ehRendaVariavel(tipo)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const tk = ticker.trim().toUpperCase()
    if (rv && !/^[A-Z]{4}\d{1,2}[A-Z]?$/.test(tk)) {
      setErro('Ticker inválido. Ex.: HGLG11, PETR4.')
      return
    }
    const taxaN = taxa.trim() ? lerNumero(taxa) : null
    if (!rv && (taxaN == null || Number.isNaN(taxaN) || taxaN <= 0)) {
      setErro('Informe a taxa contratada (% do CDI). Ex.: 110.')
      return
    }
    if (!rv && !nome.trim()) {
      setErro('Informe um nome para o CDB. Ex.: CDB Banco X 110% CDI.')
      return
    }
    setSalvando(true)
    try {
      const a = await criarAtivo({
        tipo,
        ticker: rv ? tk : null,
        nome: rv ? nome.trim() || tk : nome.trim(),
        instituicao: instituicao.trim() || null,
        indexador: rv ? 'nenhum' : 'cdi',
        taxa: rv ? null : taxaN,
        vencimento: !rv && vencimento ? vencimento : null,
      })
      navegar(voltarPara ? `${voltarPara}?ativo=${a.id}` : `/ativo/${a.id}`, { replace: true })
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
      setSalvando(false)
    }
  }

  return (
    <>
      <Link to={voltarPara ?? '/carteira'} className="-mb-2 flex min-h-8 items-center gap-1 text-sm text-positivo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        Voltar
      </Link>
      <Titulo>Novo ativo</Titulo>

      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-segmento p-1" role="tablist" aria-label="Tipo de ativo">
          {TIPOS_MVP.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tipo === t}
              onClick={() => setTipo(t)}
              className={`rounded-[9px] py-2.5 text-sm ${tipo === t ? 'bg-segmento-ativo font-bold shadow-sm' : 'text-texto-2'}`}
            >
              {NOME_TIPO[t]}
            </button>
          ))}
        </div>

        <Cartao className="flex flex-col gap-3.5">
          {rv ? (
            <>
              <Campo id="ticker" rotulo="Ticker">
                <input id="ticker" className="campo font-mono uppercase" placeholder="HGLG11" autoCapitalize="characters" value={ticker} onChange={(e) => setTicker(e.target.value)} required />
              </Campo>
              <Campo id="nome" rotulo="Nome (opcional)">
                <input id="nome" className="campo" placeholder="CSHG Logística" value={nome} onChange={(e) => setNome(e.target.value)} />
              </Campo>
            </>
          ) : (
            <>
              <Campo id="nome" rotulo="Nome">
                <input id="nome" className="campo" placeholder="CDB Banco X 110% CDI" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo id="taxa" rotulo="Taxa (% do CDI)">
                  <input id="taxa" className="campo font-mono" inputMode="decimal" placeholder="110" value={taxa} onChange={(e) => setTaxa(e.target.value)} required />
                </Campo>
                <Campo id="venc" rotulo="Vencimento">
                  <input id="venc" type="date" className="campo" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
                </Campo>
              </div>
            </>
          )}
          <Campo id="inst" rotulo="Instituição / corretora (opcional)">
            <input id="inst" className="campo" value={instituicao} onChange={(e) => setInstituicao(e.target.value)} />
          </Campo>
        </Cartao>

        {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}

        <button type="submit" disabled={salvando} className="rounded-[14px] bg-botao p-4 text-base font-bold text-white disabled:opacity-60">
          {salvando ? 'Salvando…' : 'Cadastrar ativo'}
        </button>
      </form>
    </>
  )
}

