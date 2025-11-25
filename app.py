import os, io, csv, re, logging
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file, flash
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

# -------------------------------------------------------------------------
# CONFIGURAÇÃO INICIAL
# -------------------------------------------------------------------------
# Aqui o programa descobre onde ele está salvo no computador
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

# Cria o caminho do arquivo do banco de dados
DB_PATH = os.path.join(BASE_DIR, "barblab.db")

# Cria o app Flask (é quem vai rodar o site)
app = Flask(__name__, template_folder="templates", static_folder="static")

# Diz ao Flask onde está o banco de dados
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_PATH}"

# Desliga avisos desnecessários
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Chave usada para manter pessoas logadas
app.secret_key = os.getenv("SECRET_KEY", "troque_em_producao")

# Ativa sistema de mensagens do console (LOG)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("barblab")

# Inicia o sistema de banco de dados
db = SQLAlchemy(app)

# -------------------------------------------------------------------------
# TABELAS DO BANCO DE DADOS
# -------------------------------------------------------------------------

# Tabela dos clientes que se cadastram
class Cliente(db.Model):
    id = db.Column(db.Integer, primary_key=True)  # identificador do cliente
    nome = db.Column(db.String(200), nullable=False)
    cpf = db.Column(db.String(20), unique=True, nullable=False)
    email = db.Column(db.String(200))
    telefone = db.Column(db.String(50))
    cep = db.Column(db.String(20))
    endereco = db.Column(db.String(300))
    observacoes = db.Column(db.Text)
    password_hash = db.Column(db.String(300), nullable=False)  # senha criptografada
    last_sms_sent = db.Column(db.DateTime, nullable=True)

    # Função para salvar senha com segurança
    def set_password(self,p): 
        self.password_hash = generate_password_hash(p)

    # Função para verificar senha no login
    def check_password(self,p): 
        return check_password_hash(self.password_hash,p)

# Tabela dos agendamentos (cortes marcados)
class Agendamento(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('cliente.id'))  # quem marcou
    nome = db.Column(db.String(200), nullable=False)  # nome do cliente
    servico = db.Column(db.String(200))               # ex: corte, barba
    barbeiro = db.Column(db.String(120))              # barbeiro escolhido
    data = db.Column(db.String(50))                   # dia
    horario = db.Column(db.String(50))                # horário
    criado_em = db.Column(db.DateTime, server_default=db.func.now())  # quando foi criado

# Tabela dos administradores (quem gerencia o sistema)
class Admin(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)

    def set_password(self,p): 
        self.password_hash = generate_password_hash(p)

    def check_password(self,p): 
        return check_password_hash(self.password_hash,p)

# Tabela para registrar envios de SMS
class SMSLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer)
    to_number = db.Column(db.String(80))
    message = db.Column(db.Text)
    sent_at = db.Column(db.DateTime, default=datetime.utcnow)
    simulated = db.Column(db.Boolean, default=True)

# -------------------------------------------------------------------------
# FUNÇÕES ÚTEIS
# -------------------------------------------------------------------------

# Remove tudo que não for número ― usado para normalizar CPF, telefone etc.
def only_digits(s): 
    return re.sub(r'\D','', (s or ''))

# Função que verifica se o CPF é válido
def valida_cpf(cpf):
    cpf = only_digits(cpf)
    # Regras básicas
    if len(cpf) != 11 or cpf == cpf[0]*11:
        return False

    # 1º dígito verificador
    s = sum(int(cpf[i]) * (10 - i) for i in range(9))
    r = (s * 10) % 11
    if r == 10: r = 0
    if r != int(cpf[9]): 
        return False

    # 2º dígito verificador
    s = sum(int(cpf[i]) * (11 - i) for i in range(10))
    r = (s * 10) % 11
    if r == 10: r = 0
    return r == int(cpf[10])

# Verifica se tem admin logado
def require_admin():
    return 'admin_id' in session

# -------------------------------------------------------------------------
# ROTAS DO SITE (TELAS)
# -------------------------------------------------------------------------

@app.route("/")
def index(): 
    return render_template("index.html")

@app.route("/cadastro")
def cadastro_page(): 
    return render_template("cadastro.html")

@app.route("/login")
def login_page(): 
    return render_template("login.html")

@app.route("/agendamento")
def agendamento_page(): 
    return render_template("agendamento.html")

@app.route("/sucesso")
def sucesso(): 
    return render_template("sucesso.html")

