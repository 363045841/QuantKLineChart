import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'

import { version } from '../package.json'
document.title = `KLineChartQuant v${version}`

const app = createApp(App)

app.mount('#app')
