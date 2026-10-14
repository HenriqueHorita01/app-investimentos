import { Cartao, Titulo } from '../components/ui'

export default function Objetivos() {
  return (
    <>
      <Titulo>Objetivos</Titulo>
      <Cartao className="text-sm text-texto-2">
        Reservar dinheiro para objetivos (viagem, compra futura…) chega na <b className="text-texto">Fase 2</b>. Por enquanto todo o patrimônio aparece como livre.
      </Cartao>
    </>
  )
}
