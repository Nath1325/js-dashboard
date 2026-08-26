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

/////////////////////////////////////////////////////////////////////////////

// ROUTE /api/kpi avec param optionel "region"
// Retourne la consommation et la production totale de la France ( ou de la région indiqué ) à la dernière date enregistré.
app.get('/api/kpi', async (req, res) => {
    try {
        const region = req.query.region ?? null;

        const lastDate = await pool.query('SELECT MAX(date_heure) AS date_ref FROM mesure');
        const dateRef = lastDate.rows[0].date_ref;

        if (!dateRef) {
            return res.status(404).json({ error: 'Aucune donnée disponible' });
        }

        const [resultConsommation, resultProduction] = await Promise.all([
            pool.query(
                'SELECT SUM(consommation) AS consommation FROM mesure WHERE date_heure = $1 AND ($2::text IS NULL OR code_insee = $2)',
                [dateRef, region]
            ),
            pool.query(
                'SELECT SUM(valeur_mw) AS production FROM production WHERE date_heure = $1 AND ($2::text IS NULL OR code_insee = $2)',
                [dateRef, region]
            )
        ]);

        res.json({
            date: dateRef,
            consommation: Number(resultConsommation.rows[0].consommation),
            production: Number(resultProduction.rows[0].production)
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


// ROUTE /api/production-par-filliere avec params optionels "region" et "jours"
// Retourne la production sur les "jours" derniers jours pour la région "region"
app.get('/api/production-par-filiere', async (req, res) => {
    try {
        const region = req.query.region ?? null;
        const jours = Number(req.query.jours) || 7;

        if (jours < 1 || jours > 30) {
            return res.status(400).json({ error: 'jours doit être entre 1 et 30' });
        }

        const result = await pool.query(
            `SELECT filiere, SUM(valeur_mw) / 4.0 AS production_mwh
             FROM production
             WHERE ($1::text IS NULL OR code_insee = $1)
               AND date_heure >= (SELECT MAX(date_heure) FROM production)
                                 - ($2 || ' days')::interval
             GROUP BY filiere
             ORDER BY production_mwh DESC`,
            [region, jours]
        );

        res.json(result.rows.map(row => ({
            filiere: row.filiere,
            production_mwh: Math.round(Number(row.production_mwh))
        })));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route /api/regions avec param optionel "jours"
// Retourne la consommation et la production moyenne sur les "jours" derniers jours pour chaque région.
app.get('/api/regions', async (req, res) => {
    try {
        const jours = Number(req.query.jours) || 7;

        if (jours < 1 || jours > 30) {
            return res.status(400).json({ error: 'le nombre de jours doit être entre 1 et 30' });
        }

        const result = await pool.query(`
            WITH conso AS (
                SELECT code_insee,
                       AVG(consommation) AS consommation_moyenne_mw,
                       SUM(consommation) / 4.0 AS consommation_mwh,
                       SUM(ech_physiques) / 4.0 AS echanges_mwh
                FROM mesure
                WHERE date_heure >= (SELECT MAX(date_heure) FROM mesure)
                                    - ($1 || ' days')::interval
                GROUP BY code_insee
            ),
            prod AS (
                SELECT code_insee,
                       AVG(valeur_mw) * 6 AS production_moyenne_mw,
                       SUM(valeur_mw) / 4.0 AS production_mwh
                FROM production
                WHERE date_heure >= (SELECT MAX(date_heure) FROM production)
                                    - ($1 || ' days')::interval
                GROUP BY code_insee
            )
            SELECT r.code_insee,
                   r.libelle,
                   conso.consommation_moyenne_mw,
                   conso.consommation_mwh,
                   prod.production_moyenne_mw,
                   prod.production_mwh,
                   conso.echanges_mwh
            FROM region r
            JOIN conso ON conso.code_insee = r.code_insee
            JOIN prod  ON prod.code_insee  = r.code_insee
            ORDER BY conso.consommation_moyenne_mw DESC
        `, [jours]);

        res.json({
            jours,
            donnees: result.rows.map(row => ({
                code_insee: row.code_insee,
                libelle: row.libelle,
                consommation_moyenne_mw: Math.round(Number(row.consommation_moyenne_mw)),
                production_moyenne_mw: Math.round(Number(row.production_moyenne_mw)),
                consommation_mwh: Math.round(Number(row.consommation_mwh)),
                production_mwh: Math.round(Number(row.production_mwh)),
                taux_couverture: Math.round(
                    (Number(row.production_mwh) / Number(row.consommation_mwh)) * 100
                )
            }))
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route /api/serie avec params optionnels "region" et "jours"
// Retourne l'évolution horaire de la consommation et de la production
app.get('/api/serie', async (req, res) => {
    try {
        const region = req.query.region ?? null;
        const jours = Number(req.query.jours) || 7;

        if (jours < 1 || jours > 30) {
            return res.status(400).json({ error: 'le nombre de jours doit être entre 1 et 30' });
        }

        const result = await pool.query(`
            WITH conso AS (
                SELECT DATE_TRUNC('hour', date_heure) AS heure,
                       SUM(consommation) / COUNT(DISTINCT date_heure) AS consommation_mw
                FROM mesure
                WHERE ($1::text IS NULL OR code_insee = $1)
                  AND date_heure >= (SELECT MAX(date_heure) FROM mesure)
                                    - ($2 || ' days')::interval
                GROUP BY heure
            ),
            prod AS (
                SELECT DATE_TRUNC('hour', date_heure) AS heure,
                       SUM(valeur_mw) / COUNT(DISTINCT date_heure) AS production_mw
                FROM production
                WHERE ($1::text IS NULL OR code_insee = $1)
                  AND date_heure >= (SELECT MAX(date_heure) FROM mesure)
                                    - ($2 || ' days')::interval
                GROUP BY heure
            )
            SELECT c.heure, c.consommation_mw, p.production_mw
            FROM conso c
            JOIN prod p ON p.heure = c.heure
            ORDER BY c.heure
        `, [region, jours]);

        res.json(result.rows.map(row => ({
            heure: row.heure,
            consommation_mw: Math.round(Number(row.consommation_mw)),
            production_mw: Math.round(Number(row.production_mw))
        })));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.listen(PORT, () => {
    console.log(`API démarrée sur http://localhost:${PORT}`);
});