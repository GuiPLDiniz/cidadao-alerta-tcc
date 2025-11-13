const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;


// Configuração do banco de dados PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Testar conexão com o banco
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao conectar com o banco de dados:', err.message);
  } else {
    console.log('✅ Conectado ao PostgreSQL com sucesso!');
    release();
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rota SIMPLES para teste
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Backend do Cidadão Alerta está funcionando!',
    database: '✅ Conectado ao PostgreSQL',
    timestamp: new Date().toISOString()
  });
});


// Rota de login COM CRIPTOGRAFIA
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Buscar usuário no banco de dados
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email ou senha incorretos'
      });
    }

    const usuario = result.rows[0];

    // 🔐 VERIFICAÇÃO SEGURA DA SENHA (com bcrypt)
    const senhaCorreta = await bcrypt.compare(password, usuario.senha);

    if (senhaCorreta) {
      res.json({
        success: true,
        message: 'Login realizado com sucesso!',
        user: {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email
        },
        token: 'token-simulado-para-testes'
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Email ou senha incorretos'
      });
    }

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Rota de cadastro COM CRIPTOGRAFIA
app.post('/auth/register', async (req, res) => {
  console.log('📝 Tentativa de cadastro:', req.body);
  const { name, email, password } = req.body;

  try {
    // Verificar se email já existe
    const emailExists = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email]
    );

    if (emailExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email já cadastrado'
      });
    }

    // 🔐 CRIPTOGRAFAR A SENHA ANTES DE SALVAR
    const saltRounds = 12; // Quanto maior, mais seguro (e mais lento)
    const senhaCriptografada = await bcrypt.hash(password, saltRounds);

    // Inserir novo usuário no banco COM SENHA CRIPTOGRAFADA
    const result = await pool.query(
      'INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id, nome, email',
      [name, email, senhaCriptografada]
    );

    const novoUsuario = result.rows[0];

    res.json({
      success: true,
      message: 'Usuário cadastrado com sucesso!',
      user: {
        id: novoUsuario.id,
        name: novoUsuario.nome,
        email: novoUsuario.email
      },
      token: 'token-simulado-cadastro'
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});




// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🎯 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
  console.log(`🗄️  Banco de dados: ${process.env.DB_NAME}`);
});