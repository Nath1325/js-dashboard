import { readFile } from 'node:fs/promises';
import { pool } from './db.js';

const FILIERES = ['thermique', 'nucleaire', 'eolien', 'solaire', 'hydraulique', 'bioenergies'];

// Fonction loadRegion
const loadRegion = async (fileData) => {
    console.log("chargement des régions en BDD en cours ...")
    const regionMap = new Map();

    fileData.forEach(element => {
            regionMap.set(element.code_insee_region,element.libelle_region);
    });

    for ( const [key,value] of regionMap) {
            await pool.query(
                'INSERT INTO region (code_insee, libelle) VALUES ($1, $2) ON CONFLICT (code_insee) DO NOTHING',
                [key,value]
            );
    };
    console.log("terminé avec succès.");
}

// Fonction loadMesure
const loadMesure = async (fileData) => {
    console.log("chargement des mesures en BDD en cours...")
    for ( const element of fileData){
        await pool.query(
            "INSERT INTO mesure (code_insee, date_heure, consommation, pompage, ech_physiques) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code_insee, date_heure) DO UPDATE SET consommation = EXCLUDED.consommation, pompage = EXCLUDED.pompage, ech_physiques = EXCLUDED.ech_physiques",
            [element.code_insee_region, element.date_heure, element.consommation, toNumber(element.pompage), element.ech_physiques]
        );
    }
        console.log("terminé avec succès.");
}

// Fonction loadProduction
const loadProduction = async (fileData) => {
    const FILIERES = ['thermique', 'nucleaire', 'eolien', 'solaire', 'hydraulique', 'bioenergies'];
    console.log("chargement des productions en BDD en cours...");

    let compteur = 0;
    const total = fileData.length * FILIERES.length;

    for (const element of fileData){
        for (const filiere of FILIERES){
            await pool.query(
                "INSERT INTO production (code_insee, date_heure, filiere, valeur_mw) VALUES ($1,$2,$3,$4) ON CONFLICT (code_insee, date_heure, filiere) DO UPDATE SET valeur_mw = EXCLUDED.valeur_mw",
                [element.code_insee_region, element.date_heure, filiere, toNumber(element[filiere])]
            );

            compteur++;
            if (compteur % 5000 === 0) {
                console.log(`${compteur} / ${total} lignes...`);
            }
        }
    }
    console.log(`terminé avec succès : ${compteur} lignes.`);
}

// Fonction to number
const toNumber = (toConvert) => {
    if (toConvert == null ) {
        return null;
    }
    else {
        return Number(toConvert);
    }
}


///////////////////////////////////////////////////////////////////////////////////

try {
    const fileData = JSON.parse(await readFile("data/raw/eco2mix.json", 'utf8'));

    //await loadRegion(fileData);
    //await loadMesure(fileData);
    await loadProduction(fileData);

} catch (e){
    console.log(e);
} finally {
    await pool.end();
}
