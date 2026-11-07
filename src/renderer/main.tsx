import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import { App } from './App'
import { startSplash } from './motion/splash'

startSplash()
createRoot(document.getElementById('root')!).render(<App />)
