const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// CONFIG BANCO
// =============================================
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Testar conexão
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
function gerarToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      email: usuario.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
}

function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token de acesso necessário',
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, usuario) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Token inválido ou expirado',
      });
    }

    req.usuario = usuario;
    next();
  });
}

// =============================================
// ROTA DE TESTE
// =============================================
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Backend do Cidadão Alerta está funcionando!',
    database: '✅ Conectado ao PostgreSQL',
    timestamp: new Date().toISOString(),
  });
});

// =============================================
// AUTH - LOGIN / REGISTER
// =============================================
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email ou senha incorretos',
      });
    }

    const usuario = result.rows[0];
    const senhaCorreta = await bcrypt.compare(password, usuario.senha);

    if (!senhaCorreta) {
      return res.status(401).json({
        success: false,
        message: 'Email ou senha incorretos',
      });
    }

    res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      user: {
        id: usuario.id,
        name: usuario.nome,
        email: usuario.email,
      },
      token: gerarToken(usuario),
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

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
        message: 'Email já cadastrado',
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
        email: novoUsuario.email,
      },
      token: gerarToken(novoUsuario),
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

// =============================================
// 📍 PROBLEMAS URBANOS
// =============================================
const upload = multer({ dest: 'public/uploads/' });

// GET /problemas – lista problemas usando PostGIS
app.get('/problemas', async (req, res) => {
  try {
    let { lat, lng, raio = 5 } = req.query; // raio em km

    const latNum = parseFloat(lat) || -23.5505;
    const lngNum = parseFloat(lng) || -46.6333;
    const raioNum = parseFloat(raio) || 5;

    const result = await pool.query(
      `
      SELECT 
        p.*,
        u.nome AS usuario_nome,
        (COALESCE(p.upvotes,0) - COALESCE(p.downvotes,0)) AS score
      FROM problemas p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE ST_DWithin(
        p.localizacao,                                     -- geography
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
        $3 * 1000
      )
      ORDER BY score DESC, p.criado_em DESC
      LIMIT 50
    `,
      [latNum, lngNum, raioNum]
    );

    res.json({
      success: true,
      problemas: result.rows,
    });
  } catch (error) {
    console.error('Erro ao buscar problemas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar problemas',
    });
  }
});

// POST /problemas – cria novo problema
app.post(
  '/problemas',
  autenticarToken,
  upload.single('foto'),
  async (req, res) => {
    try {
      const { titulo, descricao, latitude, longitude } = req.body;
      const foto_url = req.file ? `/uploads/${req.file.filename}` : null;

      const latNum = parseFloat(latitude);
      const lngNum = parseFloat(longitude);

      if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
        return res.status(400).json({
          success: false,
          message: 'Latitude e longitude inválidas',
        });
      }

      const result = await pool.query(
        `
        INSERT INTO problemas
          (titulo, descricao, foto_url, latitude, longitude, localizacao, usuario_id)
        VALUES
          ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography, $6)
        RETURNING *
      `,
        [titulo, descricao, foto_url, latNum, lngNum, req.usuario.id]
      );

      res.json({
        success: true,
        message: 'Problema reportado com sucesso!',
        problema: result.rows[0],
      });
    } catch (error) {
      console.error('Erro ao criar problema:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao reportar problema',
      });
    }
  }
);

// GET /problemas/minhas – problemas do usuário
app.get('/problemas/minhas', autenticarToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;

    const result = await pool.query(
      `
      SELECT 
        p.*,
        u.nome AS usuario_nome,
        (COALESCE(p.upvotes,0) - COALESCE(p.downvotes,0)) AS score
      FROM problemas p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.usuario_id = $1
      ORDER BY p.id DESC
    `,
      [usuarioId]
    );

    res.json({
      success: true,
      problemas: result.rows,
    });
  } catch (error) {
    console.error('Erro ao listar minhas denúncias:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar suas denúncias',
    });
  }
});

// POST /problemas/:id/deletar – só o dono pode deletar
app.post('/problemas/:id(\\d+)/deletar', autenticarToken, async (req, res) => {
  const problemaId = parseInt(req.params.id, 10);

  if (Number.isNaN(problemaId)) {
    return res.status(400).json({
      success: false,
      message: 'ID de problema inválido',
    });
  }

  try {
    const dono = await pool.query(
      'SELECT usuario_id FROM problemas WHERE id = $1',
      [problemaId]
    );

    if (dono.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Problema não encontrado',
      });
    }

    if (dono.rows[0].usuario_id !== req.usuario.id) {
      return res.status(403).json({
        success: false,
        message: 'Você não tem permissão para excluir esta denúncia',
      });
    }

    await pool.query('DELETE FROM comentarios WHERE problema_id = $1', [
      problemaId,
    ]);
    await pool.query('DELETE FROM votos WHERE problema_id = $1', [problemaId]);
    await pool.query('DELETE FROM problemas WHERE id = $1', [problemaId]);

    res.json({
      success: true,
      message: 'Denúncia removida com sucesso',
    });
  } catch (error) {
    console.error('Erro ao deletar problema:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar problema',
    });
  }
});