# -------------------------------------------------------------------------
# LOGIN DO ADMIN
# -------------------------------------------------------------------------

@app.route("/admin-login", methods=["GET", "POST"])
def admin_login_page():
    # Se enviou o formulário (POST), tenta logar
    if request.method == "POST":
        user = request.form.get("usuario")
        password = request.form.get("senha")

        admin = Admin.query.filter_by(username=user).first()

        # Confere usuário e senha
        if admin and admin.check_password(password):
            session["admin_logged"] = True
            session["admin_id"] = admin.id
            return redirect(url_for("admin_painel"))
        else:
            return render_template("admin_login.html", erro="Usuário ou senha incorretos.")

    # Se só abriu a página (GET), mostra tela de login
    return render_template("admin_login.html")

@app.route("/admin")
def admin_painel():
    # Só entra aqui se estiver logado como admin
    if not session.get("admin_logged"):
        return redirect(url_for("admin_login_page"))
    return render_template("admin.html")

@app.route("/admin-logout")
def admin_logout_page():
    # Limpa sessão e volta para login
    session.pop("admin_logged", None)
    session.pop("admin_id", None)
    flash("Você saiu do painel com sucesso!", "info")
    return redirect(url_for("admin_login_page"))

# -------------------------------------------------------------------------
# API PÚBLICA: REGISTRO, LOGIN E PERFIL
# -------------------------------------------------------------------------

@app.route("/api/register", methods=["POST"])
def api_register():
    # Recebe os dados enviados pela aplicação
    data = request.json or {}

    nome = (data.get("nome") or "").strip()
    cpf = only_digits(data.get("cpf") or "")
    password = (data.get("password") or "").strip()

    # Verifica se mandou tudo que precisa
    if not nome or not cpf or not password:
        return jsonify({"error":"Nome, CPF e senha são obrigatórios."}), 400

    # Verifica CPF
    if not valida_cpf(cpf):
        return jsonify({"error":"CPF inválido."}), 400

    # Verifica se já existe
    if Cliente.query.filter_by(cpf=cpf).first():
        return jsonify({"error":"CPF já cadastrado."}), 400

    # Cria o cliente
    cliente = Cliente(
        nome=nome,
        cpf=cpf,
        email=data.get("email"),
        telefone=data.get("telefone"),
        cep=data.get("cep"),
        endereco=data.get("endereco"),
        observacoes=data.get("observacoes")
    )
    cliente.set_password(password)

    db.session.add(cliente)
    db.session.commit()

    # Mantém o cliente logado
    session['client_id'] = cliente.id

    return jsonify({"ok":True, "id": cliente.id})

@app.route("/api/login", methods=["POST"])
def api_login():
    # Recebe dados enviados
    data = request.json or {}

    cpf = only_digits(data.get("cpf") or "")
    password = (data.get("password") or "").strip()

    if not cpf or not password:
        return jsonify({"error":"CPF e senha obrigatórios."}), 400

    cliente = Cliente.query.filter_by(cpf=cpf).first()

    # Verifica credenciais
    if not cliente or not cliente.check_password(password):
        return jsonify({"error":"CPF ou senha incorretos."}), 401

    session['client_id'] = cliente.id
    return jsonify({"ok":True, "id": cliente.id})

@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.pop('client_id', None)
    return jsonify({"ok":True})

@app.route("/api/me")
def api_me():
    # Mostra dados do cliente logado
    cid = session.get('client_id')

    if not cid:
        return jsonify(None)

    c = Cliente.query.get(cid)
    if not c:
        return jsonify(None)

    return jsonify({
        "id":c.id,
        "nome":c.nome,
        "cpf":c.cpf,
        "email":c.email,
        "telefone":c.telefone
    })

# -------------------------------------------------------------------------
# API PARA AGENDAR HORÁRIOS
# -------------------------------------------------------------------------

@app.route("/api/agendar", methods=["POST"])
def api_agendar():
    # Só deixa agendar se estiver logado
    if 'client_id' not in session:
        return jsonify({"error":"Autenticação necessária."}), 401

    data = request.json or {}

    servico = (data.get("servico") or "").strip()
    barbeiro = (data.get("barbeiro") or "").strip()
    data_ag = (data.get("data") or "").strip()
    horario = (data.get("horario") or "").strip()

    # Confere se mandou tudo
    if not servico or not barbeiro or not data_ag or not horario:
        return jsonify({"error":"Serviço, barbeiro, data e horário são obrigatórios."}), 400

    # Pega o cliente logado
    cliente = Cliente.query.get(session['client_id'])

    # Cria agendamento
    ag = Agendamento(
        cliente_id=cliente.id,
        nome=cliente.nome,
        servico=servico,
        barbeiro=barbeiro,
        data=data_ag,
        horario=horario
    )

    db.session.add(ag)
    db.session.commit()

    return jsonify({"ok":True, "id": ag.id})

