import express from 'express';
import cors from 'cors';
import { pool } from '../etl/db.js';

const app = express();
const PORT = 3000;

app.use(cors());

app.get('/api/health', async (req, res) => {
    const result = await pool.query('SELECT COUNT(*) FROM mesure');
    res.json({ status: 'ok', mesures: Number(result.rows[0].count) });
});

app.listen(PORT, () => {
    console.log(`API démarrée sur http://localhost:${PORT}`);
});

/////////////////////////////////////////////////////////////////////////////

// ROUTE /api/kpi avec param optionel "region"
// Retourne la consommation et la production totale de la France ( ou de la région indiqué ) à la dernière date enregistré.
app.get('/api/kpi', async (req, res) => {
    const region = req.query.region;

    const lastDate = await pool.query('SELECT MAX(date_heure) AS date_ref FROM mesure;');
    const resultConsommation = await pool.query('SELECT SUM(consommation) AS consommation FROM mesure WHERE date_heure = $1 AND ($2::text IS NULL OR code_insee = $2);',[lastDate.rows[0].date_ref,region]);
    const resultProduction = await pool.query('SELECT SUM(valeur_mw) AS production FROM production WHERE date_heure = $1 AND ($2::text IS NULL OR code_insee = $2);',[lastDate.rows[0].date_ref,region]);

    res.json({ 
        date: lastDate.rows[0].date_ref,
        consommation: Number(resultConsommation.rows[0].consommation),
        production: Number(resultProduction.rows[0].production)
    });
});


// ROUTE /api/production-par-filliere avec params optionels "region" et "jours"
// Retourne la production sur les "jours" derniers jours pour la région "region"
app.get('/api/production-par-filiere', async (req, res) => {
    const region = req.query.region;
    const jours = req.query.jours || 7;

    const result = await pool.query("SELECT SUM(valeur_mw) AS production, filiere FROM production WHERE ($1::text IS NULL OR code_insee = $1) AND date_heure >= ( SELECT MAX(date_heure) FROM production) - ($2 || ' days' )::interval GROUP BY filiere ",[region,jours]);
    
    
    res.json(result.rows.map(row => ({ ...row, production: Number(row.production) })));

});


app.get('/api/regions', async (req, res) => {
    try {
        const jours = Number(req.query.jours) || 7;

        const result = await pool.query(`
            WITH conso AS (
                SELECT code_insee,
                       SUM(consommation) AS consommation,
                       SUM(ech_physiques) AS echanges
                FROM mesure
                WHERE date_heure >= (SELECT MAX(date_heure) FROM mesure)
                                    - ($1 || ' days')::interval
                GROUP BY code_insee
            ),

            prod AS (
                SELECT code_insee,
                       SUM(valeur_mw) AS production
                FROM production
                WHERE date_heure >= (SELECT MAX(date_heure) FROM production)
                                    - ($1 || ' days')::interval
                GROUP BY code_insee
            )
                
            SELECT r.code_insee,
                   r.libelle,
                   conso.consommation,
                   prod.production,
                   conso.echanges
            FROM region r
            JOIN conso ON conso.code_insee = r.code_insee
            JOIN prod  ON prod.code_insee  = r.code_insee
            ORDER BY conso.consommation DESC
        `, [jours]);

        res.json(result.rows.map(row => ({
            code_insee: row.code_insee,
            libelle: row.libelle,
            consommation: Number(row.consommation),
            production: Number(row.production),
            echanges: Number(row.echanges),
            taux_couverture: Math.round(
                (Number(row.production) / Number(row.consommation)) * 100
            )
        })));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});