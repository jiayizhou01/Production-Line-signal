 import { StrictMode } from 'react'
 import { createRoot } from 'react-dom/client'
 import App from './App'
 import { appStore } from './store/appStore'
 import './index.css'

 void appStore.initialize()

 createRoot(document.getElementById('root')!).render(
   <StrictMode>
     <App />
   </StrictMode>
 )
