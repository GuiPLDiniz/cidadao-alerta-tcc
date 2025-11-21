const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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


// =============================================
// FUNÇÕES JWT
// =============================================

// Função para gerar token JWT
function gerarToken(usuario) {
  return jwt.sign(
    { 
      id: usuario.id,
      email: usuario.email 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
}

// Middleware para verificar token
function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token de acesso necessário'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, usuario) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Token inválido ou expirado'
      });
    }
    
    req.usuario = usuario;
    next();
  });
}

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
        token: gerarToken(usuario)
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
      token: gerarToken(novoUsuario)
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});


// =============================================
// 📍 ROTAS DE PROBLEMAS URBANOS
// =============================================

// Configuração do multer para upload de fotos
const multer = require('multer');
const upload = multer({ dest: 'public/uploads/' });

// GET /problemas - Listar problemas por localização
app.get('/problemas', async (req, res) => {
  try {
    const { lat, lng, raio = 5 } = req.query; // raio em km

    const result = await pool.query(`
      SELECT 
        p.*,
        u.nome as usuario_nome,
        (p.upvotes - p.downvotes) as score
      FROM problemas p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE latitude BETWEEN $1 - 0.1 AND $1 + 0.1
        AND longitude BETWEEN $2 - 0.1 AND $2 + 0.1
      ORDER BY score DESC
      LIMIT 50
    `, [parseFloat(lat), parseFloat(lng)]);

    res.json({
      success: true,
      problemas: result.rows
    });
  } catch (error) {
    console.error('Erro ao buscar problemas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar problemas'
    });
  }
});

// POST /problemas - Criar novo problema
app.post('/problemas', autenticarToken, upload.single('foto'), async (req, res) => {
  try {
    const { titulo, descricao, latitude, longitude } = req.body;
    const foto_url = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await pool.query(
      `INSERT INTO problemas 
       (titulo, descricao, foto_url, latitude, longitude, usuario_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [titulo, descricao, foto_url, latitude, longitude, req.usuario.id]
    );

    res.json({
      success: true,
      message: 'Problema reportado com sucesso!',
      problema: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao criar problema:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao reportar problema'
    });
  }
});

// GET /problemas/:id - Detalhes de um problema
app.get('/problemas/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.*,
        u.nome as usuario_nome
      FROM problemas p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Problema não encontrado'
      });
    }

    res.json({
      success: true,
      problema: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao buscar problema:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar problema'
    });
  }
});

app.get('/perfil', autenticarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, email, criado_em FROM usuarios WHERE id = $1',
      [req.usuario.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Perfil acessado com sucesso!',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
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