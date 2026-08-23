import { writeFile } from 'node:fs/promises';

const BASE_URL = "https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/eco2mix-regional-tr/records";

const JOURS_HISTORIQUE = 7;
const borne = new Date(Date.now() - JOURS_HISTORIQUE * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];

///////////////////////////////////////////////////////////////////////////////////


// Fonction callAPi
const callApi = async (params) => {
    const url = `${BASE_URL}?${params}`;
    const response = await fetch(url);
    if (!response.ok){
        throw new Error("Erreur lors de l'appel à l'API: "+response.status+"\nURL appellée:"+url);
    }
    const myJSON = await response.json();
    return myJSON;
}

// Fonction pause
const pause = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

// Fonction extractAll
const extractAll = async () => {
    console.log("Extraction depuis l'API externe en cours ...");
    const resultsArray = [];
    let offsetCount = 0;
    const params = new URLSearchParams({
        select: "code_insee_region,libelle_region,date_heure,consommation,thermique,nucleaire,eolien,solaire,hydraulique,bioenergies,pompage,ech_physiques",
        where: `consommation is not null and date_heure > date'${borne}'`,
        order_by: "date_heure",
        limit: "100",
        offset: offsetCount,
    });

    let myJSON = await callApi(params);
    resultsArray.push(...myJSON.results);

    while (resultsArray.length < myJSON.total_count){
        await pause(200);
        offsetCount=offsetCount+100;
        params.set("offset", offsetCount);
        myJSON = await callApi(params);
        resultsArray.push(...myJSON.results);
    }
    return resultsArray;
}

// Fonction writeData
const writeData = async (data) => {
    console.log("écriture dans le fichier local ...");
    const path = "data/raw/eco2mix.json";
    await writeFile(path,JSON.stringify(data, null, 2));
    console.log("écriture dans le fichier local terminé avec succès.");
}

///////////////////////////////////////////////////////////////////////////////////

try {
    const resultArray = await extractAll();
    console.log("Nombre de lignes extraites depuis l'API externe :"+resultArray.length);
    await writeData(resultArray);
} catch (error){
    console.error(error);
}