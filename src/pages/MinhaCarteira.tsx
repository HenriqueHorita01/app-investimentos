import { useSearchParams } from 'react-router-dom'
import { carregarCarteira, carregarCategorias } from '../lib/dados'
import { montarAtivoPlano, montarPlanejamento } from '../lib/carteiraPlano'
import { useCarregar } from '../lib/useCarregar'
import { Cartao, Carregando, Erro, Titulo } from '../components/ui'
import { Planejamento } from '../components/carteira/Planejamento'

const AREAS = [
  { id: 'planejamento', rotulo: 'Planejamento', etapa: 1 },
  { id: 'simulador', rotulo: 'Simulador', etapa: 2 },
  { id: 'prioridades', rotulo: 'Prioridades', etapa: 2 },
  { id: 'acompanhamento', rotulo: 'Acompanhamento', etapa: 4 },
] as const
type Area = (typeof AREAS)[number]['id']

async function carregarMinhaCarteira() {
  const [carteira, categorias] = await Promise.all([carregarCarteira(), carregarCategorias()])
  const ativosPlano = carteira.ativos.map((a) => montarAtivoPlano(a, a.posicao, a.movimentacoes, a.ultimaCotacao))
  return { carteira, categorias, planejamento: montarPlanejamento(categorias, ativosPlano), ativosPlano }
}
export type DadosMinhaCarteira = Awaited<ReturnType<typeof carregarMinhaCarteira>>

export default function MinhaCarteira() {
  const [params, setParams] = useSearchParams()
  const area = (AREAS.find((a) => a.id === params.get('area'))?.id ?? 'planejamento') as Area
  const { dados, erro, carregando, recarregar } = useCarregar(carregarMinhaCarteira)

  return (
    <>
      <Titulo>Minha Carteira</Titulo>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Áreas da Minha Carteira">
        {AREAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={area === a.id}
            onClick={() => setParams({ area: a.id }, { replace: true })}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] ${
              area === a.id ? 'bg-texto font-bold text-fundo' : 'border border-campo bg-cartao text-texto'
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {carregando && !dados ? (
        <Carregando />
      ) : erro || !dados ? (
        <Erro mensagem={erro ?? 'Erro ao carregar.'} tentar={recarregar} />
      ) : area === 'planejamento' ? (
        <Planejamento dados={dados} aoMudar={recarregar} />
      ) : (
        <Cartao className="text-sm text-texto-2">
          A área <b className="text-texto">{AREAS.find((a) => a.id === area)!.rotulo}</b> chega na etapa {AREAS.find((a) => a.id === area)!.etapa} da
          Minha Carteira. Comece configurando categorias e investimentos em <b className="text-texto">Planejamento</b>.
        </Cartao>
      )}
    </>
  )
}
