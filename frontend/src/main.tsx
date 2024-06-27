import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { NextUIProvider } from '@nextui-org/react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import MainPage from './pages/MainPage'
import SettingsPage from './pages/SettingsPage'
import MonitorPage from './pages/MonitorPage'
import ClusterPage from './pages/ClusterPage'
import PageLayout from './pages/PageLayout'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NextUIProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PageLayout><MainPage /></PageLayout>} />
          <Route path="/settings" element={<PageLayout><SettingsPage/></PageLayout>} />
          <Route path="/monitor" element={<PageLayout><MonitorPage /></PageLayout>} />
          <Route path="/cluster" element={<PageLayout><ClusterPage /></PageLayout>} />
        </Routes>
      </BrowserRouter>
    </NextUIProvider>
  </React.StrictMode>,
)
