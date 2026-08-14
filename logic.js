// Simulation d'une base de données Firebase
const defaultQueue = [
    { id: 1, client: "Amadou D.", vehicle: "Toyota Corolla", service: "Lavage Complet", status: "attente", paid: true },
    { id: 2, client: "Fatou S.", vehicle: "Hyundai Tucson", service: "Lavage Simple", status: "attente", paid: false },
    { id: 3, client: "Oumar N.", vehicle: "Peugeot 3008", service: "Lavage Moteur", status: "attente", paid: true },
    { id: 4, client: "Moussa B.", vehicle: "Citroën C3", service: "Lavage Simple", status: "attente", paid: true },
];

let queue = JSON.parse(localStorage.getItem('washQueue')) || defaultQueue;
let activeWashes = JSON.parse(localStorage.getItem('activeWashes')) || [];

const defaultEmployees = [
    { id: 1, name: "Moussa Diop", role: "Superviseur", present: true, washesToday: 3 },
    { id: 2, name: "Alioune Fall", role: "Laveur", present: true, washesToday: 5 },
    { id: 3, name: "Ibrahima N.", role: "Laveur", present: false, washesToday: 0 }
];
let employees = JSON.parse(localStorage.getItem('washEmployees')) || defaultEmployees;

const defaultTransactions = [
    { date: "Aujourd'hui, 14:30", client: "Amadou D.", service: "Lavage Complet", method: "Wave", amount: 5000 },
    { date: "Aujourd'hui, 12:15", client: "Ousmane S.", service: "Lavage Simple", method: "Espèces", amount: 2500 },
    { date: "Aujourd'hui, 09:40", client: "Awa N.", service: "Lavage Moteur", method: "Orange Money", amount: 4000 },
    { date: "Hier, 17:20", client: "Client Anonyme", service: "Lavage Simple", method: "Espèces", amount: 2500 },
    { date: "Hier, 15:10", client: "Cheikh T.", service: "Lavage Complet", method: "Wave", amount: 5000 },
];
let transactions = JSON.parse(localStorage.getItem('washTransactions')) || defaultTransactions;

const defaultPricingConfig = {
    "Moto": { "Lavage Simple": 1000, "Lavage Complet": 2000, "Lavage Moteur": 1500 },
    "Particulier": { "Lavage Simple": 2500, "Lavage Complet": 5000, "Lavage Moteur": 4000 },
    "Transport": { "Lavage Simple": 3000, "Lavage Complet": 6000, "Lavage Moteur": 5000 },
    "Camion": { "Lavage Simple": 10000, "Lavage Complet": 20000, "Lavage Moteur": 15000 }
};
let pricingConfig = JSON.parse(localStorage.getItem('washPricingConfig')) || defaultPricingConfig;

const defaultDurationConfig = {
    "Moto": { "Lavage Simple": 10, "Lavage Complet": 20, "Lavage Moteur": 15 },
    "Particulier": { "Lavage Simple": 15, "Lavage Complet": 30, "Lavage Moteur": 25 },
    "Transport": { "Lavage Simple": 20, "Lavage Complet": 40, "Lavage Moteur": 35 },
    "Camion": { "Lavage Simple": 30, "Lavage Complet": 45, "Lavage Moteur": 40 }
};
let durationConfig = JSON.parse(localStorage.getItem('washDurationConfig')) || defaultDurationConfig;

function saveState() {
    localStorage.setItem('washQueue', JSON.stringify(queue));
    localStorage.setItem('activeWashes', JSON.stringify(activeWashes));
    localStorage.setItem('washEmployees', JSON.stringify(employees));
    localStorage.setItem('washTransactions', JSON.stringify(transactions));
    localStorage.setItem('washPricingConfig', JSON.stringify(pricingConfig));
    localStorage.setItem('washDurationConfig', JSON.stringify(durationConfig));
}

// --- DOM ELEMENTS ---
const queueContainer = document.getElementById('queue-container');
const activeWashContainer = document.getElementById('active-wash-container');
const posVehicules = document.getElementById('pos-vehicules');
const posTemps = document.getElementById('pos-temps');

