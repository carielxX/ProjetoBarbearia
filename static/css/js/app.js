// static/js/app.js
// Cadastro / Login / Agendamento - BarbLab
// Requisitos: campos com ids corretos nos templates (ver instruções no final)

(() => {
    // ---------------- helpers ----------------
    const onlyDigits = s => (s || '').replace(/\D/g, '');
    const maskCPF = v => v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
    const maskPhone = v => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d{4})$/,'$1-$2');
    const maskCEP = v => v.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2');
  
    function validaCPFFrontend(cpf) {
      cpf = onlyDigits(cpf);
      if (cpf.length !== 11) return false;
      if (/^([0-9])\1+$/.test(cpf)) return false;
      const calc = t => {
        let s = 0;
        for (let i = 0; i < t; i++) s += parseInt(cpf[i]) * (t + 1 - i);
        let r = 11 - (s % 11);
        return r >= 10 ? 0 : r;
      };
      return calc(9) === parseInt(cpf[9]) && calc(10) === parseInt(cpf[10]);
    }
  
    async function viaCEP(cepRaw) {
      const cep = onlyDigits(cepRaw);
      if (cep.length !== 8) return null;
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const json = await res.json();
        if (json.erro) return null;
        return json;
      } catch (e) { return null; }
    }
  
    // small utility to set feedback text
    function setSmallText(el, text, ok) {
      if (!el) return;
      el.textContent = text;
      el.style.color = ok ? '#7aff7a' : '#ff7a7a';
    }
  
    // ---------------- DOM ready ----------------
    document.addEventListener('DOMContentLoaded', () => {
  
      // ---------- Cadastro ----------
      const cadastroForm = document.getElementById('cadastroForm');
      if (cadastroForm) {
        const cpf = document.getElementById('cpf');
        const cpfFeedback = document.getElementById('cpfFeedback');
        const cep = document.getElementById('cep');
        const cepFeedback = document.getElementById('cepFeedback');
        const endereco = document.getElementById('endereco');
        const password = document.getElementById('password');
        const password2 = document.getElementById('password2');
        const msg = document.getElementById('msg');
  
        // masks
        if (cpf) cpf.addEventListener('input', () => { cpf.value = maskCPF(cpf.value); });
        const tel = document.getElementById('telefone');
        if (tel) tel.addEventListener('input', () => { tel.value = maskPhone(tel.value); });
        if (cep) cep.addEventListener('input', () => { cep.value = maskCEP(cep.value); });
  
        // CPF validation on blur
        if (cpf) cpf.addEventListener('blur', async () => {
          const val = cpf.value;
          const ok = validaCPFFrontend(val);
          if (!ok) {
            setSmallText(cpfFeedback, 'CPF inválido', false);
            return;
          } else {
            setSmallText(cpfFeedback, 'CPF válido — verificando disponibilidade...', true);
            // try to check if CPF already exists via backend (optional endpoint)
            try {
              const checkRes = await fetch(`/api/check_cpf?cpf=${encodeURIComponent(onlyDigits(val))}`);
              if (checkRes.ok) {
                const j = await checkRes.json();
                if (j.exists) {
                  setSmallText(cpfFeedback, 'CPF já cadastrado.', false);
                } else {
                  setSmallText(cpfFeedback, 'CPF disponível', true);
                }
              } else {
                // endpoint not implemented or returns not ok — ignore silently
                setSmallText(cpfFeedback, 'CPF válido', true);
              }
            } catch (e) {
              setSmallText(cpfFeedback, 'CPF válido', true);
            }
          }
        });
  
        // CEP auto-fill
        if (cep) cep.addEventListener('blur', async () => {
          const val = cep.value;
          const data = await viaCEP(val);
          if (data) {
            setSmallText(cepFeedback, `${data.logradouro || ''} - ${data.localidade}/${data.uf}`, true);
            if (endereco) endereco.value = `${data.logradouro || ''} - ${data.bairro || ''} - ${data.localidade}/${data.uf}`;
          } else {
            setSmallText(cepFeedback, 'CEP inválido ou não encontrado', false);
          }
        });
  
        // submit
        cadastroForm.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          // clear msg
          if (msg) { msg.style.color = '#ccc'; msg.textContent = 'Enviando...'; }
  
          // basic checks
          const nome = document.getElementById('nome').value.trim();
          const cpfVal = document.getElementById('cpf').value.trim();
          const passwordVal = password ? password.value : '';
          const passwordVal2 = password2 ? password2.value : '';
  
          if (!nome || !cpfVal || !passwordVal) {
            if (msg) { msg.style.color = '#ff7675'; msg.textContent = 'Preencha nome, CPF e senha.'; }
            return;
          }
          if (!validaCPFFrontend(cpfVal)) {
            if (msg) { msg.style.color = '#ff7675'; msg.textContent = 'CPF inválido.'; }
            return;
          }
          if (passwordVal.length < 6) {
            if (msg) { msg.style.color = '#ff7675'; msg.textContent = 'Senha deve ter ao menos 6 caracteres.'; }
            return;
          }
          if (passwordVal !== passwordVal2) {
            if (msg) { msg.style.color = '#ff7675'; msg.textContent = 'Senhas não coincidem.'; }
            return;
          }
  
          // build payload
          const payload = {
            nome,
            cpf: cpfVal,
            password: passwordVal,
            email: document.getElementById('email').value.trim(),
            telefone: document.getElementById('telefone').value.trim(),
            cep: document.getElementById('cep').value.trim(),
            endereco: document.getElementById('endereco').value.trim(),
            observacoes: document.getElementById('observacoes').value.trim()
          };
  
          // send
          try {
            const res = await fetch('/api/register', {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
              if (msg) { msg.style.color = '#00b894'; msg.textContent = 'Cadastro ok — você já está logado! Redirecionando...'; }
              setTimeout(()=> window.location.href = '/agendamento', 900);
            } else {
              // backend returns error, e.g. CPF já cadastrado
              if (msg) { msg.style.color = '#ff7675'; msg.textContent = data.error || 'Erro no cadastro.'; }
            }
          } catch (err) {
            if (msg) { msg.style.color = '#ff7675'; msg.textContent = 'Erro de conexão.'; }
            console.error('Cadastro error', err);
          }
        });
      } // end cadastroForm
  
      // ----- Login form -----
      const loginForm = document.getElementById('loginForm');
      if (loginForm) {
        const cpfLogin = document.getElementById('cpf_login');
        if (cpfLogin) cpfLogin.addEventListener('input', ()=> cpfLogin.value = maskCPF(cpfLogin.value));
        loginForm.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const msg = document.getElementById('loginMsg');
          if (msg) { msg.style.color='#ccc'; msg.textContent='Entrando...'; }
          const payload = {
            cpf: document.getElementById('cpf_login').value,
            password: document.getElementById('senha_login').value
          };
          try {
            const res = await fetch('/api/login', {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
              if (msg) { msg.style.color='#00b894'; msg.textContent='Login ok. Redirecionando...'; }
              setTimeout(()=> window.location.href = '/agendamento', 700);
            } else {
              if (msg) { msg.style.color='#ff7675'; msg.textContent = data.error || 'Erro no login'; }
            }
          } catch (e) {
            if (msg) { msg.style.color='#ff7675'; msg.textContent='Erro de conexão'; }
          }
        });
      }
  
      // ----- Agendamento -----
      const agForm = document.getElementById('formAgendamento');
      if (agForm) {
        // on load verify session
        (async () => {
          try {
            const r = await fetch('/api/me');
            const me = await r.json();
            if (!me) {
              // not logged -> redirect to login
              window.location.href = '/login';
              return;
            }
            // prefill name and phone if present
            const nomeField = document.getElementById('nome');
            const telField = document.getElementById('telefone');
            if (nomeField) nomeField.value = me.nome || '';
            if (telField && me.telefone) telField.value = me.telefone;
          } catch (e) {
            window.location.href = '/login';
          }
        })();
  
        agForm.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const msg = document.getElementById('msg');
          if (msg) { msg.style.color='#ccc'; msg.textContent='Enviando...'; }
  
          const payload = {
            servico: document.getElementById('servico').value,
            barbeiro: document.getElementById('barbeiro').value,
            data: document.getElementById('data_ag').value,
            horario: document.getElementById('horario').value,
            observacoes: document.getElementById('obs') ? document.getElementById('obs').value : ''
          };
  
          if (!payload.servico || !payload.barbeiro || !payload.data || !payload.horario) {
            if (msg) { msg.style.color = '#ff7675'; msg.textContent = 'Preencha serviço, barbeiro, data e horário.'; }
            return;
          }
  
          try {
            const res = await fetch('/api/agendar', {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
              if (msg) { msg.style.color = '#00b894'; msg.textContent = 'Agendamento confirmado!'; }
              setTimeout(()=> window.location.href = '/sucesso', 900);
            } else if (res.status === 401) {
              window.location.href = '/login';
            } else {
              if (msg) { msg.style.color = '#ff7675'; msg.textContent = data.error || 'Erro ao agendar.'; }
            }
          } catch (err) {
            if (msg) { msg.style.color = '#ff7675'; msg.textContent = 'Erro de conexão.'; }
          }
        });
      }
  
    }); // end DOMContentLoaded
  
  })(); // IIFE end