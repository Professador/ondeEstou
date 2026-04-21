/**
 * Onde Estou - Aplicativo de Geolocalização
 * Versão corrigida e otimizada
 */

// ===== REFERÊNCIAS DO DOM =====
const lat = document.getElementById('lat');
const long = document.getElementById('long');
const btBusca = document.getElementById('busca');
const btnLimparBusca = document.getElementById('btnLimparBusca'); // NOVO BOTÃO

// ... (resto do código)

// ===== EVENTO DO BOTÃO LIMPAR BUSCA =====
if (btnLimparBusca) {
    btnLimparBusca.addEventListener('click', () => {
        lat.value = '';
        long.value = '';
        lat.focus();
        console.log('🧹 Campos de busca limpos');
    });
}

// ===== VARIÁVEIS GLOBAIS =====
let map = null;
let currentMarker = null;
let currentPolygon = null;
const dbName = "historico";
const dbVersion = 3;
let db = null;
const loadingOverlay = document.getElementById('loadingLocation');

// ===== GEOLOCALIZAÇÃO INICIAL =====
function iniciarGeolocalizacao() {
    if (!navigator.geolocation) {
        console.warn('⚠️ Geolocalização não suportada neste navegador');
        hideLoading(); // Esconde o loading
        alert('Seu navegador não suporta geolocalização. Você pode buscar coordenadas manualmente.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            const ponto = [position.coords.longitude, position.coords.latitude];

            // Atualiza display de coordenadas
            if (document.getElementById('coords3')) {
                document.getElementById('coords3').textContent = `(${ponto[1].toFixed(5)}, ${ponto[0].toFixed(5)})`;
            }

            // Converte para UTM
            try {
                const resultado = await toUtm(ponto);
                if (resultado && document.getElementById('fuso')) {
                    const eUtm = Number(resultado.e) || 0;
                    const nUtm = Number(resultado.n) || 0;
                    document.getElementById('fuso').textContent =
                        `UTM ${resultado.fuso || '?'} ${eUtm.toFixed(0)} m E, ${nUtm.toFixed(0)} m N – SIRGAS2000`;
                }
                if (resultado && document.getElementById('utm')) {
                    const eUtm = Number(resultado.e) || 0;
                    const nUtm = Number(resultado.n) || 0;
                    document.getElementById('utm').textContent =
                        `(${eUtm.toFixed(0)}, ${nUtm.toFixed(0)})`;
                }
            } catch (e) {
                console.warn('⚠️ Não foi possível converter para UTM:', e.message);
            }

            // Mostra ponto
            mostraPonto(ponto);

            // Atualiza inputs
            if (lat) lat.value = ponto[1];
            if (long) long.value = ponto[0];

            // Busca estado
            const estado = await pegaEstado(ponto);
            if (estado === 'Erro') {
                if (document.getElementById('muniNome')) {
                    document.getElementById('muniNome').innerText = "";
                }
                plotaPonto(ponto, 'map', null);
                hideLoading(); // ✅ Esconde loading
                return;
            }

            // Atualiza timestamp
            if (document.getElementById('datahora')) {
                document.getElementById('datahora').innerText = new Date(position.timestamp).toLocaleString();
            }

            // Busca município
            const muniT = await pegaMuni(ponto, estado.properties.codarea);
            plotaPonto(ponto, 'map', muniT);

            // Salva no histórico
            const posicao = {
                datahora: new Date().toLocaleString('sv-SE'),
                ponto: [ponto[1], ponto[0]],
                ufId: muniT?.properties?.estado || '',
                uf: muniT?.properties?.uf || '',
                ufNome: muniT?.properties?.ufNome || '',
                muniId: muniT?.properties?.codarea || '',
                muniNome: muniT?.properties?.nome || ''
            };

            await putPosicao(posicao, 'posicoes');
            console.log('✅ Posição inicial salva em "posicoes"');

            // ✅ ESCONDE O LOADING APÓS SUCESSO
            hideLoading();
        },
        function (error) {
            console.error('❌ Erro na geolocalização:', error.message);

            // ✅ ESCONDE O LOADING MESMO COM ERRO
            hideLoading();

            let mensagem = 'Não foi possível obter sua localização.';
            if (error.code === 1) {
                mensagem = 'Permissão de localização negada. Use o botão BUSCAR para inserir coordenadas manualmente.';
            } else if (error.code === 2) {
                mensagem = 'Localização indisponível. Verifique suas configurações.';
            } else if (error.code === 3) {
                mensagem = 'Tempo esgotado para obter localização. Tente novamente.';
            }

            alert(mensagem);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}
// ===== FUNÇÃO PARA ESCONDER LOADING =====
function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 500);
    }
}