// --- FONCTIONS ADMIN: NAVIGATION (SPA) ---
function switchTab(tabId) {
    // Cacher tous les contenus
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
    });
    // Réinitialiser les styles des boutons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-blue-500/10', 'text-blue-400');
        btn.classList.add('text-neutral-400');
    });

    // Activer le contenu
    document.getElementById(`tab-${tabId}`).classList.add('active');
    
    // Activer le bouton (on cherche le bouton qui a onclick="switchTab('tabId')")
    const activeBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if(activeBtn) {
        activeBtn.classList.remove('text-neutral-400');
        activeBtn.classList.add('bg-blue-500/10', 'text-blue-400');
    }
}

// --- FONCTIONS ADMIN: QUEUE ---
function renderAdminQueue() {
    if(!queueContainer) return;
    queueContainer.innerHTML = '';
    
    if (queue.length === 0) {
        queueContainer.innerHTML = `<tr><td colspan="5" class="p-12 text-center text-neutral-500 font-medium">La file d'attente est vide.</td></tr>`;
        return;
    }

    queue.forEach((item, index) => {
        const paymentBadge = item.paid 
            ? `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-full text-xs font-bold">💳 Payé</span>`
            : `<span class="bg-neutral-800 text-neutral-300 border border-white/10 px-2 py-1 rounded-full text-xs font-bold">💵 Sur place</span>`;

        const encaisseButton = !item.paid 
            ? `<button onclick="validatePayment(${item.id})" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-md transition-colors mr-2 shadow-lg shadow-emerald-500/20">💰 Encaisser</button>`
            : '';

        const actionButtons = encaisseButton + `<button onclick="startWash(${item.id})" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-md transition-colors mr-2 shadow-lg shadow-blue-500/20">▶ Démarrer</button>`;

        const skipButton = `<button onclick="skipTurn(${item.id})" class="border border-white/10 text-neutral-400 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 text-xs font-bold px-3 py-1.5 rounded-md transition-colors">Absent</button>`;

        queueContainer.innerHTML += `
            <tr class="border-b border-white/5 hover:bg-white/5 transition-colors group">
                <td class="p-4 text-center">
                    <div class="w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center font-bold text-neutral-300 mx-auto group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">
                        ${index + 1}
                    </div>
                </td>
                <td class="p-4">
                    <p class="font-semibold text-white">${item.vehicle} <span class="text-xs text-blue-400 font-normal">(${item.category || 'Particulier'})</span></p>
                    <p class="text-sm text-neutral-400">${item.client}</p>
                </td>
                <td class="p-4 text-neutral-300">${item.service}</td>
                <td class="p-4">${paymentBadge}</td>
                <td class="p-4 text-right">
                    <div class="flex justify-end items-center">
                        ${actionButtons}
                        ${skipButton}
                    </div>
                </td>
            </tr>
        `;
    });
}

