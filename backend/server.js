const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const pool = require('./src/db');
const { criarApp } = require('./src/app');

const porta = process.env.PORT || 3000; // o App Service injeta PORT
criarApp(pool).listen(porta, () => console.log(`Help Desk ouvindo na porta ${porta}`));