// ... (resto do código permanece igual)

// ===== INICIALIZAÇÃO DO INDEXEDDB =====
const request = indexedDB.open(dbName, dbVersion);

request.onupgradeneeded = (event) => {
    db = event.target.result;

    try {
        // Criar tabela "posicoes" se não existir
        if (!db.objectStoreNames.contains("posicoes")) {
            const store1 = db.createObjectStore("posicoes", {
                keyPath: "id",
                autoIncrement: true
            });
            store1.createIndex('datahora', 'datahora', { unique: false });
            store1.createIndex('latitude', 'latitude', { unique: false });
            store1.createIndex('longitude', 'longitude', { unique: false });
            store1.createIndex('muniNome', 'muniNome', { unique: false });
            console.log("✅ Tabela 'posicoes' criada!");
        }

        // Criar tabela "posicoesC" se não existir
        if (!db.objectStoreNames.contains("posicoesC")) {
            const store2 = db.createObjectStore("posicoesC", {
                keyPath: "id",
                autoIncrement: true
            });
            store2.createIndex('datahora', 'datahora', { unique: false });
            store2.createIndex('latitude', 'latitude', { unique: false });
            store2.createIndex('longitude', 'longitude', { unique: false });
            store2.createIndex('muniNome', 'muniNome', { unique: false });
            console.log("✅ Tabela 'posicoesC' criada!");
        }
    } catch (error) {
        console.error("❌ Erro ao criar tabelas:", error);
    }
};

request.onsuccess = (event) => {
    db = event.target.result;
    console.log("✅ Banco de dados aberto com sucesso!");
    console.log("Tabelas existentes:", Array.from(db.objectStoreNames));

    // Inicializa o mapa após o banco estar pronto
    inicializarMapa();

    // Inicia geolocalização
    iniciarGeolocalizacao();
};

request.onerror = (event) => {
    console.error("❌ Erro no banco de dados:", event.target.error);
};

// ===== FUNÇÕES DE BANCO DE DADOS =====

function DBPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function getPosicao(id, tabela = 'posicoes') {
    return await DBPromise(
        db.transaction([tabela], 'readonly')
            .objectStore(tabela)
            .get(parseInt(id))
    );
}

async function delPosicao(id, tabela = 'posicoes') {
    return await DBPromise(
        db.transaction([tabela], 'readwrite')
            .objectStore(tabela)
            .delete(parseInt(id))
    );
}

async function putPosicao(posicao, tabela) {
    return await DBPromise(
        db.transaction([tabela], 'readwrite')
            .objectStore(tabela)
            .put(posicao)
    );
}

async function limparTabela(tabela) {
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(tabela)) {
            reject(new Error(`Tabela "${tabela}" não existe`));
            return;
        }

        const transaction = db.transaction([tabela], 'readwrite');
        const clearRequest = transaction.objectStore(tabela).clear();

        clearRequest.onsuccess = () => {
            console.log(`✅ Tabela "${tabela}" limpa com sucesso!`);
            resolve();
        };
        clearRequest.onerror = (e) => reject(e.target.error);
    });
}

