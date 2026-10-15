import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { carregarCategorias, criarAtivo } from '../lib/dados'
import { lerNumero } from '../lib/formato'
import { ehRendaVariavel, INDEXADORES, NOME_TIPO, TIPOS_MVP, type Indexador, type TipoAtivo } from '../lib/tipos'
import { useCarregar } from '../lib/useCarregar'
import { Campo, Cartao, Titulo } from '../components/ui'

/** Tipo de ativo sugerido pelo nome da categoria (ex.: "Fundos imobiliários (FIIs)" → FII). */
function tipoSugerido(nomeCategoria: string | undefined): TipoAtivo | null {
  const n = (nomeCategoria ?? '').toLowerCase()
  if (n.includes('fii') || n.includes('imobili')) return 'fii'
  if (n.includes('etf')) return 'etf'
  if (n.includes('aç') || n.includes('acao') || n.includes('acoes')) return 'acao'
  if (n.includes('lci') || n.includes('lca')) return 'lci_lca'
  if (n.includes('tesouro')) return 'tesouro'
  if (n.includes('cdb')) return 'cdb'
  return null
}

export default function NovoAtivo() {
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const voltarPara = params.get('voltar') // ex.: /lancar, /reserva, /minha-carteira
  const categoriaId = params.get('categoria')
  const { dados: categorias } = useCarregar(() => (categoriaId ? carregarCategorias() : Promise.resolve([])), [categoriaId])
  const categoria = categorias?.find((c) => c.id === categoriaId)

  const [reserva, setReserva] = useState(params.get('reserva') === '1')
  const [tipoEscolhido, setTipo] = useState<TipoAtivo | null>(reserva ? 'cdb' : null)
  const tipo: TipoAtivo = tipoEscolhido ?? tipoSugerido(categoria?.nome) ?? 'fii'
  const [indexadorEscolhido, setIndexador] = useState<Indexador | null>(null)
  const indexador: Indexador = indexadorEscolhido ?? (tipo === 'tesouro' ? (categoria?.nome.toLowerCase().includes('selic') ? 'selic' : 'ipca') : 'cdi')
  const [ticker, setTicker] = useState('')
  const [nome, setNome] = useState('')
  const [instituicao, setInstituicao] = useState('')
  const [taxa, setTaxa] = useState('')
  const [vencimento, setVencimento] = useState('')
  // Planejamento (só quando vem da Minha Carteira).
  const [percentual, setPercentual] = useState('')
  const [precoRef, setPrecoRef] = useState('')
  const [minimo, setMinimo] = useState('')
  const [incremento, setIncremento] = useState('')
  const [liquidez, setLiquidez] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const rv = ehRendaVariavel(tipo)
  const idx = INDEXADORES.find((i) => i.id === indexador)!
  const opcional = (t: string) => (t.trim() ? lerNumero(t) : null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const tk = ticker.trim().toUpperCase()
    if (rv && !/^[A-Z]{4}\d{1,2}[A-Z]?$/.test(tk)) return setErro('Ticker inválido. Ex.: HGLG11, PETR4, WRLD11.')
    const taxaN = opcional(taxa)
    if (!rv && idx.taxaObrigatoria && !(taxaN != null && taxaN > 0)) return setErro(`Informe a taxa (${idx.rotuloTaxa}). Ex.: ${idx.exemplo}.`)
    if (!rv && taxaN != null && Number.isNaN(taxaN)) return setErro('Taxa inválida.')
    if (!rv && !nome.trim()) return setErro('Informe um nome. Ex.: CDB Banco X, LCI Banco Y, Tesouro IPCA+ 2035.')
    const pctN = opcional(percentual)
    if (pctN != null && !(pctN >= 0 && pctN <= 100)) return setErro('Percentual inválido (0 a 100).')
    const precoN = opcional(precoRef)
    if (precoN != null && !(precoN > 0)) return setErro('Preço de referência inválido.')
    const minN = opcional(minimo)
    const incN = opcional(incremento)
    if ((minN != null && !(minN >= 0)) || (incN != null && !(incN > 0))) return setErro('Valores de aplicação inválidos.')
    setSalvando(true)
    try {
      const a = await criarAtivo({
        tipo,
        ticker: rv ? tk : null,
        nome: rv ? nome.trim() || tk : nome.trim(),
        instituicao: instituicao.trim() || null,
        indexador: rv ? 'nenhum' : indexador,
        taxa: rv ? null : taxaN,
        vencimento: !rv && vencimento ? vencimento : null,
        ...(categoriaId
          ? {
              categoria_id: categoriaId,
              percentual_alvo: pctN,
              preco_referencia: precoN,
              aplicacao_minima: rv ? null : minN,
              incremento_minimo: rv ? null : incN,
              liquidez: rv ? null : liquidez.trim() || null,
            }
          : {}),
      })
      if (categoriaId) {
        // Investimento planejado (futuro): volta para a Minha Carteira, sem lançar nada.
        navegar(voltarPara ?? '/minha-carteira', { replace: true })
        return
      }
      // Vindo do Lançar ou da Reserva, segue direto para lançar o primeiro aporte.
      // Reserva: o primeiro aporte já vai com destino "Reserva de emergência".
      navegar(reserva ? `/lancar?ativo=${a.id}&objetivo=reserva` : voltarPara ? `/lancar?ativo=${a.id}` : `/ativo/${a.id}`, { replace: true })
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
      <Titulo>{reserva ? 'Nova aplicação da reserva' : categoriaId ? 'Novo investimento planejado' : 'Novo ativo'}</Titulo>
      {categoria && (
        <div className="-mt-2 text-[13px] text-texto-2">
          Categoria: <b className="text-texto">{categoria.nome}</b> · pode ser um investimento que você ainda vai comprar.
        </div>
      )}

      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-segmento p-1" role="tablist" aria-label="Tipo de ativo">
          {TIPOS_MVP.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tipo === t}
              onClick={() => {
                setTipo(t)
                setIndexador(null)
              }}
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
                <input
                  id="ticker"
                  className="campo font-mono uppercase"
                  placeholder={tipo === 'etf' ? 'WRLD11' : tipo === 'acao' ? 'ITUB4' : 'HGLG11'}
                  autoCapitalize="characters"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  required
                />
              </Campo>
              <Campo id="nome" rotulo="Nome (opcional)">
                <input id="nome" className="campo" placeholder={tipo === 'fii' ? 'CSHG Logística' : ''} value={nome} onChange={(e) => setNome(e.target.value)} />
              </Campo>
            </>
          ) : (
            <>
              {tipo === 'cdb' && <div className="text-xs text-texto-2">Vale para CDB, caixinhas e contas que rendem um percentual do CDI.</div>}
              <Campo id="nome" rotulo="Nome">
                <input
                  id="nome"
                  className="campo"
                  placeholder={tipo === 'tesouro' ? 'Tesouro IPCA+ 2035' : tipo === 'lci_lca' ? 'LCI Banco X' : 'Caixinha Turbo Nubank'}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </Campo>
              <Campo id="indexador" rotulo="Indexador">
                <select id="indexador" className="campo" value={indexador} onChange={(e) => setIndexador(e.target.value as Indexador)}>
                  {INDEXADORES.map((i) => (
                    <option key={i.id} value={i.id}>{i.nome}</option>
                  ))}
                </select>
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo id="taxa" rotulo={idx.rotuloTaxa}>
                  <input id="taxa" className="campo font-mono" inputMode="decimal" placeholder={idx.exemplo} value={taxa} onChange={(e) => setTaxa(e.target.value)} />
                </Campo>
                <Campo id="venc" rotulo="Vencimento">
                  <input id="venc" type="date" className="campo" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
                </Campo>
              </div>
              {indexador !== 'cdi' && (
                <div className="text-xs text-texto-2">
                  O rendimento automático é calculado só para % do CDI. Para {idx.nome}, o saldo é atualizado pelo extrato (Corrigir saldo).
                </div>
              )}
            </>
          )}
          <Campo id="inst" rotulo="Instituição / corretora (opcional)">
            <input id="inst" className="campo" value={instituicao} onChange={(e) => setInstituicao(e.target.value)} />
          </Campo>
          {!categoriaId && (
            <label className="flex items-start gap-3 border-t border-linha pt-3.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--positivo)]" checked={reserva} onChange={(e) => setReserva(e.target.checked)} />
              <span>
                <b>É reserva de emergência</b>
                <span className="block text-xs text-texto-2">O primeiro aporte já vai para a Reserva de emergência (fora do patrimônio). Depois dá para dividir com objetivos ou deixar parte livre.</span>
              </span>
            </label>
          )}
        </Cartao>

        {categoriaId && (
          <Cartao className="flex flex-col gap-3.5">
            <div className="text-sm font-bold">Plano na Minha Carteira</div>
            <div className="grid grid-cols-2 gap-3">
              <Campo id="pct" rotulo="% da carteira (opcional)">
                <input id="pct" className="campo font-mono" inputMode="decimal" placeholder="pendente" value={percentual} onChange={(e) => setPercentual(e.target.value)} />
              </Campo>
              <Campo id="pref" rotulo={rv ? 'Preço atual / referência' : 'Valor de referência'}>
                <input id="pref" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={precoRef} onChange={(e) => setPrecoRef(e.target.value)} />
              </Campo>
            </div>
            {!rv && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Campo id="min" rotulo="Aplicação mínima">
                    <input id="min" className="campo font-mono" inputMode="decimal" placeholder="0,00" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
                  </Campo>
                  <Campo id="inc" rotulo="Incremento mínimo">
                    <input id="inc" className="campo font-mono" inputMode="decimal" placeholder="—" value={incremento} onChange={(e) => setIncremento(e.target.value)} />
                  </Campo>
                </div>
                <Campo id="liq" rotulo="Liquidez">
                  <input id="liq" className="campo" placeholder="diária, no vencimento, D+30…" value={liquidez} onChange={(e) => setLiquidez(e.target.value)} />
                </Campo>
              </>
            )}
            <div className="text-xs text-texto-2">
              O % é da carteira inteira: os investimentos de "{categoria?.nome ?? 'uma categoria'}" devem somar {categoria ? `${categoria.percentual}%` : 'o % dela'}. Pode deixar
              pendente e definir depois.
            </div>
          </Cartao>
        )}

        {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}

        <button type="submit" disabled={salvando} className="rounded-[14px] bg-botao p-4 text-base font-bold text-white disabled:opacity-60">
          {salvando ? 'Salvando…' : categoriaId ? 'Adicionar à Minha Carteira' : 'Cadastrar ativo'}
        </button>
      </form>
    </>
  )
}
