// =============================
// admin.js — Painel de Administração BarbLab
// =============================

document.addEventListener("DOMContentLoaded", () => {
    const tableArea = document.getElementById("tableArea");
    const tabClientes = document.getElementById("tabClientes");
    const tabAgendamentos = document.getElementById("tabAgendamentos");
  
    let currentTab = "clientes";
  
    // Alterna entre as abas
    tabClientes.addEventListener("click", () => {
      currentTab = "clientes";
      tabClientes.classList.add("active");
      tabAgendamentos.classList.remove("active");
      loadClientes();
    });
  
    tabAgendamentos.addEventListener("click", () => {
      currentTab = "agendamentos";
      tabAgendamentos.classList.add("active");
      tabClientes.classList.remove("active");
      loadAgendamentos();
    });
  
    // -------- Função para mostrar status --------
    function showStatus(msg, color = "#ccc") {
      tableArea.innerHTML = `<p style="color:${color};text-align:center;padding:10px">${msg}</p>`;
    }
  
    // -------- Clientes --------
    async function loadClientes() {
      showStatus("Carregando clientes...");
      try {
        const res = await fetch("/api/admin/clients");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao carregar clientes");
        renderClientes(data);
      } catch (err) {
        showStatus("Erro ao carregar clientes: " + err.message, "#ff7675");
      }
    }
  
    function renderClientes(clientes) {
      tableArea.innerHTML = `
        <div class="table-controls">
          <input id="searchClient" placeholder="Buscar por nome, CPF ou telefone">
          <button id="btnExport">Exportar CSV</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nome</th>
              <th>CPF</th>
              <th>Email</th>
              <th>Telefone</th>
              <th>CEP</th>
              <th>Endereço</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${clientes.map(c => `
              <tr>
                <td>${c.id}</td>
                <td>${c.nome}</td>
                <td>${c.cpf}</td>
                <td>${c.email || ""}</td>
                <td>${c.telefone || ""}</td>
                <td>${c.cep || ""}</td>
                <td>${c.endereco || ""}</td>
                <td><button class="del-client" data-id="${c.id}">🗑</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      `;
  
      document.getElementById("btnExport").addEventListener("click", () => {
        window.location.href = "/api/admin/export_csv";
      });
  
      document.querySelectorAll(".del-client").forEach(b => {
        b.addEventListener("click", e => deleteCliente(e.target.dataset.id));
      });
  
      document.getElementById("searchClient").addEventListener("input", e => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll("tbody tr").forEach(row => {
          row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none";
        });
      });
    }
  
    async function deleteCliente(id) {
      if (!confirm("Tem certeza que deseja excluir este cliente?")) return;
      try {
        const res = await fetch(`/api/admin/client/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao excluir");
        alert("Cliente excluído!");
        loadClientes();
      } catch (err) {
        alert("Erro: " + err.message);
      }
    }
  
    // -------- Agendamentos --------
    async function loadAgendamentos() {
      showStatus("Carregando agendamentos...");
      try {
        const res = await fetch("/api/admin/agendamentos");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao carregar agendamentos");
        renderAgendamentos(data);
      } catch (err) {
        showStatus("Erro ao carregar agendamentos: " + err.message, "#ff7675");
      }
    }
  
    function renderAgendamentos(ags) {
      tableArea.innerHTML = `
        <div class="table-controls">
          <input id="searchAg" placeholder="Buscar por nome, serviço ou barbeiro">
          <button id="btnExportAg">Exportar CSV</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Serviço</th>
              <th>Barbeiro</th>
              <th>Data</th>
              <th>Horário</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${ags.map(a => `
              <tr>
                <td>${a.id}</td>
                <td>${a.nome}</td>
                <td>${a.servico}</td>
                <td>${a.barbeiro || ""}</td>
                <td>${a.data || ""}</td>
                <td>${a.horario || ""}</td>
                <td><button class="del-ag" data-id="${a.id}">🗑</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      `;
  
      document.getElementById("btnExportAg").addEventListener("click", () => {
        window.location.href = "/api/admin/export_csv";
      });
  
      document.querySelectorAll(".del-ag").forEach(b => {
        b.addEventListener("click", e => deleteAgendamento(e.target.dataset.id));
      });
  
      document.getElementById("searchAg").addEventListener("input", e => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll("tbody tr").forEach(row => {
          row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none";
        });
      });
    }
  
    async function deleteAgendamento(id) {
      if (!confirm("Excluir agendamento?")) return;
      try {
        const res = await fetch(`/api/admin/agendamento/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao excluir");
        alert("Agendamento excluído!");
        loadAgendamentos();
      } catch (err) {
        alert("Erro: " + err.message);
      }
    }
  
    // -------- Inicialização --------
    loadClientes();
  });