async function contarRegistros(tabela) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([tabela], 'readonly');
        const countRequest = transaction.objectStore(tabela).count();

        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = (e) => reject(e.target.error);
    });
}

// ===== INICIALIZAÇÃO DO MAPA (APENAS UMA VEZ) =====

function inicializarMapa() {
    // Verifica se o container existe e tem dimensões
    const container = document.getElementById('map');
    if (!container || container.offsetHeight === 0) {
        console.error('❌ Container do mapa inválido!');
        return;
    }

    // Cria o mapa apenas se não existir
    if (!map) {
        map = L.map('map').setView([-14.2350, -51.9253], 4); // Centro do Brasil

        // Camadas base
        const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        });

        const googleStreets = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
            maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
        });

        const googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
            maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
        });

        const googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: 'Google Hybrid'
        });

        const OpenTopoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            maxZoom: 17,
            attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
        });

        osm.addTo(map);

        // Controle de camadas
        const baseMaps = {
            "OSM": osm,
            'Google Street': googleStreets,
            "Google Satellite": googleSat,
            "Google Híbrido": googleHybrid,
            "Relevo": OpenTopoMap
        };

        L.control.layers(baseMaps, null, { collapsed: true }).addTo(map);

        // Controles adicionais
        L.control.scale({ imperial: false }).addTo(map);

        // Tradução do plugin de medida
        if (L.Control && L.Control.Measure) {
            L.Measure = {
                linearMeasurement: "Distância",
                areaMeasurement: "Área",
                start: "Início",
                meter: "m",
                kilometer: "km",
                squareMeter: "m²",
                squareKilometers: "km²",
            };
            L.control.measure({}).addTo(map);
        }

        // ===== EVENTOS DO MAPA (REGISTRADOS APENAS UMA VEZ) =====

        // Mousemove: mostra coordenadas
        map.on('mousemove', (e) => {
            const coordEl = document.getElementById('coordinate');
            if (coordEl) {
                coordEl.innerText = `Lat: ${e.latlng.lat.toFixed(5)}, Long: ${e.latlng.lng.toFixed(5)}`;
            }
        });

        // Double click: captura coordenadas e processa
        map.on('dblclick', async (ev) => {
            await handleMapDblClick(ev);
        });

        console.log("✅ Mapa inicializado com sucesso!");
    }
}

// ===== TRATAMENTO DO DUPLO CLIQUE NO MAPA =====

async function handleMapDblClick(ev) {
    console.log('🖱️ Duplo clique em:', ev.latlng);

    const ponto = [ev.latlng.lng, ev.latlng.lat];

    // Atualiza inputs
    if (lat) lat.value = ponto[1];
    if (long) long.value = ponto[0];

    // Mostra ponto na UI
    mostraPonto(ponto);

    // Verifica estado
    const estado = await pegaEstado(ponto);
    if (estado === 'Erro') {
        if (document.getElementById('muniNome')) {
            document.getElementById('muniNome').innerText = "";
        }
        // Apenas atualiza o mapa com o ponto, sem polígono
        atualizarMapa(ponto, null);
        return;
    }

    // Busca município
    const muniT = await pegaMuni(ponto, estado.properties.codarea);

    // Atualiza mapa com polígono se encontrado
    atualizarMapa(ponto, muniT);

    // Salva no histórico de cliques
    const posicao = {
        datahora: new Date().toLocaleString('sv-SE'),
        ponto: [ponto[1], ponto[0]],
        ufId: muniT?.properties?.estado || '',
        uf: muniT?.properties?.uf || '',
        ufNome: muniT?.properties?.ufNome || '',
        muniId: muniT?.properties?.codarea || '',
        muniNome: muniT?.properties?.nome || ''
    };

    await putPosicao(posicao, 'posicoesC');
    console.log('✅ Posição salva em "posicoesC"');
}

