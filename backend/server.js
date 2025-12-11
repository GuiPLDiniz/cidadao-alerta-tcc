const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
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

// =============================================
// AUTH - LOGIN & REGISTER
// =============================================

// Rota de login COM CRIPTOGRAFIA
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
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

    const saltRounds = 12;
    const senhaCriptografada = await bcrypt.hash(password, saltRounds);

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

const upload = multer({ dest: 'public/uploads/' });

// GET /problemas - Listar problemas por localização (PostGIS)
app.get('/problemas', async (req, res) => {
  try {
    let { lat, lng, raio = 5 } = req.query; // raio em km

    // Valores padrão caso não venha nada (São Paulo)
    const latNum  = parseFloat(lat)  || -23.5505;
    const lngNum  = parseFloat(lng)  || -46.6333;
    const raioNum = parseFloat(raio) || 5;

    const result = await pool.query(`
      SELECT 
        p.id,
        p.titulo,
        p.descricao,
        p.foto_url,
        p.latitude,
        p.longitude,
        p.usuario_id,
        p.criado_em AS created_at,
        COALESCE(p.upvotes,0)   AS upvotes,
        COALESCE(p.downvotes,0) AS downvotes,
        u.nome as usuario_nome,
        (COALESCE(p.upvotes,0) - COALESCE(p.downvotes,0)) as score
      FROM problemas p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE ST_DWithin(
        p.localizacao,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
        $3 * 1000
      )
      ORDER BY score DESC, p.criado_em DESC
      LIMIT 50
    `, [latNum, lngNum, raioNum]);

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

// POST /problemas - Criar novo problema (grava localizacao com PostGIS)
app.post('/problemas', autenticarToken, upload.single('foto'), async (req, res) => {
  try {
    const { titulo, descricao, latitude, longitude } = req.body;
    const foto_url = req.file ? `/uploads/${req.file.filename}` : null;

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({
        success: false,
        message: 'Latitude e longitude inválidas'
      });
    }

    // IMPORTANTE: usamos parâmetros duplicados para evitar erro double vs numeric
    const result = await pool.query(
      `INSERT INTO problemas 
       (titulo, descricao, foto_url, latitude, longitude, localizacao, usuario_id) 
       VALUES (
         $1, $2, $3, 
         $4,          -- latitude
         $5,          -- longitude
         ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, -- long, lat para PostGIS
         $8
       ) 
       RETURNING id, titulo, descricao, foto_url, latitude, longitude, usuario_id,
                 criado_em AS created_at,
                 COALESCE(upvotes,0) AS upvotes,
                 COALESCE(downvotes,0) AS downvotes`,
      [titulo, descricao, foto_url, latNum, lngNum, lngNum, latNum, req.usuario.id]
    );

    console.log('Novo problema salvo no banco:', result.rows[0]);

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

// GET /problemas/minhas - Listar problemas do usuário logado
app.get('/problemas/minhas', autenticarToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;

    const result = await pool.query(`
      SELECT 
        p.id,
        p.titulo,
        p.descricao,
        p.foto_url,
        p.latitude,
        p.longitude,
        p.usuario_id,
        p.criado_em AS created_at,
        COALESCE(p.upvotes,0)   AS upvotes,
        COALESCE(p.downvotes,0) AS downvotes,
        u.nome AS usuario_nome,
        (COALESCE(p.upvotes,0) - COALESCE(p.downvotes,0)) AS score
      FROM problemas p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.usuario_id = $1
      ORDER BY p.id DESC
    `, [usuarioId]);

    return res.json({
      success: true,
      problemas: result.rows
    });
  } catch (error) {
    console.error('Erro ao listar minhas denúncias:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao carregar suas denúncias'
    });
  }
});

// GET /problemas/:id - Detalhes de um problema (id só numérico)
app.get('/problemas/:id(\\d+)', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.titulo,
        p.descricao,
        p.foto_url,
        p.latitude,
        p.longitude,
        p.usuario_id,
        p.criado_em AS created_at,
        COALESCE(p.upvotes,0)   AS upvotes,
        COALESCE(p.downvotes,0) AS downvotes,
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

// =============================================
// 🗳️ VOTAÇÃO (LIKE / DISLIKE)
// =============================================

// POST /problemas/:id/votar  -> { tipo: 'upvote' | 'downvote' }
app.post('/problemas/:id/votar', autenticarToken, async (req, res) => {
  const problemaId = parseInt(req.params.id, 10);
  const { tipo } = req.body;
  const usuarioId = req.usuario.id;

  if (!['upvote', 'downvote'].includes(tipo)) {
    return res.status(400).json({
      success: false,
      message: 'Tipo de voto inválido (use "upvote" ou "downvote")'
    });
  }

  try {
    await pool.query('BEGIN');

    // Verifica se este usuário já votou neste problema
    const votoExistente = await pool.query(
      'SELECT * FROM votos WHERE usuario_id = $1 AND problema_id = $2 FOR UPDATE',
      [usuarioId, problemaId]
    );

    let novoTipoVoto = null;

    if (votoExistente.rows.length === 0) {
      // Ainda não votou → insere voto e incrementa contador
      await pool.query(
        'INSERT INTO votos (usuario_id, problema_id, tipo_voto) VALUES ($1, $2, $3)',
        [usuarioId, problemaId, tipo]
      );

      if (tipo === 'upvote') {
        await pool.query(
          'UPDATE problemas SET upvotes = COALESCE(upvotes,0) + 1 WHERE id = $1',
          [problemaId]
        );
      } else {
        await pool.query(
          'UPDATE problemas SET downvotes = COALESCE(downvotes,0) + 1 WHERE id = $1',
          [problemaId]
        );
      }

      novoTipoVoto = tipo;
    } else {
      const voto = votoExistente.rows[0];

      if (voto.tipo_voto === tipo) {
        // Clicou de novo no mesmo voto → remover voto
        await pool.query('DELETE FROM votos WHERE id = $1', [voto.id]);

        if (tipo === 'upvote') {
          await pool.query(
            'UPDATE problemas SET upvotes = GREATEST(COALESCE(upvotes,0) - 1, 0) WHERE id = $1',
            [problemaId]
          );
        } else {
          await pool.query(
            'UPDATE problemas SET downvotes = GREATEST(COALESCE(downvotes,0) - 1, 0) WHERE id = $1',
            [problemaId]
          );
        }

        novoTipoVoto = null; // ficou sem voto
      } else {
        // Trocou de voto (ex: de down → up)
        await pool.query(
          'UPDATE votos SET tipo_voto = $1 WHERE id = $2',
          [tipo, voto.id]
        );

        if (tipo === 'upvote') {
          await pool.query(
            `UPDATE problemas 
             SET upvotes   = COALESCE(upvotes,0)   + 1,
                 downvotes = GREATEST(COALESCE(downvotes,0) - 1, 0)
             WHERE id = $1`,
            [problemaId]
          );
        } else {
          await pool.query(
            `UPDATE problemas 
             SET downvotes = COALESCE(downvotes,0) + 1,
                 upvotes   = GREATEST(COALESCE(upvotes,0) - 1, 0)
             WHERE id = $1`,
            [problemaId]
          );
        }

        novoTipoVoto = tipo;
      }
    }

    const contadores = await pool.query(
      'SELECT COALESCE(upvotes,0) AS upvotes, COALESCE(downvotes,0) AS downvotes FROM problemas WHERE id = $1',
      [problemaId]
    );

    await pool.query('COMMIT');

    res.json({
      success: true,
      message: 'Voto registrado com sucesso',
      upvotes: contadores.rows[0].upvotes,
      downvotes: contadores.rows[0].downvotes,
      tipoVoto: novoTipoVoto
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Erro ao votar:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao registrar voto'
    });
  }
});

// =============================================
// 👤 PERFIL
// =============================================

// GET /perfil - Dados do usuário logado
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

// PUT /perfil - Atualizar nome e email
app.put('/perfil', autenticarToken, async (req, res) => {
  try {
    const { nome, email } = req.body;

    if (!nome || !email) {
      return res.status(400).json({
        success: false,
        message: 'Nome e email são obrigatórios'
      });
    }

    const result = await pool.query(
      'UPDATE usuarios SET nome = $1, email = $2 WHERE id = $3 RETURNING id, nome, email, criado_em',
      [nome, email, req.usuario.id]
    );

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso!',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar perfil'
    });
  }
});

// PUT /perfil/senha - Atualizar senha
app.put('/perfil/senha', autenticarToken, async (req, res) => {
  try {
    const { novaSenha } = req.body;

    if (!novaSenha || novaSenha.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'A nova senha deve ter pelo menos 6 caracteres'
      });
    }

    const saltRounds = 12;
    const senhaCriptografada = await bcrypt.hash(novaSenha, saltRounds);

    await pool.query(
      'UPDATE usuarios SET senha = $1 WHERE id = $2',
      [senhaCriptografada, req.usuario.id]
    );

    res.json({
      success: true,
      message: 'Senha atualizada com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao atualizar senha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar senha'
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🎯 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
  console.log(`🗄️  Banco de dados: ${process.env.DB_NAME}`);
});