function renderActiveWash() {
    if(!activeWashContainer) return;
    if (activeWashes.length === 0) {
        activeWashContainer.innerHTML = `
            <div class="p-8 border border-dashed border-emerald-500/20 rounded-2xl text-center text-emerald-500/50 font-medium">
                Aucun véhicule en cours de lavage
            </div>
        `;
        return;
    }
    
    activeWashContainer.innerHTML = activeWashes.map(wash => `
        <div class="glass-card rounded-2xl border-emerald-500/30 bg-emerald-500/5 relative overflow-hidden mb-4">
            <div class="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
            <div class="p-6">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="font-bold text-lg text-white">${wash.vehicle} <span class="text-xs text-blue-400 font-normal">(${wash.category || 'Particulier'})</span></h3>
                        <p class="text-neutral-400 text-sm">${wash.client}</p>
                        ${wash.assignedTo ? `<p class="text-xs text-emerald-400 mt-1 flex items-center gap-1"><span>👤</span> Assigné à: ${wash.assignedTo}</p>` : ''}
                    </div>
                    <span class="bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse shadow-lg shadow-emerald-500/20">En cours</span>
                </div>
                <div class="flex justify-between items-center text-sm text-neutral-300 mb-6 border-t border-white/5 pt-4">
                    <span class="font-medium">${wash.service}</span>
                    <span class="flex items-center gap-1 text-emerald-400 font-medium">
                        ⏱ ~15 min restantes
                    </span>
                </div>
                <div class="flex gap-2">
                    ${!wash.paid ? `<button onclick="validatePayment(${wash.id})" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-transform active:scale-95 shadow-lg shadow-emerald-900/50">💰 Encaisser</button>` : ''}
                    <button onclick="endWash(${wash.id})" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-transform active:scale-95 shadow-lg shadow-blue-900/50">
                        ✅ Terminer
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

let pendingWashId = null;

function startWash(id) {
    pendingWashId = id;
    const modal = document.getElementById('assign-employee-modal');
    const select = document.getElementById('assign-employee-select');
    if (modal && select) {
        select.innerHTML = employees.filter(e => e.present).map(e => `<option value="${e.id}">${e.name} (${e.role})</option>`).join('');
        
        document.getElementById('confirm-assign-btn').onclick = confirmStartWash;
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        // Fallback si on n'est pas sur dashboard-admin
        confirmStartWashFallback(id);
    }
}

function closeAssignModal() {
    const modal = document.getElementById('assign-employee-modal');
    if(modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
        pendingWashId = null;
    }
}

function confirmStartWash() {
    if(!pendingWashId) return;
    const select = document.getElementById('assign-employee-select');
    const employeeId = parseInt(select.value);
    
    const employee = employees.find(e => e.id === employeeId);
    
    const index = queue.findIndex(item => item.id === pendingWashId);
    if (index !== -1 && employee) {
        const item = queue.splice(index, 1)[0];
        item.assignedTo = employee.name;
        activeWashes.push(item);
        
        employee.washesToday++;
        
        saveState();
        updateUI();
        if(typeof renderTeam === 'function') renderTeam();
    }
    closeAssignModal();
}

function confirmStartWashFallback(id) {
    const index = queue.findIndex(item => item.id === id);
    if (index !== -1) {
        const item = queue.splice(index, 1)[0];
        activeWashes.push(item);
        saveState();
        updateUI();
    }
}

function endWash(id) {
    const index = activeWashes.findIndex(item => item.id === id);
    if (index !== -1) {
        activeWashes.splice(index, 1);
        saveState();
        updateUI();
    }
}

function skipTurn(id) {
    const index = queue.findIndex(item => item.id === id);
    if (index !== -1) {
        queue.splice(index, 1);
        saveState();
        updateUI();
    }
}

function validatePayment(id) {
    let wash = queue.find(w => w.id === id);
    if(!wash) wash = activeWashes.find(w => w.id === id);
    if(!wash || wash.paid) return;

    let cat = wash.category || "Particulier";
    let amount = 2500;
    if (pricingConfig[cat] && pricingConfig[cat][wash.service]) {
        amount = pricingConfig[cat][wash.service];
    }

    wash.paid = true;

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const newTx = {
        date: `Aujourd'hui, ${timeString}`,
        client: wash.client || "Client",
        service: wash.service,
        method: "Espèces",
        amount: amount
    };
    transactions.unshift(newTx);

    saveState();
    updateUI();
}

// --- FONCTIONS ADMIN: NOUVEAU LAVAGE & EQUIPE ---
function openNewWashModal() {
    const modal = document.getElementById('new-wash-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        updateNewWashPrice();
    }
}

function closeNewWashModal() {
    const modal = document.getElementById('new-wash-modal');
    if(modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
        document.getElementById('new-wash-form').reset();
    }
}

function updateNewWashPrice() {
    const cat = document.getElementById('nw-category').value;
    const serv = document.getElementById('nw-service').value;
    const display = document.getElementById('nw-price-display');
    if(cat && serv && display && pricingConfig[cat]) {
        const price = pricingConfig[cat][serv] || 0;
        display.innerText = price + " FCFA";
    }
}

function submitNewWash(e) {
    e.preventDefault();
    const client = document.getElementById('nw-client').value;
    const vehicle = document.getElementById('nw-vehicle').value;
    const category = document.getElementById('nw-category') ? document.getElementById('nw-category').value : 'Particulier';
    const service = document.getElementById('nw-service').value;
    const payment = document.querySelector('input[name="nw-payment"]:checked').value;
    
    const newClient = {
        id: Date.now(),
        client: client,
        vehicle: vehicle,
        category: category,
        service: service,
        status: "attente",
        paid: payment === 'paid'
    };
    queue.push(newClient);
    saveState();
    updateUI();
    closeNewWashModal();
}

function openShareModal() {
    const modal = document.getElementById('share-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeShareModal() {
    const modal = document.getElementById('share-modal');
    if(modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
}

function copyClientLink() {
    const input = document.getElementById('share-url');
    if(input) {
        input.select();
        input.setSelectionRange(0, 99999); // For mobile devices
        navigator.clipboard.writeText(input.value).then(() => {
            alert("Lien copié dans le presse-papier !");
        });
    }
}

function sendWhatsApp() {
    const url = "https://cleancargalsen.com/dashboard-client.html";
    const text = encodeURIComponent(`Bonjour ! Vous pouvez suivre l'avancement de votre lavage chez Clean Car Galsen en temps réel ici : ${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
}

function renderTeam() {
    const container = document.getElementById('team-container');
    if(!container) return;
    
    container.innerHTML = employees.map(emp => `
        <div class="glass-card rounded-2xl p-6 ${emp.present ? 'border-t-2 border-emerald-500' : 'border-t-2 border-neutral-700 opacity-70'} relative transition-all">
            <div class="flex justify-between items-start mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-full bg-blue-900/30 border border-blue-500/30 flex items-center justify-center text-xl font-bold text-blue-400">
                        ${emp.name.charAt(0)}
                    </div>
                    <div>
                        <h3 class="font-bold text-white text-lg">${emp.name}</h3>
                        <p class="text-neutral-400 text-sm">${emp.role}</p>
                    </div>
                </div>
                <button onclick="togglePresence(${emp.id})" class="px-3 py-1 rounded-full text-xs font-bold border transition-colors ${emp.present ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700'}">
                    ${emp.present ? 'Présent' : 'Absent'}
                </button>
            </div>
            <div class="bg-black/30 rounded-xl p-4 border border-white/5 flex justify-between items-center">
                <span class="text-sm text-neutral-400">Véhicules lavés (Aujourd'hui)</span>
                <span class="text-2xl font-bold text-white">${emp.washesToday}</span>
            </div>
        </div>
    `).join('');
}

function togglePresence(id) {
    const emp = employees.find(e => e.id === id);
    if(emp) {
        emp.present = !emp.present;
        saveState();
        renderTeam();
    }
}

function addEmployeePrompt() {
    // Redirige vers l'onglet Paramètres pour la création propre
    switchTab('settings');
}

function submitNewEmployee(e) {
    e.preventDefault();
    const name = document.getElementById('new-emp-name').value;
    const role = document.getElementById('new-emp-role').value;
    
    if(name) {
        employees.push({
            id: Date.now(),
            name: name,
            role: role,
            present: true,
            washesToday: 0
        });
        saveState();
        renderTeam();
        alert("Employé créé avec succès ! Il est visible dans l'onglet Équipe.");
        document.getElementById('new-emp-name').value = '';
    }
}

// --- FONCTIONS ADMIN: TRANSACTIONS & ANALYTICS ---
function renderTransactions() {
    const container = document.getElementById('transactions-container');
    if(!container) return;
    
    container.innerHTML = transactions.map((t, index) => `
        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
            <td class="p-4 text-neutral-400 text-sm">${t.date}</td>
            <td class="p-4 font-medium">${t.client}</td>
            <td class="p-4 text-neutral-300 text-sm">${t.service}</td>
            <td class="p-4">
                <span class="bg-white/5 border border-white/10 px-2 py-1 rounded-full text-xs font-medium">${t.method}</span>
            </td>
            <td class="p-4 text-right font-bold text-white">${t.amount} FCFA</td>
            <td class="p-4 text-right flex justify-end gap-2">
                <button onclick="printReceipt(${index})" class="text-blue-400 hover:bg-blue-500/10 p-2 rounded-lg transition-colors" title="Imprimer Reçu">🖨️</button>
                <button onclick="shareReceiptWhatsApp(${index})" class="text-emerald-400 hover:bg-emerald-500/10 p-2 rounded-lg transition-colors" title="Envoyer par WhatsApp">💬</button>
            </td>
        </tr>
    `).join('');
}

function printReceipt(index) {
    const t = transactions[index];
    if(!t) return;
    
    const stationName = localStorage.getItem('newStationName') || 'Auto Clean VIP';
    
    const receiptHTML = `
        <html>
        <head>
            <title>Reçu - ${t.client}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; text-align: center; color: #000; }
                .receipt { border: 1px dashed #ccc; padding: 20px; max-width: 300px; margin: 0 auto; }
                .header { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
                .date { font-size: 12px; color: #555; margin-bottom: 20px; }
                .item { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
                .total { font-weight: bold; font-size: 18px; margin-top: 20px; border-top: 1px solid #000; padding-top: 10px; display: flex; justify-content: space-between; }
                .footer { margin-top: 30px; font-size: 12px; color: #777; }
            </style>
        </head>
        <body>
            <div class="receipt">
                <div class="header">${stationName}</div>
                <div class="date">${t.date}</div>
                <div class="item"><span>Client:</span> <span>${t.client}</span></div>
                <div class="item"><span>Service:</span> <span>${t.service}</span></div>
                <div class="item"><span>Méthode:</span> <span>${t.method}</span></div>
                <div class="total"><span>TOTAL:</span> <span>${t.amount} FCFA</span></div>
                <div class="footer">Merci de votre visite !</div>
            </div>
            <script>
                window.onload = function() { window.print(); window.close(); }
            </script>
        </body>
        </html>
    `;
    
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.open();
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
}

function shareReceiptWhatsApp(index) {
    const t = transactions[index];
    if(!t) return;
    
    const stationName = localStorage.getItem('newStationName') || 'Auto Clean VIP';
    
    const text = `*Reçu de Paiement - ${stationName}*\n\n📅 Date : ${t.date}\n👤 Client : ${t.client}\n🚗 Service : ${t.service}\n💳 Méthode : ${t.method}\n\n💰 *Total : ${t.amount} FCFA*\n\nMerci de votre confiance !`;
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
}

function setChartFilter(btn) {
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.className = 'px-3 py-1 rounded-md text-neutral-400 hover:text-white transition-all filter-btn';
    });
    btn.className = 'px-3 py-1 rounded-md bg-white/10 text-white font-medium shadow transition-all filter-btn';
}

// --- FONCTIONS PROFIL ---
function loadStationProfile() {
    const storedName = localStorage.getItem('newStationName');
    const storedPlan = localStorage.getItem('newStationPlan');
    const storedLogo = localStorage.getItem('newStationLogo');
    
    if (storedName) {
        const nameEl = document.getElementById('sidebar-station-name');
        if(nameEl) nameEl.innerText = storedName;
        
        const settingsNameEl = document.getElementById('settings-station-name');
        if(settingsNameEl) settingsNameEl.value = storedName;
    }
    
    if (storedPlan) {
        const planEl = document.getElementById('sidebar-station-plan');
        if(planEl) {
            if (storedPlan === 'starter') planEl.innerText = '⭐ Starter';
            else if (storedPlan === 'pro') planEl.innerText = '⭐ Offre Pro';
            else if (storedPlan === 'entreprise') planEl.innerText = '⭐ Entreprise';
        }
    }
    
    if (storedLogo) {
        const logoEl = document.getElementById('sidebar-station-logo');
        if(logoEl) logoEl.src = storedLogo;
    }
}

function saveStationProfile() {
    const nameInput = document.getElementById('settings-station-name');
    if(nameInput && nameInput.value) {
        localStorage.setItem('newStationName', nameInput.value);
        loadStationProfile();
        alert("Profil enregistré avec succès !");
    }
}

// --- FONCTIONS CLIENT ---
function getEstimatedWaitTime(clientIndexPos) {
    let totalWaitTime = 0;
    
    // 1. Temps des véhicules en cours
    activeWashes.forEach(wash => {
        const cat = wash.category || "Particulier";
        const serv = wash.service || "Lavage Simple";
        const time = (durationConfig[cat] && durationConfig[cat][serv]) ? durationConfig[cat][serv] : 30;
        totalWaitTime += (time / 2); // à mi-chemin
    });

    // 2. Temps des véhicules devant
    for (let i = 0; i < clientIndexPos; i++) {
        const wash = queue[i];
        const cat = wash.category || "Particulier";
        const serv = wash.service || "Lavage Simple";
        const time = (durationConfig[cat] && durationConfig[cat][serv]) ? durationConfig[cat][serv] : 30;
        totalWaitTime += time;
    }

    // Nombre de laveurs présents
    const activeEmployees = employees.filter(e => e.present).length || 1;
    return Math.round(totalWaitTime / activeEmployees);
}

function updateClientDashboard() {
    if(posVehicules && posTemps) {
        const pos = queue.length;
        posVehicules.innerText = pos;
        
        const totalMinutes = getEstimatedWaitTime(pos);
        posTemps.innerHTML = `${totalMinutes}<span class="text-2xl">m</span>`;
        
        const progressBar = document.getElementById('client-progress-bar');
        const progressText = document.getElementById('client-progress-text');
        if(progressBar && progressText) {
            let percentage = 100;
            if (pos >= 4) percentage = 10;
            else if (pos === 3) percentage = 30;
            else if (pos === 2) percentage = 60;
            else if (pos === 1) percentage = 85;
            else if (pos === 0) percentage = 100;
            
            progressBar.style.width = `${percentage}%`;
            
            if(pos === 0) {
                progressText.innerText = "C'est votre tour !";
            } else {
                progressText.innerText = `En attente (${percentage}%)`;
            }
        }
    }
}

function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
}

function addNotificationItem(title, desc) {
    const list = document.getElementById('notification-list');
    const titleEl = document.getElementById('notification-title');
    if (!list) return;
    
    const html = `
        <div class="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-2 flex gap-3 items-start cursor-pointer hover:bg-blue-500/20 transition-colors animate-fade-in">
            <div class="text-xl">🔔</div>
            <div>
                <p class="text-sm text-white font-bold">${title}</p>
                <p class="text-xs text-blue-400 mt-0.5">${desc}</p>
            </div>
        </div>
    `;
    list.insertAdjacentHTML('afterbegin', html);
    if(titleEl) {
        titleEl.innerText = "Nouvelle Notification";
        titleEl.classList.add('text-blue-400');
    }
}

// Écouteur pour la synchronisation inter-onglets
window.addEventListener('storage', (e) => {
    if (e.key === 'washQueue' || e.key === 'activeWashes') {
        queue = JSON.parse(localStorage.getItem('washQueue')) || defaultQueue;
        activeWashes = JSON.parse(localStorage.getItem('activeWashes')) || [];
        
        // Si c'est l'espace client, on joue un son et on notifie
        if (e.key === 'washQueue' && window.location.pathname.includes('dashboard-client.html')) {
            playNotificationSound();
            if(queue.length > 0) {
                addNotificationItem("Un véhicule a terminé !", `Il reste ${queue.length} véhicule(s) avant vous. Temps estimé : ${queue.length * 15} min.`);
            } else {
                addNotificationItem("C'est à vous !", "Veuillez vous diriger vers la piste de lavage.");
            }
        }
        
        updateUI();
    }
});

// --- MODALE DE RÉSERVATION CLIENT ---
function loadNearbyStations() {
    const container = document.getElementById('station-list-container');
    if (!container) return;
    
    const customName = localStorage.getItem('newStationName');
    const customLogo = localStorage.getItem('newStationLogo');
    
    let html = '';
    
    // Si une station a été créée par l'utilisateur
    if (customName) {
        html += `
            <label class="block cursor-pointer group animate-fade-in">
                <input type="radio" name="station" class="peer sr-only" checked>
                <div class="p-4 rounded-xl border border-white/10 bg-white/5 peer-checked:bg-blue-600/20 peer-checked:border-blue-500 hover:bg-white/10 transition-all flex items-center justify-between group-active:scale-[0.98]">
                    <div class="flex items-center gap-4">
                        ${customLogo ? `<img src="${customLogo}" class="w-12 h-12 rounded-lg object-cover">` : `<div class="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center text-2xl">🏢</div>`}
                        <div>
                            <h4 class="font-bold text-white">${customName}</h4>
                            <p class="text-xs text-neutral-400">Votre nouvelle station • À 1.2 km</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-1 rounded-full">Disponible</span>
                    </div>
                </div>
            </label>
        `;
    }
    
    // Stations par défaut
    html += `
        <label class="block cursor-pointer group animate-fade-in" style="animation-delay: 100ms">
            <input type="radio" name="station" class="peer sr-only" ${!customName ? 'checked' : ''}>
            <div class="p-4 rounded-xl border border-white/10 bg-white/5 peer-checked:bg-blue-600/20 peer-checked:border-blue-500 hover:bg-white/10 transition-all flex items-center justify-between group-active:scale-[0.98]">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center text-2xl">🚗</div>
                    <div>
                        <h4 class="font-bold text-white">Auto Clean VIP</h4>
                        <p class="text-xs text-neutral-400">Plateau • À 2.4 km</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="bg-orange-500/20 text-orange-400 text-[10px] font-bold px-2 py-1 rounded-full">Forte affluence</span>
                </div>
            </div>
        </label>

        <label class="block cursor-pointer group animate-fade-in" style="animation-delay: 200ms">
            <input type="radio" name="station" class="peer sr-only">
            <div class="p-4 rounded-xl border border-white/10 bg-white/5 peer-checked:bg-blue-600/20 peer-checked:border-blue-500 hover:bg-white/10 transition-all flex items-center justify-between group-active:scale-[0.98]">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center text-2xl">✨</div>
                    <div>
                        <h4 class="font-bold text-white">Mermoz Wash Express</h4>
                        <p class="text-xs text-neutral-400">Mermoz • À 4.1 km</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-1 rounded-full">Fluide</span>
                </div>
            </div>
        </label>
    `;
    
    container.innerHTML = html;
}

function openReservationModal() {
    const modal = document.getElementById('reservation-modal');
    if (modal) {
        loadNearbyStations();
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        nextReservationStep(1); // Réinitialiser à l'étape 1
    }
}

function closeReservationModal() {
    const modal = document.getElementById('reservation-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
}

function nextReservationStep(stepNumber) {
    document.getElementById('res-step-1').classList.add('hidden');
    document.getElementById('res-step-2').classList.add('hidden');
    document.getElementById('res-step-3').classList.add('hidden');
    document.getElementById('res-success').classList.add('hidden');
    
    document.getElementById('res-step-' + stepNumber).classList.remove('hidden');
}

function submitReservation() {
    // Masquer toutes les étapes
    document.getElementById('res-step-1').classList.add('hidden');
    document.getElementById('res-step-2').classList.add('hidden');
    document.getElementById('res-step-3').classList.add('hidden');
    
    // Afficher succès
    document.getElementById('res-success').classList.remove('hidden');
    
    // Simulation : Ajout d'un client dans la file globale
    const newClient = { 
        id: Date.now(), 
        client: "Vous (Nouveau)", 
        vehicle: "Votre Véhicule", 
        service: "Lavage Choisi", 
        status: "attente", 
        paid: true 
    };
    queue.push(newClient);
    saveState();
    
    // Rafraîchir l'interface client locale immédiatement
    updateClientDashboard();

    // Génération du reçu visuellement dans le tableau
    const receiptsList = document.getElementById('receipts-list');
    if (receiptsList) {
        const customName = localStorage.getItem('newStationName') || 'Station Partenaire';
        const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
        const html = `
            <tr class="border-b border-white/5 hover:bg-white/5 transition-colors group animate-fade-in bg-emerald-500/10">
                <td class="p-5 text-white font-medium">${date}</td>
                <td class="p-5 font-bold text-white">${customName}</td>
                <td class="p-5 text-neutral-300">Réservation en ligne</td>
                <td class="p-5 text-emerald-400 font-bold">Payé (Wave/OM)</td>
                <td class="p-5"><span class="bg-blue-600/20 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full text-xs font-bold">À venir</span></td>
                <td class="p-5 text-right"><button onclick="alert('Simulation: Téléchargement du reçu PDF...')" class="text-blue-400 hover:text-white font-bold transition-colors">📄 PDF</button></td>
            </tr>
        `;
        receiptsList.insertAdjacentHTML('afterbegin', html);
    }
}

function updateUI() {
    renderAdminQueue();
    renderActiveWash();
    updateClientDashboard();
    renderTransactions();
    if (typeof renderTeam === 'function') renderTeam();
    if (typeof renderPricingTable === 'function') renderPricingTable();
    if (typeof renderDurationConfig === 'function') renderDurationConfig();
}

function renderPricingTable() {
    const tbody = document.getElementById('pricing-table-body');
    if(!tbody) return;
    
    const categories = ["Moto", "Particulier", "Transport", "Camion"];
    let html = '';
    
    categories.forEach(cat => {
        const prices = pricingConfig[cat] || { "Lavage Simple": 0, "Lavage Complet": 0, "Lavage Moteur": 0 };
        html += `
            <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td class="py-3 px-2 font-medium text-white">${cat}</td>
                <td class="py-3 px-2">
                    <input type="number" id="price-${cat}-simple" value="${prices["Lavage Simple"]}" class="w-24 bg-black/50 border border-white/20 rounded p-1 text-white focus:outline-none focus:border-blue-500">
                </td>
                <td class="py-3 px-2">
                    <input type="number" id="price-${cat}-complet" value="${prices["Lavage Complet"]}" class="w-24 bg-black/50 border border-white/20 rounded p-1 text-white focus:outline-none focus:border-blue-500">
                </td>
                <td class="py-3 px-2">
                    <input type="number" id="price-${cat}-moteur" value="${prices["Lavage Moteur"]}" class="w-24 bg-black/50 border border-white/20 rounded p-1 text-white focus:outline-none focus:border-blue-500">
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function savePricingConfig() {
    const categories = ["Moto", "Particulier", "Transport", "Camion"];
    categories.forEach(cat => {
        if(!pricingConfig[cat]) pricingConfig[cat] = {};
        
        const simple = document.getElementById(`price-${cat}-simple`);
        const complet = document.getElementById(`price-${cat}-complet`);
        const moteur = document.getElementById(`price-${cat}-moteur`);
        
        if(simple) pricingConfig[cat]["Lavage Simple"] = parseInt(simple.value) || 0;
        if(complet) pricingConfig[cat]["Lavage Complet"] = parseInt(complet.value) || 0;
        if(moteur) pricingConfig[cat]["Lavage Moteur"] = parseInt(moteur.value) || 0;
    });
    
    saveState();
    alert("Grille tarifaire enregistrée avec succès !");
}

function renderDurationConfig() {
    const container = document.getElementById('duration-config-container');
    if(!container) return;
    
    const categories = ["Moto", "Particulier", "Transport", "Camion"];
    let html = '';
    
    categories.forEach(cat => {
        const time = durationConfig[cat] && durationConfig[cat]["Lavage Simple"] ? durationConfig[cat]["Lavage Simple"] : 30;
        html += `
            <div class="bg-black/40 p-4 rounded-xl border border-white/10 flex flex-col justify-between">
                <div>
                    <h4 class="font-bold text-white text-sm">${cat}</h4>
                    <p class="text-xs text-neutral-400 mb-2">Temps de base estimé</p>
                </div>
                <div class="flex items-center gap-2 mt-auto">
                    <input type="number" id="duration-${cat}" value="${time}" class="w-full bg-black/50 border border-white/20 rounded p-2 text-white focus:outline-none focus:border-blue-500 text-center font-bold">
                    <span class="text-neutral-400 text-xs">min</span>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function saveDurationConfig() {
    const categories = ["Moto", "Particulier", "Transport", "Camion"];
    categories.forEach(cat => {
        if(!durationConfig[cat]) durationConfig[cat] = {};
        
        const input = document.getElementById(`duration-${cat}`);
        if(input) {
            const val = parseInt(input.value) || 30;
            durationConfig[cat]["Lavage Simple"] = val;
            // Pour simplifier l'HTML, on ajuste les autres temps proportionnellement
            durationConfig[cat]["Lavage Complet"] = Math.round(val * 1.5);
            durationConfig[cat]["Lavage Moteur"] = Math.round(val * 1.2);
        }
    });
    
    saveState();
    updateUI();
    alert("Algorithme d'estimation mis à jour avec succès !");
}

function initChart() {
    const ctx = document.getElementById('analyticsChart');
    if (!ctx) return;
    
    if (typeof Chart === 'undefined') {
        setTimeout(initChart, 200);
        return;
    }
    
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
            datasets: [{
                label: 'Fréquentation',
                data: [45, 52, 38, 65, 89, 120, 105],
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#171717',
                pointBorderColor: '#3b82f6',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false
                }
            },
            scales: {
                y: { display: false, beginAtZero: true },
                x: { display: false }
            },
            interaction: {
                intersect: false,
                mode: 'index',
            }
        }
    });
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadStationProfile();
    updateUI();
    initChart();
});