// ===== ATUALIZAR MAPA (SEM REMOVER/RECRIAR) =====

function atualizarMapa(ponto, poligono) {
    if (!map) {
        console.error('❌ Mapa não inicializado!');
        return;
    }

    const pt = [ponto[1], ponto[0]];

    // Remove marker anterior se existir
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    // Adiciona novo marker
    currentMarker = L.marker(pt).addTo(map)
        .bindPopup(`${pt[0].toFixed(5)}, ${pt[1].toFixed(5)}`)
        .openPopup();

    // Remove polígono anterior se existir
    if (currentPolygon) {
        map.removeLayer(currentPolygon);
        currentPolygon = null;
    }

    // Adiciona novo polígono se fornecido
    if (poligono) {
        currentPolygon = L.geoJson(poligono, {
            style: {
                fillColor: 'red',
                fillOpacity: 0.1,
                color: 'blue',
                weight: 2
            }
        }).addTo(map);

        // Ajusta zoom para mostrar polígono
        map.fitBounds(currentPolygon.getBounds(), { padding: [20, 20] });
    } else {
        // Apenas centraliza no ponto
        map.setView(pt, 13);
    }
}

// ===== FUNÇÃO PRINCIPAL: PLOTAR PONTO (PÚBLICA) =====

/**
 * Plota um ponto no mapa (pode ser chamada múltiplas vezes)
 * @param {Array} ponto - [longitude, latitude]
 * @param {string} div - ID do container (sempre 'map')
 * @param {Object|null} poligono - GeoJSON do polígono do município
 */
function plotaPonto(ponto, div, poligono) {
    // Garante que o mapa esteja inicializado
    if (!map) {
        inicializarMapa();
        // Aguarda próxima tick para garantir que o mapa foi criado
        setTimeout(() => {
            atualizarMapa(ponto, poligono);
        }, 100);
        return;
    }

    // Atualiza o mapa existente
    atualizarMapa(ponto, poligono);
}
// ===== EVENTO DO BOTÃO DE BUSCA =====

if (btBusca) {
    btBusca.addEventListener('click', async () => {
        const lng = Number.parseFloat(long?.value);
        const la = Number.parseFloat(lat?.value);

        if (isNaN(lng) || isNaN(la)) {
            alert('Por favor, insira coordenadas válidas (números)');
            return;
        }

        const ponto = [lng, la];
        const estado = await pegaEstado(ponto);

        if (estado === 'Erro') {
            if (document.getElementById('muniNome')) {
                document.getElementById('muniNome').innerText = "";
            }
            plotaPonto(ponto, 'map', null);
            return;
        }
/*
        if (document.getElementById('datahora')) {
            document.getElementById('datahora').innerText = new Date().toLocaleString();
        }
*/
        const muniT = await pegaMuni(ponto, estado.properties.codarea);
        plotaPonto(ponto, 'map', muniT);
        mostraPonto(ponto);
    });
}

// ===== FUNÇÕES DE API DO IBGE =====

async function pegaEstado(ponto) {
    try {
        const pt = turf.point(ponto);
        const ufId = await encontrarPoligono(ufs, pt);

        if (ufId && ufId.properties?.codarea) {
            const ufObj = ufNomes?.find((el) => el.id == ufId.properties.codarea);
            if (ufObj && document.getElementById('ufNome')) {
                document.getElementById('ufNome').innerText =
                    `${ufObj.nome}`;
            }
            return ufId;
        } else {
            if (document.getElementById('ufNome')) {
                document.getElementById('ufNome').innerText =
                    `Ponto fora do Brasil: ${ponto[1].toFixed(4)}, ${ponto[0].toFixed(4)}`;
            }
            return "Erro";
        }
    } catch (error) {
        console.error('❌ Erro em pegaEstado:', error);
        return "Erro";
    }
}

