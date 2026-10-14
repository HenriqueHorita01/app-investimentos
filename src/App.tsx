import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import { Carregando } from './components/ui'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Carteira from './pages/Carteira'
import Objetivos from './pages/Objetivos'
import Lancamento from './pages/Lancamento'
import Ativo from './pages/Ativo'
import NovoAtivo from './pages/NovoAtivo'

export default function App() {
  const { sessao, carregando } = useAuth()

  if (carregando) return <Carregando />
  // Todas as telas exigem login.
  if (!sessao) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="carteira" element={<Carteira />} />
        <Route path="objetivos" element={<Objetivos />} />
        <Route path="lancar" element={<Lancamento />} />
        <Route path="ativos/novo" element={<NovoAtivo />} />
        <Route path="ativo/:id" element={<Ativo />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
