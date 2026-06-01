import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'

const O = '#FF6600'
const SANS = "'DM Sans', sans-serif"

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { accessToken, user } = await api.login(email, password)
      if (user.role !== 'ADMIN') {
        setError('Acesso restrito a administradores.')
        return
      }
      login(accessToken, user)
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      setError((err as Error).message || 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 9,
    border: '1.5px solid #F0E8E0',
    background: '#FFFBF7',
    fontSize: 14,
    fontFamily: SANS,
    color: '#1A0A00',
    outline: 'none',
    transition: 'border-color 0.14s, box-shadow 0.14s',
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>

      {/* Left — brand panel */}
      <div style={{
        width: '44%',
        background: '#1A0A00',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        padding: 48,
      }}>
        {/* Warm orange glow */}
        <div style={{
          position: 'absolute',
          bottom: -100,
          right: -60,
          width: 320,
          height: 320,
          background: `radial-gradient(circle, rgba(255,102,0,0.22) 0%, transparent 65%)`,
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          top: -80,
          left: -40,
          width: 240,
          height: 240,
          background: `radial-gradient(circle, rgba(255,102,0,0.08) 0%, transparent 65%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 300 }}>
          <div style={{
            width: 60,
            height: 60,
            background: O,
            borderRadius: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 28px',
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 22,
            color: '#fff',
            letterSpacing: '-0.03em',
            boxShadow: `0 0 0 10px rgba(255,102,0,0.1)`,
          }}>
            TB
          </div>

          <h1 style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 34,
            color: '#FFFBF7',
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            marginBottom: 14,
          }}>
            Tá Barato<br />
            <span style={{ color: O }}>Admin</span>
          </h1>

          <p style={{
            color: 'rgba(255,251,247,0.35)',
            fontSize: 13.5,
            lineHeight: 1.65,
            fontFamily: SANS,
          }}>
            Central de controle de entregadores,<br />
            lojas e usuários da plataforma.
          </p>

          <div style={{
            display: 'flex',
            gap: 24,
            justifyContent: 'center',
            marginTop: 40,
            paddingTop: 32,
            borderTop: '1px solid rgba(255,251,247,0.07)',
          }}>
            {[['Entregadores', '🏍'], ['Lojas', '🏪'], ['Usuários', '👥']].map(([l, e]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{e}</div>
                <div style={{ color: 'rgba(255,251,247,0.3)', fontSize: 11, fontFamily: SANS }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — login form */}
      <div style={{
        flex: 1,
        background: '#FFFBF7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>

          <div style={{ marginBottom: 34 }}>
            <h2 style={{
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: 24,
              color: '#1A0A00',
              letterSpacing: '-0.025em',
              marginBottom: 6,
            }}>
              Entrar no painel
            </h2>
            <p style={{ color: '#7A5C4A', fontSize: 13.5, fontFamily: SANS }}>
              Somente administradores têm acesso
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{
                display: 'block',
                fontSize: 11.5,
                fontWeight: 700,
                color: '#7A5C4A',
                letterSpacing: '0.07em',
                marginBottom: 6,
                fontFamily: SANS,
              }}>
                E-MAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="adm@tabarato.com"
                style={inputStyle}
                onFocus={e => {
                  e.currentTarget.style.borderColor = O
                  e.currentTarget.style.boxShadow = `0 0 0 3px rgba(255,102,0,0.1)`
                  e.currentTarget.style.background = '#fff'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = '#F0E8E0'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.background = '#FFFBF7'
                }}
              />
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={{
                display: 'block',
                fontSize: 11.5,
                fontWeight: 700,
                color: '#7A5C4A',
                letterSpacing: '0.07em',
                marginBottom: 6,
                fontFamily: SANS,
              }}>
                SENHA
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••••"
                style={inputStyle}
                onFocus={e => {
                  e.currentTarget.style.borderColor = O
                  e.currentTarget.style.boxShadow = `0 0 0 3px rgba(255,102,0,0.1)`
                  e.currentTarget.style.background = '#fff'
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = '#F0E8E0'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.background = '#FFFBF7'
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: '#FEF2F2',
                color: '#B91C1C',
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 16,
                border: '1px solid #FECACA',
                fontFamily: SANS,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 9,
                background: loading ? '#FFA366' : O,
                border: 'none',
                color: '#fff',
                fontFamily: SANS,
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.14s, transform 0.1s',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#E55A00' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = O }}
              onMouseDown={e => { if (!loading) e.currentTarget.style.transform = 'scale(0.99)' }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {loading ? 'Autenticando...' : 'Entrar →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