async function pegaMuni(ponto, uf) {
    try {
        const pt = turf.point(ponto);

        if (!mu || !mu[uf]) {
            console.warn(`⚠️ Dados do estado "${uf}" não carregados`);
            return null;
        }

        const muni = await encontrarPoligono(mu[uf], pt);

        if (!muni || muni === 'Erro') {
            if (document.getElementById('muniNome')) {
                document.getElementById('muniNome').innerText = 'Município não encontrado';
            }
            return null;
        }

        const ufId = Number.parseInt(muni.properties.codarea);
        const area = (turf.area(muni) / 1000000).toFixed(3);

        if (ufId) {
            const muniObj = await buscaMuni(ufId);

            if (muniObj && !muniObj.error) {
                muni.properties.nome = muniObj.nome;
                muni.properties.estado = muniObj.microrregiao?.mesorregiao?.UF?.id || '';
                muni.properties.uf = muniObj.microrregiao?.mesorregiao?.UF?.sigla || '';
                muni.properties.ufNome = muniObj.microrregiao?.mesorregiao?.UF?.nome || '';
            }

            if (document.getElementById('muniNome')) {
                document.getElementById('muniNome').innerText =
                    `${muniObj?.nome || 'Desconhecido'}`;
            }
            return muni;
        }

        return null;
    } catch (error) {
        console.error('❌ Erro em pegaMuni:', error);
        return null;
    }
}

function encontrarPoligono(geojson, ponto) {
    if (!geojson?.features || !ponto?.geometry) {
        console.log('GeoJSON ou ponto inválidos');
        return "Erro";
    }

    for (const feature of geojson.features) {
        if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
            if (turf.booleanWithin(ponto, feature)) {
                return feature;
            }
        }
    }

    return null;
}

async function buscaMuni(idMuni) {
    const url = `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${idMuni}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.warn(`⚠️ Erro ao buscar município ${idMuni}:`, error.message);
        return { error: error.message };
    }
}

async function toUtm(ponto) {
    const url = `https://servicodados.ibge.gov.br/api/v1/progrid/latlongdec?referencialEntrada=sirgas2000&tipoCoordenadaSaida=utm_e_n&lat=${ponto[1]}&long=${ponto[0]}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        return data.resultado;  // Retorna objeto com e/n como strings
    } catch (error) {
        console.warn('⚠️ Erro na conversão UTM:', error.message);
        return null;
    }
}

// ===== FUNÇÕES DE UI =====

async function mostraPonto(ponto) {
    try {
        const resultado = await toUtm(ponto);

        if (resultado && document.getElementById('coords3')) {
            document.getElementById('coords3').textContent =
                `(${ponto[1].toFixed(5)}, ${ponto[0].toFixed(5)})`;
        }

        // ✅ Converte strings para números antes de toFixed
        if (resultado && document.getElementById('fuso')) {
            const eUtm = Number(resultado.e) || 0;
            const nUtm = Number(resultado.n) || 0;

            document.getElementById('fuso').textContent =
                `UTM ${resultado.fuso || '?'} ${eUtm.toFixed(0)} m E, ${nUtm.toFixed(0)} m N – SIRGAS2000`;
        }

        if (resultado && document.getElementById('utm')) {
            const eUtm = Number(resultado.e) || 0;
            const nUtm = Number(resultado.n) || 0;

            document.getElementById('utm').textContent =
                `(${eUtm.toFixed(0)}, ${nUtm.toFixed(0)})`;
        }
    } catch (error) {
        console.warn('⚠️ Não foi possível exibir UTM:', error.message);
    }
}

// ===== TABS E HISTÓRICO =====

const tabs = document.querySelectorAll('.tab-btn');
tabs.forEach(tab => tab.addEventListener('click', () => tabClicked(tab)));