// POST /problemas/:id/votar – like / dislike
app.post('/problemas/:id(\\d+)/votar', autenticarToken, async (req, res) => {
  const problemaId = parseInt(req.params.id, 10);
  const { tipo_voto } = req.body;
  const usuarioId = req.usuario.id;

  if (!['upvote', 'downvote'].includes(tipo_voto)) {
    return res.status(400).json({
      success: false,
      message: 'Tipo de voto inválido',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `
      INSERT INTO votos (usuario_id, problema_id, tipo_voto)
      VALUES ($1, $2, $3)
      ON CONFLICT (usuario_id, problema_id)
      DO UPDATE SET tipo_voto = EXCLUDED.tipo_voto, criado_em = CURRENT_TIMESTAMP
    `,
      [usuarioId, problemaId, tipo_voto]
    );

    await client.query(
      `
      UPDATE problemas p
      SET
        upvotes   = COALESCE(v.up, 0),
        downvotes = COALESCE(v.down, 0)
      FROM (
        SELECT
          problema_id,
          SUM(CASE WHEN tipo_voto = 'upvote'   THEN 1 ELSE 0 END) AS up,
          SUM(CASE WHEN tipo_voto = 'downvote' THEN 1 ELSE 0 END) AS down
        FROM votos
        WHERE problema_id = $1
        GROUP BY problema_id
      ) v
      WHERE p.id = $1
    `,
      [problemaId]
    );

    await client.query('COMMIT');

    const contagem = await client.query(
      'SELECT upvotes, downvotes FROM problemas WHERE id = $1',
      [problemaId]
    );

    res.json({
      success: true,
      message: 'Voto registrado com sucesso!',
      upvotes: contagem.rows[0]?.upvotes || 0,
      downvotes: contagem.rows[0]?.downvotes || 0,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao votar problema:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao registrar voto',
    });
  } finally {
    client.release();
  }
});

// GET /problemas/:id – detalhes (se quiser usar)
app.get('/problemas/:id(\\d+)', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.*,
        u.nome AS usuario_nome
      FROM problemas p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.id = $1
    `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Problema não encontrado',
      });
    }

    res.json({
      success: true,
      problema: result.rows[0],
    });
  } catch (error) {
    console.error('Erro ao buscar problema:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar problema',
    });
  }
});

// =============================================
// PERFIL
// =============================================
app.get('/perfil', autenticarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, email, criado_em FROM usuarios WHERE id = $1',
      [req.usuario.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado',
      });
    }

    res.json({
      success: true,
      message: 'Perfil acessado com sucesso!',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
});

app.put('/perfil', autenticarToken, async (req, res) => {
  try {
    const { nome, email } = req.body;

    if (!nome || !email) {
      return res.status(400).json({
        success: false,
        message: 'Nome e email são obrigatórios',
      });
    }

    const result = await pool.query(
      'UPDATE usuarios SET nome = $1, email = $2 WHERE id = $3 RETURNING id, nome, email, criado_em',
      [nome, email, req.usuario.id]
    );

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso!',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar perfil',
    });
  }
});

app.put('/perfil/senha', autenticarToken, async (req, res) => {
  try {
    const { novaSenha } = req.body;

    if (!novaSenha || novaSenha.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'A nova senha deve ter pelo menos 6 caracteres',
      });
    }

    const saltRounds = 12;
    const senhaCriptografada = await bcrypt.hash(novaSenha, saltRounds);

    await pool.query('UPDATE usuarios SET senha = $1 WHERE id = $2', [
      senhaCriptografada,
      req.usuario.id,
    ]);

    res.json({
      success: true,
      message: 'Senha atualizada com sucesso!',
    });
  } catch (error) {
    console.error('Erro ao atualizar senha:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar senha',
    });
  }
});

// =============================================
// INICIAR SERVIDOR
// =============================================
app.listen(PORT, () => {
  console.log(`🎯 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
  console.log(`🗄️  Banco de dados: ${process.env.DB_NAME}`);
});
