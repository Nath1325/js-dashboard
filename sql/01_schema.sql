DROP TABLE IF EXISTS production;
DROP TABLE IF EXISTS mesure;
DROP TABLE IF EXISTS region;

CREATE TABLE region (
    code_insee  TEXT PRIMARY KEY,
    libelle     TEXT NOT NULL
);

CREATE TABLE mesure (
    code_insee     TEXT        NOT NULL REFERENCES region(code_insee),
    date_heure     TIMESTAMPTZ NOT NULL,
    consommation   INTEGER,
    pompage        INTEGER,
    ech_physiques  INTEGER,
    PRIMARY KEY (code_insee, date_heure)
);

CREATE TABLE production (
    code_insee   TEXT        NOT NULL,
    date_heure   TIMESTAMPTZ NOT NULL,
    filiere      TEXT        NOT NULL,
    valeur_mw    INTEGER,
    PRIMARY KEY (code_insee, date_heure, filiere),
    FOREIGN KEY (code_insee, date_heure) REFERENCES mesure(code_insee, date_heure) ON DELETE CASCADE,
    CONSTRAINT filiere_valide CHECK (filiere IN
        ('thermique','nucleaire','eolien','solaire','hydraulique','bioenergies'))
);

CREATE INDEX idx_mesure_date ON mesure(date_heure);
CREATE INDEX idx_production_filiere ON production(filiere, date_heure);