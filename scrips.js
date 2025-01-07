const lat = document.getElementById('lat');
const long = document.getElementById('long');
const btBusca = document.getElementById('busca');
const btBusca2 = document.getElementById('busca2');
var map = null;

navigator.geolocation.getCurrentPosition(async function (position) {
    //console.log(position);
    let ponto = new Array();
    let estado;
    ponto.push(position.coords.longitude);
    ponto.push(position.coords.latitude);
    estado = await pegaEstado(ponto);
    //console.log(estado);
    lat.value = ponto[1];
    long.value = ponto[0];
    if(estado == 'Erro'){
        document.getElementById('muniNome').innerText = "";
        plotaPonto(ponto, 'map', null);
        return;
    }
    document.getElementById('datahora').innerText = new Date(position.timestamp).toLocaleString();
    const muniT = await pegaMuni(ponto, estado.properties.codarea);
    console.log(muniT);
    plotaPonto(ponto, 'map', muniT);

});
btBusca.addEventListener('click', async (ev) => {
    let ponto = new Array();
    let estado;
    if (typeof Number.parseFloat(long.value) != "number" || typeof Number.parseFloat(lat.value) != "number") {
        alert('Algo não é número: ' + typeof Number.parseFloat(long.value));
        return;
    }
    ponto.push(Number.parseFloat(long.value));
    ponto.push(Number.parseFloat(lat.value));
    estado = await pegaEstado(ponto);
    if(estado == 'Erro'){
        document.getElementById('muniNome').innerText = "";
        plotaPonto(ponto, 'map', null);
        return;
    }
    document.getElementById('datahora').innerText = new Date().toLocaleString();
    const muniT = await pegaMuni(ponto, await estado.properties.codarea);
    map.remove();
    plotaPonto(ponto, 'map', muniT);
});

async function pegaEstado(ponto) {
    const pt = turf.point(ponto);
    const ufId = await encontrarPoligono(ufs, pt);
    if (ufId) {
        const ufObj = ufNomes.find((elemento) => elemento.id == ufId.properties.codarea);
        document.getElementById('ufNome').innerText = `${ufObj.id}-${ufObj.sigla}-${ufObj.nome}`;
        //console.log(ufId);
        return ufId;
    } else {
        document.getElementById('ufNome').innerText = `Ponto fora do Brasil: ${ponto[1]}, ${ponto[0]}`;
        return "Erro";
    }
    //console.log(ufId);
}
async function pegaMuni(ponto, uf) {
    //console.log(ponto, mu[uf]);
    const pt = turf.point(ponto);
    const muni = await encontrarPoligono(mu[uf], pt);
    //console.log(muni);
    if(muni == 'Erro'){
        document.getElementById('muniNome').innerText = 'Município não encontrado';
        return;
    }
    const ufId = Number.parseInt(muni.properties.codarea);
    
    const area = (turf.area(muni)/1000000).toFixed(3);
    //console.log(muni);
    if (ufId) {
        //const ufObj = ufNomes.find((elemento) => elemento.id==ufId);
        const muniObj = await buscaMuni(ufId);
        //console.log(muniObj);
        let muniNome = "";
        if (muniObj) {
            muniNome = muniObj.nome;
            muni.properties.nome = muniObj.nome;
            muni.properties.estado = muniObj.microrregiao.mesorregiao.UF.id;
            muni.properties.uf = muniObj.microrregiao.mesorregiao.UF.sigla;
        }
        //console.log(muni);
        document.getElementById('muniNome').innerText = `${ufId}-${muniObj.nome}-${area} Km2`
        return muni;
    } else {
        document.getElementById('muniNome').innerText = `Ponto fora do Brasil, muni: ${ponto[1]}, ${ponto[0]}`
    }
    //console.log(ufId);
}

function encontrarPoligono(geojson, ponto) {
    //console.log(geojson);
    let i2 = 0;
    // Verifica se o GeoJSON é válido e se o ponto é um objeto
    if (!geojson || !ponto || !ponto.geometry) {
        console.log('GeoJSON ou ponto inválidos');
        return "Erro";
    };

    // Itera sobre cada feature (polígono) do GeoJSON
    for (let feature of geojson.features) {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
            // Verifica se o ponto está dentro do polígono
            if (turf.booleanWithin(ponto, feature)) {
                // Retorna o ID do polígono
                //console.log(feature)
                return feature;
            } else {
                //console.log(++i2, feature.properties.codarea, typeof feature.properties.codarea);
            }
        }
    }

    // Se o ponto não estiver em nenhum polígono, retorna null
    return null;
}

