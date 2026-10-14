import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { BotaoTema } from '../components/BotaoTema'

const MENSAGENS: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link enviado antes de entrar.',
  'User already registered': 'Este e-mail já tem conta. Use "Entrar".',
}

export default function Login() {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setEnviando(true)
    const r =
      modo === 'entrar'
        ? await supabase.auth.signInWithPassword({ email, password: senha })
        : await supabase.auth.signUp({ email, password: senha })
    setEnviando(false)
    if (r.error) {
      setErro(MENSAGENS[r.error.message] ?? r.error.message)
      return
    }
    if (modo === 'criar' && !r.data.session) {
      setAviso('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.')
      setModo('entrar')
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      <div className="flex justify-end">
        <BotaoTema />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-6">
        <div>
          <div className="text-[26px] font-bold">Investimentos</div>
          <div className="text-sm text-texto-2">Sua carteira, aportes e proventos.</div>
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-4 rounded-[14px] bg-cartao p-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="rotulo">E-mail</label>
            <input id="email" type="email" autoComplete="email" required className="campo" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="senha" className="rotulo">Senha</label>
            <input
              id="senha"
              type="password"
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              className="campo"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          {erro && <div role="alert" className="text-sm text-negativo">{erro}</div>}
          {aviso && <div className="text-sm text-positivo">{aviso}</div>}
          <button type="submit" disabled={enviando} className="rounded-[14px] bg-botao p-4 text-base font-bold text-white disabled:opacity-60">
            {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <button
          type="button"
          className="text-sm text-positivo"
          onClick={() => {
            setModo(modo === 'entrar' ? 'criar' : 'entrar')
            setErro(null)
          }}
        >
          {modo === 'entrar' ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  )
}