function tabClicked(tab) {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const contents = document.querySelectorAll('.content');
    contents.forEach(c => c.classList.remove('show'));

    const contentId = tab.getAttribute('content-id');
    const content = document.getElementById(contentId);

    if (contentId === "historico") {
        encheTbody('tBPos', 'posicoes');
        setupTableEvents('tBPos', 'posicoes');
        setupClearButton('btnLimparHistorico', 'posicoes', 'tBPos');
    }

    if (contentId === "historicoC") {
        encheTbody('tBPosC', 'posicoesC');
        setupTableEvents('tBPosC', 'posicoesC');
        setupClearButton('btnLimparHistoricoC', 'posicoesC', 'tBPosC');
    }

    if (content) content.classList.add('show');
}

// Inicializa tab ativa
const currentActiveTab = document.querySelector('.tab-btn.active');
if (currentActiveTab) {
    tabClicked(currentActiveTab);
}
// ===== PREENCHER TABELAS =====
function encheTbody(tbodyId, tabela) {
    console.log(`🔄 Iniciando carregamento da tabela: ${tbodyId}`);

    const tbody = document.getElementById(tbodyId);
    if (!tbody) {
        console.error(`❌ tbody com id "${tbodyId}" não encontrado!`);
        return;
    }

    // Mostra "Carregando..."
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; font-style:italic; color:#666;">Carregando...</td></tr>';

    try {
        const transaction = db.transaction([tabela], 'readonly');
        const store = transaction.objectStore(tabela);
        const request = store.openCursor();
        let count = 0;
        const linhasArray = []; // Usa array em vez de fragment

        request.onsuccess = (event) => {
            const cursor = event.target.result;

            if (cursor) {
                const pos = cursor.value;
                console.log(`📍 Processando registro ${++count}: ID=${pos.id}`);

                // Cria a linha
                const tr = document.createElement('tr');
                tr.dataset.id = pos.id;
                tr.style.cursor = 'pointer';
                tr.title = 'Clique duas vezes para visualizar no mapa';

                // Dados das colunas
                const latitude = pos.ponto && pos.ponto[0] ? Number(pos.ponto[0]).toFixed(5) : '';
                const longitude = pos.ponto && pos.ponto[1] ? Number(pos.ponto[1]).toFixed(5) : '';

                // Cria as células
                const cells = [
                    pos.id || '',
                    pos.datahora || '',
                    latitude,
                    longitude,
                    pos.uf || '',
                    pos.muniNome || ''
                ];

                cells.forEach((text, idx) => {
                    const td = document.createElement('td');
                    td.textContent = text;
                    td.style.padding = '10px';
                    td.style.borderBottom = '1px solid #ddd';
                    tr.appendChild(td);
                });

                // Armazena no array
                linhasArray.push(tr);

                // Continua para o próximo
                cursor.continue();
            } else {
                // Fim do cursor
                console.log(`✅ Total de registros processados: ${count}`);
                console.log(`📊 Quantidade de linhas no array: ${linhasArray.length}`);

                // Limpa o "Carregando..."
                tbody.innerHTML = '';

                if (count === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; font-style:italic; color:#999;">Nenhum registro encontrado</td></tr>';
                } else {
                    // Adiciona todas as linhas UMA POR UMA
                    console.log(`📝 Adicionando ${linhasArray.length} linhas ao tbody...`);
                    linhasArray.forEach((linha, index) => {
                        tbody.appendChild(linha);
                        if (index < 3 || index >= linhasArray.length - 2) {
                            console.log(`  ↳ Linha ${index + 1} adicionada: ID=${linha.dataset.id}`);
                        }
                    });

                    // Verifica se funcionou
                    console.log(`🔍 Verificando tbody:`);
                    console.log(`  - Total de filhos: ${tbody.children.length}`);
                    console.log(`  - Primeira linha:`, tbody.children[0]);
                    console.log(`  - Última linha:`, tbody.children[tbody.children.length - 1]);

                    console.log(`✅ ${count} registros exibidos na tabela "${tabela}"`);
                }

                // Aguarda um pouco antes de configurar eventos
                setTimeout(() => {
                    setupTableEvents(tbodyId, tabela);
                }, 100);
            }
        };

        request.onerror = (event) => {
            console.error('❌ Erro ao abrir cursor:', event.target.error);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#dc3545;">Erro ao carregar dados</td></tr>';
        };

        transaction.onerror = (event) => {
            console.error('❌ Erro na transação:', event.target.error);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#dc3545;">Erro na transação</td></tr>';
        };

    } catch (error) {
        console.error('❌ Erro crítico:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#dc3545;">Erro: ' + error.message + '</td></tr>';
    }
}
// ===== EVENTOS NAS TABELAS (DUPLO CLIQUE PARA VISUALIZAR) =====

async function setupTableEvents(tbodyId, tabela) {
    console.log(`🔧 Configurando eventos para ${tbodyId}...`);

    const tbody = document.getElementById(tbodyId);
    if (!tbody) {
        console.error(`❌ tbody ${tbodyId} não encontrado!`);
        return;
    }

    console.log(`  - tbody tem ${tbody.children.length} linhas`);

    // Adiciona o listener diretamente (sem replaceWith)
    tbody.addEventListener('dblclick', async (e) => {
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;

        const id = parseInt(tr.dataset.id);
        if (isNaN(id)) return;

        console.log(`🔍 Buscando posição ${id} em "${tabela}"`);

        try {
            const posicao = await getPosicao(id, tabela);
            if (posicao?.ponto) {
                // Inverte para [lng, lat]
                const ponto = [posicao.ponto[1], posicao.ponto[0]];

                // Atualiza inputs
                if (lat) lat.value = ponto[1];
                if (long) long.value = ponto[0];

                /* ✅ ATUALIZA TODAS AS INFORMAÇÕES NA UI
                if (posicao.datahora && document.getElementById('datahora')) {
                    document.getElementById('datahora').innerText = posicao.datahora;
                }
*/
                // Atualiza coordenadas formatadas
                if (document.getElementById('coords3')) {
                    document.getElementById('coords3').textContent =
                        `(${ponto[1].toFixed(5)}, ${ponto[0].toFixed(5)})`;
                }

                // Atualiza UF
                if (posicao.uf && posicao.ufNome && document.getElementById('ufNome')) {
                    document.getElementById('ufNome').innerText =
                        `${posicao.ufNome}`;
                }

                // Atualiza Município
                if (posicao.muniNome && document.getElementById('muniNome')) {
                    if (posicao.muniId) {
                        const muniObj = await buscaMuni(posicao.muniId);
                        if (muniObj && !muniObj.error) {
                            const area = posicao.area || '';
                            document.getElementById('muniNome').innerText =
                                `${muniObj.nome}`;
                        } else {
                            document.getElementById('muniNome').innerText = posicao.muniNome;
                        }
                    } else {
                        document.getElementById('muniNome').innerText = posicao.muniNome;
                    }
                }

                // Atualiza UTM (opcional)
                try {
                    const resultado = await toUtm(ponto);
                    if (resultado && document.getElementById('fuso')) {
                        const eUtm = Number(resultado.e) || 0;
                        const nUtm = Number(resultado.n) || 0;
                        document.getElementById('fuso').textContent =
                            `UTM ${resultado.fuso || '?'} ${eUtm.toFixed(0)} m E, ${nUtm.toFixed(0)} m N – SIRGAS2000`;
                    }
                    if (resultado && document.getElementById('utm')) {
                        const eUtm = Number(resultado.e) || 0;
                        const nUtm = Number(resultado.n) || 0;
                        document.getElementById('utm').textContent =
                            `(${eUtm.toFixed(0)}, ${nUtm.toFixed(0)})`;
                    }
                } catch (err) {
                    console.warn('⚠️ Não foi possível converter para UTM:', err.message);
                }

                // 🔥 BUSCA O POLÍGONO DO MUNICÍPIO
                let poligonoMuni = null;
                if (posicao.muniId && posicao.ufId) {
                    try {
                        // Converte para string para comparação
                        const muniStr = posicao.muniId.toString();
                        const ufStr = posicao.ufId.toString();

                        console.log(`🗺️ Buscando polígono: UF=${ufStr}, Município=${muniStr}`);

                        // Verifica se os dados do estado estão carregados
                        if (mu && mu[ufStr]) {
                            // Busca o município nas features do estado
                            for (const feature of mu[ufStr].features) {
                                const codArea = feature.properties.codarea?.toString();
                                if (codArea === muniStr || codArea == posicao.muniId) {
                                    poligonoMuni = feature;
                                    console.log(`✅ Polígono encontrado: ${feature.properties.nome || muniStr}`);
                                    break;
                                }
                            }

                            if (!poligonoMuni) {
                                console.warn(`⚠️ Polígono não encontrado para município ${muniStr}`);
                            }
                        } else {
                            console.warn(`⚠️ Dados do estado ${ufStr} não carregados em mu`);
                        }
                    } catch (err) {
                        console.warn('⚠️ Erro ao buscar polígono:', err.message);
                    }
                }

                // Plota no mapa COM o polígono (se encontrado)
                plotaPonto(ponto, 'map', poligonoMuni);
                mostraPonto(ponto);

                // Muda para aba Home se necessário
                const homeTab = document.querySelector('.tab-btn[content-id="home"]');
                if (homeTab && typeof tabClicked === 'function') {
                    tabClicked(homeTab);
                }

                console.log('✅ Posição carregada no mapa com todas as informações');
                if (poligonoMuni) {
                    console.log('🗺️ Polígono do município exibido no mapa');
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar posição:', error);
            alert('Não foi possível carregar esta posição');
        }
    });

    console.log(`✅ Eventos configurados com sucesso!`);
}
// ===== BOTÕES DE LIMPAR TABELAS =====

function setupClearButton(btnId, tabela, tbodyId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    // Remove listener antigo se existir
    btn.replaceWith(btn.cloneNode(true));
    const novoBtn = document.getElementById(btnId);

    novoBtn.addEventListener('click', async () => {
        const nomeTabela = tabela === 'posicoes' ? 'Histórico' : 'Histórico de Cliques';

        if (!confirm(`⚠️ Tem certeza que deseja APAGAR TODOS os registros de "${nomeTabela}"?\n\nEsta ação não pode ser desfeita!`)) {
            return;
        }

        try {
            await limparTabela(tabela);

            // Atualiza a tabela na UI
            encheTbody(tbodyId, tabela);

            alert(`✅ Todos os registros de "${nomeTabela}" foram apagados!`);
        } catch (error) {
            console.error('❌ Erro ao limpar tabela:', error);
            alert(`Erro ao limpar: ${error.message}`);
        }
    });
}

// ===== INICIALIZAÇÃO AO CARREGAR =====

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Aplicativo "Onde Estou" inicializado');

    // Se o IndexedDB já estiver pronto, inicializa o mapa
    if (db) {
        inicializarMapa();
    }
});

// ===== FUNÇÃO PARA ESCONDER LOADING =====
function hideLoading() {
    if (loadingOverlay) {
        console.log('🔻 Escondendo loading...');
        loadingOverlay.classList.add('hidden');
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 500);
    }
}
/*
// ===== INICIALIZAÇÃO AO CARREGAR =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Aplicativo "Onde Estou" inicializado');

    // Se o IndexedDB já estiver pronto, inicializa o mapa
    if (db) {
        inicializarMapa();
    }
});
*/
// ===== FUNÇÕES GLOBAIS =====
window.plotaPonto = plotaPonto;
window.mostraPonto = mostraPonto;
window.limparTabela = limparTabela;