function plotaPonto(ponto, div, poligono) {
    let pt = [ponto[1], ponto[0]];
    var container = L.DomUtil.get('map');
    if (container != null) {
        container._leaflet_id = null;
    }
    var googleStreets = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });
    var googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });
    var googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: 'Google Hybrid'
    });

    var OpenTopoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
    });
    //console.log(map);
    //if (map !== undefined && map !== null) { map.remove(); }
    map = L.map(div).setView(pt, 13);
    var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    osm.addTo(map);
    //OpenTopoMap.addTo(map);
    //wms.addTo(map);
    //baserelief.addTo(map);
    //googleHybrid.addTo(map);
    //googleSat.addTo(map);
    //googleStreets.addTo(map);
    var baseMaps = {
        "OSM": osm,
        'Google Street': googleStreets,
        "Google Satellite": googleSat,
        "Google Híbrido": googleHybrid,
        "Relevo": OpenTopoMap
    };
    let pt1 = L.marker(pt);
    pt1.addTo(map)
        .bindPopup(`${pt[0]}, ${pt[1]}`)
        .openPopup()
    var overlayMaps = {
        //"Escala": scale,
        "Ponto": pt1
    };
    L.control.layers(baseMaps, null, { collapsed: true }).addTo(map);

    L.Measure = {
        linearMeasurement: "Distância",
        areaMeasurement: "Área",
        start: "Início",
        meter: "m",
        kilometer: "km",
        squareMeter: "m²",
        squareKilometers: "km²",
    };

    var measure = L.control.measure({}).addTo(map);
    var scale = L.control.scale({ imperial: false })
    scale.addTo(map);
    
    map.on('mousemove', function (e) {
        document.getElementById('coordinate').innerText = 'Lat: ' + e.latlng.lat + ', Long: ' + e.latlng.lng;
        //console.log('lat: ' + e.latlng.lat, 'lng: ' + e.latlng.lng)
    });
    map.on('dblclick', async (ev) => {
        //console.log(ev);
        container._leaflet_id = null;
        let ponto = new Array();
        let estado;
        ponto.push(ev.latlng.lng);
        ponto.push(ev.latlng.lat);
        estado = await pegaEstado(ponto);
        //console.log(estado);
        lat.value = ponto[1];
        long.value = ponto[0];
        if(estado == 'Erro'){
            document.getElementById('muniNome').innerText = "";
            plotaPonto(ponto, 'map', null);
            return;
        }
        //document.getElementById('datahora').innerText = new Date(position.timestamp).toLocaleString();
        const muniT = await pegaMuni(ponto, estado.properties.codarea);
        //console.log(muniT);
        map.remove();
        plotaPonto(ponto, 'map', muniT);
    })
    var rodo1 = L.geoJson(br101_se, {
        style: {
            color: 'grey',
            weight: 3,
            opacity: 0.5,
            fillOpacity: 0,
        }
    }).addTo(map);
    /*var distance = turf.pointToLineDistance(turf.point(pt), br101_se.features[0], { units: "kilometers" });
    console.log('dist ', distance);*/
    if (poligono) {
        var estado = poligono.properties.estado;
        if(mu[estado]){
            var poli2 = L.geoJson(mu[estado], {
                style: {
                    color: 'black',
                    weight: 1.5,
                    opacity: 0.5,
                    fillOpacity: 0,
                }
            }).addTo(map);
        }
        var poli1 = L.geoJson(poligono, {
            /*onEachFeature: function  (feature, layer) {
                layer.bindPopup(`<b>Nome: </b>` + feature.properties.nome)
            },*/
            style: {
                fillColor: 'red',
                fillOpacity: 0,
                color: 'blue',
            }
        });
        poli1.addTo(map);
        map.fitBounds(poli1.getBounds());
        var quadrado = L.polygon([
            poli1.getBounds()._southWest,
            [parseFloat(poli1.getBounds()._northEast.lat), parseFloat(poli1.getBounds()._southWest.lng)],
            poli1.getBounds()._northEast,
            [parseFloat(poli1.getBounds()._southWest.lat), parseFloat(poli1.getBounds()._northEast.lng)]
        ], { color: "#ff7800", weight: 1, opacity: 1, fill: false }).addTo(map);
    }

}
async function buscaMuni(idMuni) {
    const url1 = `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${idMuni}`;
    //console.log(idMuni);
    try {
        const response = await fetch(url1)
        if (!response.ok) {
            throw new Error('Erro na solicitação. Código do status: ' + response.status)
        }
        const data = await response.json();
        //console.log(data.nome, typeof data);
        return data
    }
    catch (error) {
        return { error: error.message }
    }
}