# -------------------------------------------------------------------------
# API DO ADMIN PARA CONSULTAR / REMOVER
# -------------------------------------------------------------------------

@app.route("/api/admin/clients")
def admin_clients():
    # Só entra se for admin
    if not session.get("admin_logged"):
        return jsonify({"error":"unauthorized"}), 401

    clients = Cliente.query.order_by(Cliente.id.desc()).all()

    # Converte objetos em lista de dicionários
    out = []
    for c in clients:
        out.append({
            "id":c.id,
            "nome":c.nome,
            "cpf":c.cpf,
            "email":c.email,
            "telefone":c.telefone,
            "cep":c.cep,
            "endereco":c.endereco,
            "observacoes":c.observacoes,
            "last_sms_sent": c.last_sms_sent.isoformat() if c.last_sms_sent else None
        })

    return jsonify(out)

@app.route("/api/admin/agendamentos")
def admin_agendamentos():
    # Lista agendamentos
    if not session.get("admin_logged"):
        return jsonify({"error":"unauthorized"}), 401

    ags = Agendamento.query.order_by(Agendamento.id.desc()).all()

    out = []
    for a in ags:
        out.append({
            "id":a.id,
            "cliente_id":a.cliente_id,
            "nome":a.nome,
            "servico":a.servico,
            "barbeiro":a.barbeiro,
            "data":a.data,
            "horario":a.horario,
            "criado_em": a.criado_em.isoformat() if a.criado_em else None
        })

    return jsonify(out)

@app.route("/api/admin/client/<int:id>", methods=["DELETE"])
def admin_delete_client(id):
    # Deleta cliente pelo ID
    if not session.get("admin_logged"):
        return jsonify({"error":"unauthorized"}), 401

    c = Cliente.query.get_or_404(id)
    db.session.delete(c)
    db.session.commit()

    return jsonify({"ok":True})

@app.route("/api/admin/agendamento/<int:id>", methods=["DELETE"])
def admin_delete_ag(id):
    # Deleta agendamento pelo ID
    if not session.get("admin_logged"):
        return jsonify({"error":"unauthorized"}), 401

    a = Agendamento.query.get_or_404(id)
    db.session.delete(a)
    db.session.commit()

    return jsonify({"ok":True})

@app.route("/api/admin/export_csv")
def admin_export_csv():
    # Exporta planilha com todos os clientes
    if not session.get("admin_logged"):
        return jsonify({"error":"unauthorized"}), 401

    clients = Cliente.query.order_by(Cliente.id.desc()).all()

    # Cria tabela em memória
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        'id','nome','cpf','email','telefone','cep','endereco',
        'observacoes','last_sms_sent'
    ])

    for c in clients:
        writer.writerow([
            c.id, c.nome, c.cpf,
            c.email or '',
            c.telefone or '',
            c.cep or '',
            c.endereco or '',
            c.observacoes or '',
            c.last_sms_sent.isoformat() if c.last_sms_sent else ''
        ])

    mem = io.BytesIO()
    mem.write(output.getvalue().encode('utf-8'))
    mem.seek(0)

    return send_file(mem, mimetype='text/csv', as_attachment=True, download_name='clientes.csv')

# -------------------------------------------------------------------------
# CRIA BANCO SE NÃO EXISTIR E INICIA O SISTEMA
# -------------------------------------------------------------------------

@app.cli.command("initdb")
def initdb_command():
    # Cria tabelas
    db.create_all()

    # Cria admin padrão caso não exista
    admin_user = os.getenv('ADMIN_USER','admin')
    admin_pass = os.getenv('ADMIN_PASS','1234')

    if not Admin.query.filter_by(username=admin_user).first():
        a = Admin(username=admin_user)
        a.set_password(admin_pass)
        db.session.add(a)
        db.session.commit()

    logger.info("Banco de dados pronto")

if __name__ == "__main__":
    # Se banco não existir, cria automaticamente antes de iniciar
    with app.app_context():
        if not os.path.exists(DB_PATH):
            db.create_all()
            logger.info("Banco criado automaticamente")

    app.run(debug=True)
