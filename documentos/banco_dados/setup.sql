-- =============================================
-- CIDADAO ALERTA - SCRIPT DE CRIAÇÃO DO BANCO
-- COM SUPORTE A POSTGIS / CONSULTAS GEOGRÁFICAS
-- =============================================

-- 1) Criar database (execute separadamente no pgAdmin ou terminal)
-- CREATE DATABASE cidadao_alerta;

-- 2) CONECTAR NA BASE cidadao_alerta
-- \c cidadao_alerta;

-- 3) Habilitar extensão PostGIS (APENAS UMA VEZ POR BANCO)
CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================
-- TABELA DE USUÁRIOS
-- =============================================
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABELA DE PROBLEMAS URBANOS
-- =============================================
CREATE TABLE problemas (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    foto_url VARCHAR(500),

    -- Coordenadas numéricas (mantidas para facilitar integração simples)
    latitude  DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,

    -- CAMPO GEOGRÁFICO (PostGIS) PARA CONSULTAS POR RAIO
    -- geography(Point,4326) usa lat/long em WGS84 e permite ST_DWithin com metros
    localizacao GEOGRAPHY(Point, 4326),

    usuario_id INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    upvotes   INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0
);

-- Preencher automaticamente o campo localizacao a partir de latitude/longitude
-- (opcional em ambiente de desenvolvimento; em produção use em migrações)
UPDATE problemas
SET localizacao = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE localizacao IS NULL;

-- =============================================
-- TABELA DE VOTOS (EVITA VOTOS DUPLICADOS)
-- =============================================
CREATE TABLE votos (
    id SERIAL PRIMARY KEY,
    usuario_id  INTEGER REFERENCES usuarios(id),
    problema_id INTEGER REFERENCES problemas(id),
    tipo_voto   VARCHAR(10) CHECK (tipo_voto IN ('upvote', 'downvote')),
    criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(usuario_id, problema_id)
);

-- =============================================
-- TABELA DE COMENTÁRIOS
-- =============================================
CREATE TABLE comentarios (
    id SERIAL PRIMARY KEY,
    texto TEXT NOT NULL,
    usuario_id  INTEGER REFERENCES usuarios(id),
    problema_id INTEGER REFERENCES problemas(id),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- ÍNDICES PARA PERFORMANCE
-- =============================================

-- Índice geoespacial: consultas tipo "problemas num raio de X metros"
CREATE INDEX idx_problemas_localizacao
    ON problemas
    USING GIST (localizacao);

-- (Opcional) Se ainda quiser manter buscas por latitude/longitude direto:
-- CREATE INDEX idx_problemas_lat_lng ON problemas(latitude, longitude);

CREATE INDEX idx_problemas_usuario ON problemas(usuario_id);
CREATE INDEX idx_votos_usuario    ON votos(usuario_id);
CREATE INDEX idx_votos_problema   ON votos(problema_id);
CREATE INDEX idx_comentarios_problema ON comentarios(problema_id);

-- =============================================
-- USUÁRIO DE TESTE
-- (senha de exemplo criptografada com bcrypt)
-- =============================================
INSERT INTO usuarios (nome, email, senha) VALUES 
(
    'Usuário Teste', 
    'teste@email.com', 
    '$2a$12$6V8nW9bJ0zQZ5qY8x7vZ6eB5nT3cR7dE2fG4hJ6kL8mN1pQ3rS5tU7vW9xY0z2a4'
);

-- =============================================
-- COMANDOS ÚTEIS PARA MANUTENÇÃO
-- =============================================

-- Verificar tabelas criadas
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public';

-- Verificar dados de exemplo
-- SELECT * FROM usuarios;
-- SELECT * FROM problemas;

-- Limpar todos os dados (cuidado!)
-- DROP TABLE IF EXISTS comentarios, votos, problemas, usuarios;
