import { useCallback, useEffect, useState } from 'react'

/** Carrega dados assíncronos com estados de carregando/erro e função para recarregar. */
export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const carregar = useCallback(fn, deps)

  const recarregar = useCallback(() => {
    let vivo = true
    setCarregando(true)
    setErro(null)
    carregar()
      .then((d) => vivo && setDados(d))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [carregar])

  useEffect(() => recarregar(), [recarregar])

  return { dados, erro, carregando, recarregar }
}
