import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initStorage } from './storage/local'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/fraunces/700.css'
import './styles/index.css'

// Load the library from extension storage before the first render.
initStorage().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
