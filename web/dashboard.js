const BASE_URL = "http://localhost:3000";

let donnees = [];
let colonneTri = null;
let sensTri = 1;
let regionActive = '';
let graphique = null;

// GET /api/regions
const getInfosRegions = async () => {
    const data = await callApi("/api/regions");
    return data;
}

// GET /api/kpi
const getKpi = async (params) => {
    return callApi("/api/kpi",params);
}

// GET /api/serie
const getSerie = async (params) => {
    return callApi("/api/serie",params);
}

// Call API
const callApi = async (chemin,params = {}) =>{
    const query = new URLSearchParams(params);
    const url = `${BASE_URL}${chemin}?${query}`;
    const response = await fetch(url);
    if (!response.ok){
        throw new Error("Erreur lors de l'appel à l'API: "+response.status+"\nURL appellée:"+url);
    }
    const myJSON = await response.json();
    return myJSON;
}

const formatMW = (v) => {
    return new Intl.NumberFormat('fr-FR').format(v);
};

const renderKpi = async () => {
    const kpi = await getKpi(regionActive ? { region: regionActive } : {});

    const dateFr = new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Paris'
    }).format(new Date(kpi.date));

    const libelle = regionActive
        ? donnees.find(r => r.code_insee === regionActive).libelle
        : 'France entière';

    document.querySelector('#kpi').innerHTML = `
        <p class="kpi-titre">${libelle} — dernière mesure du ${dateFr}</p>
        <p class="kpi-valeur">Consommation : ${formatMW(kpi.consommation)} MW</p>
        <p class="kpi-valeur">Production : ${formatMW(kpi.production)} MW</p>
    `;
};

const renderTableau = (donnees) => {
    const tbody = document.querySelector('#tableau tbody');
    tbody.innerHTML = '';

    donnees.forEach(region => {
        const tr = document.createElement('tr');
        const classe = region.taux_couverture >= 100 ? 'exporte' : 'importe';

        tr.innerHTML = `
            <td>${region.libelle}</td>
            <td>${formatMW(region.consommation_moyenne_mw)}</td>
            <td>${formatMW(region.production_moyenne_mw)}</td>
            <td class="${classe}">${region.taux_couverture} %</td>
        `;
        tbody.appendChild(tr);
    });
}

const renderGraphique = async () => {
    const serie = await getSerie(regionActive ? { region: regionActive } : {});

    const formatHeure = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'short',
        hour: '2-digit',
        timeZone: 'Europe/Paris'
    });

    const labels = serie.map(p => formatHeure.format(new Date(p.heure)));

    if (graphique) {
        graphique.destroy();
    }

    graphique = new Chart(document.querySelector('#graphique'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Consommation (MW)',
                    data: serie.map(p => p.consommation_mw),
                    borderColor: '#c62828',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.3
                },
                {
                    label: 'Production (MW)',
                    data: serie.map(p => p.production_mw),
                    borderColor: '#2e7d32',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { maxTicksLimit: 14 } },
                y: { beginAtZero: true, title: { display: true, text: 'MW' } }
            }
        }
    });
};



const render = () => {
    let vue = donnees;

    if (regionActive) {
        vue = vue.filter(r => r.code_insee === regionActive);
    }

    if (colonneTri) {
        vue = [...vue].sort((a, b) => {
            const va = a[colonneTri], vb = b[colonneTri];
            if (va === undefined) return 0;
            return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * sensTri;
        });
    }

    renderTableau(vue);
};

// Bloc principal
const init = async () => {
    try {
        // Charger les données une seule fois
        const reponse = await getInfosRegions();
        donnees = reponse.donnees;

        document.querySelector('#legende').textContent = `Moyennes sur les ${reponse.jours} derniers jours`;

        // Remplir le select avec les régions
        const select = document.querySelector('#filtre-region');
        donnees.forEach(region => {
            const option = document.createElement('option');
            option.value = region.code_insee;
            option.textContent = region.libelle;
            select.appendChild(option);
        });

        // KPI
        await renderKpi();

        // Graphique
        await renderGraphique();

        // listener du filtre
        select.addEventListener('change', async (e) => {
            regionActive = e.target.value;
            render();
            await renderKpi();
            await renderGraphique();
        });

        // listener du tri
        document.querySelector('#tableau thead').addEventListener('click', (e) => {
            const col = e.target.dataset.col;
            if (!col) return;

            if (col === colonneTri) {
                sensTri = -sensTri;
            } else {
                colonneTri = col;
                sensTri = 1;
            }
            render();
        });

        // Premier affichage
        render();

    } catch (e) {
        console.error(e);
    }
};

init();