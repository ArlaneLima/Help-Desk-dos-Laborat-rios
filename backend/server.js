require('dotenv').config();
const pool = require('./src/db');
const { criarApp } = require('./src/app');

const porta = process.env.PORT || 3000; // App Service injeta PORT
criarApp(pool).listen(porta, () => console.log(`Help Desk ouvindo na porta ${porta}`));
