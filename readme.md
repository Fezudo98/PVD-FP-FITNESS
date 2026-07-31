# Sistema FP Moda Fitness (PDV & E-Commerce)

![Logo FP Moda Fitness](frontend/static/img/logo.png)

Um ecossistema completo de gestão para lojas de varejo focado em Moda Fitness. A aplicação engloba um **Ponto de Venda (PDV) físico**, um completo **Painel de Gestão Administrativa** e uma **Loja Virtual (E-Commerce)** integrada. 

Desenvolvido com uma arquitetura moderna em **Flask (Python)** orientada a App Factory, integração com Banco de Dados **PostgreSQL**, e um frontend responsivo (Mobile-First) em **Vanilla JavaScript** e **Bootstrap 5**.

---

## 🚀 Status do Projeto

**Em Produção (Deploy em VPS).** O sistema está ativo, recebendo atualizações modulares e rodando em ambiente Linux (Debian 12).

---

## ✨ Funcionalidades Principais

O sistema foi desenhado para centralizar todas as operações de uma loja moderna:

### Gestão e PDV Físico
* **Autenticação Segura:** Autenticação via JWT (JSON Web Tokens) e hashing seguro (Bcrypt).
* **Controles de Acesso (RBAC):** Níveis granulares de permissão para Administradores e Vendedores.
* **Frente de Caixa Avançado:** Leitor de código de barras USB, busca instantânea (SKU/Nome), carrinho de compras dinâmico e aplicação de cupons promocionais.
* **Emissão de Recibos:** Geração de recibos HTML e impressão térmica térmica direta.
* **Controle de Estoque Inteligente:** Baixa automática nas vendas, reposição via reembolsos, e *Soft Delete* (desativação) de produtos sem perder histórico contábil.
* **Log de Auditoria:** Registro detalhado de todas as operações sensíveis para rastreabilidade de caixas e administradores.

### E-Commerce & Loja Virtual
* **Catálogo Online:** Vitrine virtual 100% sincronizada com o estoque físico em tempo real.
* **Processamento de Pagamentos:** Integração direta com a API do **Mercado Pago** para Pix, Cartão de Crédito e Boleto.
* **Cálculo de Frete Inteligente:** Integração com a API do **Melhor Envio** para cálculo de frete dinâmico via CEP, geração de etiquetas automatizadas e rastreamento.
* **Carrinho e Checkout Dinâmicos:** Fluxo de compra fluido sem recarregamento da página, salvando o progresso da compra no `localStorage`.
* **Termos de Uso e LGPD:** Respaldo jurídico integrado no checkout (aceite obrigatório com coleta de CPF).

### Pós-Venda e CRM
* **Sistema de Feedback (NPS):** Captura automática de satisfação pós-compra do cliente, com dashboards interativos gerenciais.
* **Avaliações de Produtos (Reviews):** Clientes podem avaliar os produtos comprados e anexar fotos/vídeos. As avaliações possuem moderação total via Painel Admin com visualizações de mídia.
* **Painel Administrativo:** Dashboards em tempo real com estatísticas de vendas, ticket médio, distribuição de avaliações (Chart.js) e controle gerencial.

---

## 🛠️ Tecnologias e Arquitetura

O sistema adota o padrão de projeto *App Factory* no Backend, separando responsabilidades em Módulos (Blueprints).

### Backend
* **Python 3.10+** (Framework Web Flask)
* **Flask-SQLAlchemy & Alembic:** ORM e versionamento contínuo de banco de dados (Migrações).
* **PostgreSQL:** Banco de dados relacional oficial de produção.
* **Mercado Pago SDK:** Para pagamentos online.
* **PyJWT & Flask-Bcrypt:** Segurança criptográfica.

### Frontend
* **Mobile-First & Responsividade:** Interfaces projetadas para operar perfeitamente em telas de celulares (Bootstrap 5).
* **Vanilla JavaScript:** Toda a reatividade da Loja, do PDV e dos Paineis construída nativamente para máxima performance (Fetch API).
* **Theme Manager:** Sistema de alternância entre Modo Escuro (Dark Mode) e Modo Claro.
* **Chart.js:** Análise e visualização de KPIs no dashboard gerencial.

### Infraestrutura e Deploy
* **Servidor VPS (Debian 12)** com Gunicorn e Nginx atuando como proxy reverso.
* Script de implantação automatizada (`update_vps_deploy.py`) que roda a rotina de pull, ativa o ambiente e atualiza a aplicação em tempo real.

---

## 📂 Estrutura do Projeto

```text
/Sistema FP Fitness
├── app/                  # Núcleo da Aplicação (App Factory)
│   ├── routes/           # Blueprints: api/, store.py, views.py
│   ├── services/         # Integrações Externas (mercadopago_service.py, frete_service.py)
│   ├── __init__.py       # Inicialização do Flask
│   ├── models.py         # Modelos de Banco de Dados
│   └── utils.py          # Decorators (token_required), utilitários gerais
├── frontend/             # Código Frontend estático servido pela aplicação
│   ├── css/
│   ├── js/
│   ├── static/           # Imagens, uploads, assets
│   └── *.html            # Telas da loja e painel admin
├── migrations/           # Versionamento do Banco de Dados via Alembic
├── update_vps_deploy.py  # Script de Deploy Contínuo (CD) na VPS
├── app.py                # Ponto de entrada local
└── requirements.txt      # Dependências Python
```

---

## 👨‍💻 Autoria e Manutenção

Desenvolvido, expandido e mantido por **Fernando Sérgio**.

*   GitHub: [Fezudo98](https://github.com/Fezudo98?tab=repositories)
*   LinkedIn: [Fernando Sérgio](https://www.linkedin.com/in/fernando-s%C3%A9rgio-786560373/)
*   Instagram: [@sergioo_1918](https://www.instagram.com/sergioo_1918/) 

---

## 📄 Licença

Este projeto é protegido pela licença MIT. Consulte o arquivo `LICENSE` para mais detalhes e restrições legais.