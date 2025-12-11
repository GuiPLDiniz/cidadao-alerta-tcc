# 🏙️ Cidadão Alerta

**Cidadão Alerta** é uma aplicação web que permite que cidadãos registrem problemas urbanos em um mapa interativo, acompanhem suas próprias denúncias e atualizem dados básicos da conta.  
A ideia é dar mais visibilidade a problemas do dia a dia (buracos, lixo, iluminação, etc.) e ajudar na organização das informações para futuros encaminhamentos ao poder público.

---

## 📌 Funcionalidades principais

- **Mapa interativo de denúncias**
  - Exibição de problemas geolocalizados usando Mapbox.
  - Pinos em formato de gota com **cores por tipo de problema**:
    - 🔴 Vermelho – buracos e bueiros  
    - 🟢 Verde – lixo e entulho  
    - ⚪ Cinza – outros problemas (inclui iluminação, sinalização etc.)
  - Clique no mapa para abrir o formulário de denúncia já com a localização preenchida.

- **Cadastro e autenticação de usuários**
  - Cadastro com nome, e-mail e senha.
  - Login com autenticação via **JWT**.
  - Senhas armazenadas com **hash (bcrypt)**.

- **Registro de denúncias**
  - Seleção do tipo de problema (buracos/bueiros, lixo/entulho, iluminação, outros).
  - Campo de descrição detalhada.
  - Upload opcional de foto.
  - Armazenamento da latitude/longitude da denúncia.

- **Minhas denúncias**
  - Listagem das denúncias feitas pelo usuário autenticado.
  - Filtros por status: **todos, abertos, em andamento, resolvidos**.
  - Exibição de título, descrição, data, local (se disponível) e votos (👍 / 👎).

- **Minha conta**
  - Visualização e edição de **nome** e **e-mail**.
  - Atualização de **senha**.
  - Atualização sincronizada com o backend e `localStorage`.

- **Ajuda**
  - Legenda explicando o significado das cores dos pinos.
  - Explicação básica de como registrar um problema.

---

## 🛠️ Tecnologias utilizadas

### Backend
- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [pg (node-postgres)](https://node-postgres.com/) – conexão com PostgreSQL
- [PostgreSQL](https://www.postgresql.org/)
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js) – hash de senhas
- [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) – autenticação JWT
- [multer](https://github.com/expressjs/multer) – upload de arquivos (fotos)
- [dotenv](https://github.com/motdotla/dotenv) – variáveis de ambiente
- [cors](https://github.com/expressjs/cors)

### Frontend
- HTML5 + CSS3 + JavaScript puro
- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) – mapa interativo
- [Font Awesome](https://fontawesome.com/) – ícones (na página inicial)

---

## 📁 Estrutura geral do projeto (sugerida)

```bash
cidadao-alerta-tcc/
├── backend/
│   ├── server.js
│   ├── package.json
│   └── .env
└── public/
    ├── index.html
    ├── login.html
    ├── mapa.html
    ├── denuncias.html
    ├── conta.html
    ├── ajuda.html
    ├── css/
    │   ├── global.css
    │   ├── index.css
    │   ├── mapa.css
    │   ├── denuncias.css
    │   ├── conta.css
    │   └── ajuda.css
    └── uploads/
        └── (fotos das denúncias salvas pelo multer)
