const defaultStations = [
    { id: 101, name: "Auto Clean VIP", date: "12 Mai 2024", plan: "Premium", active: true },
    { id: 102, name: "Mermoz Wash Express", date: "03 Juin 2024", plan: "Standard", active: true },
    { id: 103, name: "Lavage Pro Dakar", date: "15 Juil 2024", plan: "Standard", active: false }
];

document.addEventListener('DOMContentLoaded', () => {
    loadStations();
});

function loadStations() {
    let stations = [...defaultStations];
    
    // Check if the user created a custom station
    const customName = localStorage.getItem('newStationName');
    const customPlan = localStorage.getItem('newStationPlan') || 'Standard';
    const customLogo = localStorage.getItem('newStationLogo');
    
    if (customName) {
        stations.unshift({
            id: 999,
            name: customName,
            date: "Aujourd'hui",
            plan: customPlan === '50000' ? 'Premium' : 'Standard',
            active: true,
            logo: customLogo
        });
    }

    const recentContainer = document.getElementById('recent-stations');
    const tableBody = document.getElementById('stations-table-body');
    const totalCount = document.getElementById('total-stations');

    if (totalCount) {
        totalCount.innerText = stations.length;
    }

    if (recentContainer) {
        recentContainer.innerHTML = '';
        // Show top 2 recent
        stations.slice(0, 2).forEach((s, idx) => {
            recentContainer.innerHTML += `
                <div class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 animate-fade-in" style="animation-delay: ${idx * 100}ms">
                    <div class="flex items-center gap-3">
                        ${s.logo ? `<img src="${s.logo}" class="w-10 h-10 rounded-lg object-cover">` : `<div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-xl">🏢</div>`}
                        <div>
                            <h4 class="font-bold text-white">${s.name}</h4>
                            <p class="text-xs text-neutral-400">Inscrit: ${s.date}</p>
                        </div>
                    </div>
                    <span class="text-xs font-bold px-2 py-1 rounded-md ${s.plan === 'Premium' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-white'}">${s.plan}</span>
                </div>
            `;
        });
    }

    if (tableBody) {
        tableBody.innerHTML = '';
        stations.forEach((s, idx) => {
            const statusBadge = s.active 
                ? `<span class="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/20">Actif</span>`
                : `<span class="bg-red-500/20 text-red-400 text-xs font-bold px-3 py-1 rounded-full border border-red-500/20">Suspendu</span>`;
                
            const actionBtn = s.active
                ? `<button class="text-red-400 hover:text-red-300 transition-colors text-xs font-bold bg-red-500/10 px-3 py-1 rounded-md">Suspendre</button>`
                : `<button class="text-emerald-400 hover:text-emerald-300 transition-colors text-xs font-bold bg-emerald-500/10 px-3 py-1 rounded-md">Réactiver</button>`;

            tableBody.innerHTML += `
                <tr class="border-b border-white/5 hover:bg-white/5 transition-colors animate-fade-in" style="animation-delay: ${idx * 50}ms">
                    <td class="p-5 font-bold text-white flex items-center gap-3">
                        ${s.logo ? `<img src="${s.logo}" class="w-8 h-8 rounded-md object-cover">` : ''}
                        ${s.name}
                    </td>
                    <td class="p-5 text-neutral-300">${s.date}</td>
                    <td class="p-5 text-amber-400 font-bold">${s.plan}</td>
                    <td class="p-5">${statusBadge}</td>
                    <td class="p-5 text-right">${actionBtn}</td>
                </tr>
            `;
        });
    }
}

function switchAdminTab(tabId) {
    // Masquer tous les contenus
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('section').forEach(s => s.classList.remove('block'));
    
    // Retirer classe active
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
        btn.classList.remove('active', 'text-amber-500', 'bg-amber-500/10');
        btn.classList.add('text-neutral-400');
        btn.style.borderRight = 'none';
    });

    // Afficher contenu
    const section = document.getElementById('tab-' + tabId);
    if(section) {
        section.classList.remove('hidden');
        section.classList.add('block');
    }

    // Activer bouton
    const btn = document.getElementById('nav-' + tabId);
    if(btn) {
        btn.classList.add('active', 'text-amber-500', 'bg-amber-500/10');
        btn.classList.remove('text-neutral-400');
        btn.style.borderRight = '4px solid #fbbf24';
    }

    // Update Title
    const titles = {
        'overview': 'Vue d\\'ensemble SaaS',
        'stations': 'Réseau de Stations Partenaires',
        'revenue': 'Suivi des Revenus SaaS',
        'settings': 'Paramètres Plateforme'
    };
    const titleEl = document.getElementById('page-title');
    if(titleEl) titleEl.innerText = titles[tabId];
}
