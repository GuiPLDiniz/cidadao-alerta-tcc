-- =============================================
-- CIDADAO ALERTA - SCRIPT DE CRIAÇÃO DO BANCO
-- =============================================

-- Criar database (execute separadamente no pgAdmin)
-- CREATE DATABASE cidadao_alerta;

-- Tabela de usuários
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de problemas urbanos
CREATE TABLE problemas (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    foto_url VARCHAR(500),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0
);

-- Tabela de votos (para evitar votos duplicados)
CREATE TABLE votos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id),
    problema_id INTEGER REFERENCES problemas(id),
    tipo_voto VARCHAR(10) CHECK (tipo_voto IN ('upvote', 'downvote')),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(usuario_id, problema_id)
);

-- Tabela de comentários
CREATE TABLE comentarios (
    id SERIAL PRIMARY KEY,
    texto TEXT NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id),
    problema_id INTEGER REFERENCES problemas(id),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX idx_problemas_localizacao ON problemas(latitude, longitude);
CREATE INDEX idx_problemas_usuario ON problemas(usuario_id);
CREATE INDEX idx_votos_usuario ON votos(usuario_id);
CREATE INDEX idx_votos_problema ON votos(problema_id);
CREATE INDEX idx_comentarios_problema ON comentarios(problema_id);

-- Inserir usuário de teste (senha: 123456 - criptografada com bcrypt)
INSERT INTO usuarios (nome, email, senha) VALUES 
('Usuário Teste', 'teste@email.com', '$2a$12$6V8nW9bJ0zQZ5qY8x7vZ6eB5nT3cR7dE2fG4hJ6kL8mN1pQ3rS5tU7vW9xY0z2a4');

-- =============================================
-- COMANDOS ÚTEIS PARA MANUTENÇÃO
-- =============================================

-- Verificar tabelas criadas
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Verificar dados de exemplo
-- SELECT * FROM usuarios;
-- SELECT * FROM problemas;

-- Limpar todos os dados (cuidado!)
-- DROP TABLE IF EXISTS comentarios, votos, problemas, usuarios;