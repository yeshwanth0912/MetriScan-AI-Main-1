import { createContext, useContext, useEffect, useState } from 'react'
import { api, token } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token.get()) { setLoading(false); return }
    api.me().then(setUser).catch(() => token.clear()).finally(() => setLoading(false))
  }, [])

  const signIn = async (email, password) => {
    const res = await api.login(email, password)
    token.set(res.access_token)
    setUser(res.user)
    return res.user
  }

  const signOut = () => { token.clear(); setUser(null) }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, can: (...roles) => user && roles.includes(user.role) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
