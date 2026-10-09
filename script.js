let baseDeDonneesJoueurs = [];
let inventaire = JSON.parse(localStorage.getItem("inventaireTennis")) || [];

// --- SYSTÈME DE STOCKAGE DE PACKS ---
const TEMPS_GENERATION_MS = 1 * 60 * 1000; // 1 minute
let packsDisponibles = parseInt(localStorage.getItem("packsDispoTennis"));
if (isNaN(packsDisponibles)) packsDisponibles = 1;

let dateDernierCalcul = parseInt(localStorage.getItem("dateDernierCalculTennis")) || Date.now();
localStorage.setItem("dateDernierCalculTennis", dateDernierCalcul);

const RANGS_RARETE = { "Commun": 1, "Peu-Commun": 2, "Rare": 3, "Très-Rare": 4, "Légendaire": 5 };
const COULEURS = { "Commun": "#ecf0f1", "Peu-Commun": "#2ecc71", "Rare": "#3498db", "Très-Rare": "#9b59b6", "Légendaire": "#e67e22" };
const PARTICULES = { "Commun": 15, "Peu-Commun": 25, "Rare": 40, "Très-Rare": 65, "Légendaire": 110 };

let packActuel = [];
let nouvellesCartes = [];
let etapeOuverture = 0;
let verrou = false;
let boucleTemps = null;

// État de l'album
let vueAlbum = "toutes";          // "toutes" | "possedees" | "manquantes"
let triAlbum = "rarete-desc";     // clé du <select>

const $ = id => document.getElementById(id);

async function chargerJeu() {
    try {
        const rep = await fetch('joueurs.json');
        baseDeDonneesJoueurs = await rep.json();
        // On mémorise l'ordre d'obtention : l'inventaire est déjà chronologique,
        // on retrouve l'index de première apparition via la position dans le tableau.
        majCompteursAlbum();
        lancerGestionnairePacks();
    } catch (e) {
        console.error("Erreur chargement JSON", e);
        $("timer-display").innerText = "Erreur de chargement des joueurs";
    }
}

/* ---------- Navigation ---------- */
document.querySelectorAll("nav button[data-vue]").forEach(b => {
    b.addEventListener("click", () => changerVue(b.dataset.vue));
});

function changerVue(nomVue) {
    document.querySelectorAll('.vue').forEach(v => v.classList.remove('active'));
    $(`vue-${nomVue}`).classList.add('active');
    if (nomVue === 'album') { afficherAlbum(); }
}

/* ---------- Tirage ---------- */
function tirerUnJoueur() {
    const totalPoids = baseDeDonneesJoueurs.reduce((s, j) => s + j.poids_tirage, 0);
    let random = Math.random() * totalPoids;
    for (let joueur of baseDeDonneesJoueurs) {
        if (random < joueur.poids_tirage) return joueur;
        random -= joueur.poids_tirage;
    }
    return baseDeDonneesJoueurs[0];
}

/* ---------- Effets ---------- */
function lancerParticules(rarete) {
    const conteneur = $("particules");
    const couleur = COULEURS[rarete];
    const n = PARTICULES[rarete];
    const portee = 200 + RANGS_RARETE[rarete] * 90;
    for (let i = 0; i < n; i++) {
        const p = document.createElement("div");
        const angle = Math.random() * Math.PI * 2;
        const dist = portee * (0.4 + Math.random() * 0.8);
        p.className = "particule" + (rarete === "Légendaire" && i % 2 ? " confetti" : "");
        p.style.setProperty("--x", Math.cos(angle) * dist + "px");
        p.style.setProperty("--y", Math.sin(angle) * dist + "px");
        p.style.setProperty("--s", (4 + Math.random() * 9) + "px");
        p.style.setProperty("--d", (0.8 + Math.random() * 1.2) + "s");
        p.style.setProperty("--pc", rarete === "Légendaire" && i % 3 === 0 ? "#f1c40f" : couleur);
        conteneur.appendChild(p);
        setTimeout(() => p.remove(), 2200);
    }
}

function flash() {
    const f = $("flash");
    f.classList.remove("go");
    void f.offsetWidth;
    f.classList.add("go");
}

function secouer() {
    const v = $("vue-ouverture");
    v.classList.remove("secoue");
    void v.offsetWidth;
    v.classList.add("secoue");
}

function creerPoints() {
    $("points").innerHTML = "";
    for (let i = 0; i < 5; i++) {
        const d = document.createElement("div");
        d.className = "point";
        $("points").appendChild(d);
    }
}

/* ---------- Rotation du pack à la souris ---------- */
function brancherRotationPack(scene, cible) {
    scene.addEventListener("mousemove", e => {
        const r = scene.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        cible.style.setProperty("--ry", (px * 35) + "deg");
        cible.style.setProperty("--rx", (-py * 25) + "deg");
    });
    scene.addEventListener("mouseleave", () => {
        cible.style.setProperty("--ry", "-12deg");
        cible.style.setProperty("--rx", "4deg");
    });
}
brancherRotationPack($("scene-ouverture"), $("pack-gros-plan"));

/* ---------- Ouverture du pack ---------- */
$("btn-ouvrir").addEventListener("click", () => {
    if (!baseDeDonneesJoueurs.length || packsDisponibles <= 0) return;

    packsDisponibles--;
    localStorage.setItem("packsDispoTennis", packsDisponibles);
    actualiserAffichageBouton();

    // Tirage + tri CROISSANT : la meilleure carte est en index 4 (révélée en dernier)
    packActuel = [];
    for (let i = 0; i < 5; i++) packActuel.push(tirerUnJoueur());
    packActuel.sort((a, b) => RANGS_RARETE[a.rarete] - RANGS_RARETE[b.rarete]);

    const dejaVus = new Set(inventaire.map(j => j.nom));
    nouvellesCartes = packActuel.map(j => {
        const nouveau = !dejaVus.has(j.nom);
        dejaVus.add(j.nom);
        return nouveau;
    });

    inventaire = inventaire.concat(packActuel);
    localStorage.setItem("inventaireTennis", JSON.stringify(inventaire));

    etapeOuverture = 0;
    verrou = false;

    const meilleure = packActuel[4].rarete;
    const vue = $("vue-ouverture");
    vue.style.setProperty("--c", COULEURS[meilleure]);

    const scene = $("scene-ouverture");
    scene.classList.add("aura");

    $("rayons").className = "rayons";
    $("fond-ouverture").className = "fond-glow";
    $("badge-nouveau").classList.remove("show");
    $("particules").innerHTML = "";

    const pack = $("pack-gros-plan");
    pack.className = "pack-3d grand pret";
    pack.style.display = "block";
    scene.style.display = "block";
    $("carte-affichee").className = "carte-cachee";
    $("carte-affichee").innerHTML = "";
    $("tuto-clic").innerText = "Clique pour ouvrir !";
    creerPoints();

    changerVue('ouverture');
    $("vue-ouverture").focus();
});

/* ---------- Progression dans l'ouverture ---------- */
$("vue-ouverture").addEventListener("click", etapeOuvertureSuivante);
$("vue-ouverture").addEventListener("keydown", e => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); etapeOuvertureSuivante(); }
});

function etapeOuvertureSuivante() {
    if (verrou) return;
    const meilleure = packActuel[4].rarete;

    if (etapeOuverture === 0) {
        verrou = true;
        const pack = $("pack-gros-plan");
        pack.classList.add("explose");
        $("tuto-clic").innerText = "";
        $("rayons").classList.add("on");
        if (RANGS_RARETE[meilleure] >= 4) $("rayons").classList.add("intense");

        setTimeout(() => {
            $("scene-ouverture").style.display = "none";
            flash();
            secouer();
            lancerParticules(meilleure);
            afficherCarte(0);
            $("tuto-clic").innerText = "Clique pour continuer";
            verrou = false;
        }, 550);
        etapeOuverture = 1;
        return;
    }

    if (etapeOuverture < 5) {
        afficherCarte(etapeOuverture);
        if (etapeOuverture === 4) $("tuto-clic").innerText = "Clique pour terminer";
        etapeOuverture++;
    } else {
        $("vue-ouverture").classList.remove("active");
        changerVue('accueil');
        majCompteursAlbum();
    }
}

function afficherCarte(index) {
    const joueur = packActuel[index];
    const carte = $("carte-affichee");
    carte.className = "carte-cachee";
    carte.innerHTML = "";
    $("badge-nouveau").classList.remove("show");
    $("vue-ouverture").style.setProperty("--c", COULEURS[joueur.rarete]);

    document.querySelectorAll(".point").forEach((p, i) => {
        p.style.setProperty("--pc", COULEURS[packActuel[i].rarete]);
        p.classList.toggle("fait", i <= index);
    });

    carte.innerHTML = genererHTMLCarte(joueur);
    carte.className = `carte ${joueur.rarete} entree`;

    carte.addEventListener("animationend", function fin() {
        carte.removeEventListener("animationend", fin);
        carte.classList.remove("entree");
        carte.classList.add("prete");
        lancerParticules(joueur.rarete);
        if (RANGS_RARETE[joueur.rarete] >= 4) { flash(); secouer(); }
        if (joueur.rarete === "Légendaire") setTimeout(() => lancerParticules("Légendaire"), 400);
        if (nouvellesCartes[index]) $("badge-nouveau").classList.add("show");
    });
}

function genererHTMLCarte(joueur, manquante = false) {
    const silhouette = manquante ? `
        <svg class="carte-manquante-svg" viewBox="0 0 200 300" aria-hidden="true">
            <g fill="#3a3a4a">
                <circle cx="100" cy="96" r="34"/>
                <path d="M100 136 C 62 142 48 178 46 236 L 44 300 L 156 300 L 154 236
                         C 152 178 138 142 100 136 Z"/>
            </g>
        </svg>` : "";

    return `
        <div class="vignette">
            <img src="${joueur.photo}" alt="${manquante ? "Joueur non découvert" : joueur.nom}"
                 class="photo-joueur" onerror="this.src='images/default.png'">
            ${silhouette}
        </div>
        <div class="infos-joueur">
            <h3>${manquante ? "???" : joueur.nom}</h3>
            <span style="font-weight:bold; color:${manquante ? "#444" : COULEURS[joueur.rarete]};">
                ${joueur.rarete.replace('-', ' ')}
            </span>
        </div>
    `;
}

/* =====================================================
   ALBUM
   ===================================================== */
function inventaireUnique() {
    const vus = new Map();
    inventaire.forEach((j, i) => {
        if (!vus.has(j.nom)) vus.set(j.nom, { joueur: j, ordre: i });
    });
    return vus; // Map nom -> { joueur, ordre }
}

function appliquerTri(liste) {
    const arr = [...liste];
    switch (triAlbum) {
        case "rarete-asc":
            arr.sort((a, b) => RANGS_RARETE[a.joueur.rarete] - RANGS_RARETE[b.joueur.rarete]);
            break;
        case "nom-asc":
            arr.sort((a, b) => a.joueur.nom.localeCompare(b.joueur.nom, "fr"));
            break;
        case "nom-desc":
            arr.sort((a, b) => b.joueur.nom.localeCompare(a.joueur.nom, "fr"));
            break;
        case "recent":
            arr.sort((a, b) => b.ordre - a.ordre);
            break;
        case "rarete-desc":
        default:
            arr.sort((a, b) => RANGS_RARETE[b.joueur.rarete] - RANGS_RARETE[a.joueur.rarete]);
            break;
    }
    return arr;
}

function afficherAlbum() {
    const grille = $("grille-album");
    const vide = $("album-vide");
    grille.innerHTML = "";

    const possedes = inventaireUnique(); // Map nom -> { joueur, ordre }

    // Construction des deux ensembles, chacun dans le format { joueur, ordre }
    const listePossedees = [];
    possedes.forEach(entry => listePossedees.push(entry));

    const listeManquantes = [];
    baseDeDonneesJoueurs.forEach((j, i) => {
        if (!possedes.has(j.nom)) listeManquantes.push({ joueur: j, ordre: i });
    });

    // Choix de l'ensemble selon la vue
    let ensemble;
    if (vueAlbum === "possedees") ensemble = listePossedees;
    else if (vueAlbum === "manquantes") ensemble = listeManquantes;
    else ensemble = [...listePossedees, ...listeManquantes];

    const trie = appliquerTri(ensemble);

    // Compteurs du sélecteur
    $("compte-toutes").textContent = baseDeDonneesJoueurs.length;
    $("compte-possedees").textContent = listePossedees.length;
    $("compte-manquantes").textContent = listeManquantes.length;

    // Rendu
    if (!trie.length) {
        vide.hidden = false;
        vide.textContent = vueAlbum === "manquantes"
            ? "Collection complète — tu as tous les joueurs !"
            : "Aucune carte à afficher pour l'instant.";
    } else {
        vide.hidden = true;
        const fragment = document.createDocumentFragment();
        trie.forEach(({ joueur }, i) => {
            const manquante = !possedes.has(joueur.nom);
            const div = document.createElement("div");
            div.className = `carte ${joueur.rarete}${manquante ? " manquante" : ""}`;
            div.style.animationDelay = Math.min(i * 12, 400) + "ms";
            div.innerHTML = genererHTMLCarte(joueur, manquante);
            fragment.appendChild(div);
        });
        grille.appendChild(fragment);
    }

    majProgression(listePossedees.length, baseDeDonneesJoueurs.length);
}

function majProgression(nbPossedes, total) {
    const pct = total ? Math.round((nbPossedes / total) * 100) : 0;
    $("progression-texte").textContent = `${nbPossedes} / ${total} joueurs`;
    $("progression-pct").textContent = `${pct} %`;
    const remplissage = $("progression-remplissage");
    remplissage.style.width = pct + "%";
    remplissage.parentElement.parentElement.classList.toggle("complete", pct === 100);
}

function majCompteursAlbum() {
    // Utile quand l'album n'est pas affiché (après une ouverture de pack)
    const possedes = inventaireUnique();
    let totalCommun = 0, totalPeu = 0, totalRare = 0, totalTres = 0, totalLeg = 0;
    const totalJeu = { "Commun": 0, "Peu-Commun": 0, "Rare": 0, "Très-Rare": 0, "Légendaire": 0 };
    baseDeDonneesJoueurs.forEach(j => totalJeu[j.rarete]++);

    const compte = { "Commun": 0, "Peu-Commun": 0, "Rare": 0, "Très-Rare": 0, "Légendaire": 0 };
    possedes.forEach(({ joueur }) => compte[joueur.rarete]++);

    let html = "";
    for (let rarete of Object.keys(RANGS_RARETE)) {
        html += `<div class="stat-box" style="background-color:${COULEURS[rarete]}">
                    ${rarete.replace('-', ' ')} : ${compte[rarete]} / ${totalJeu[rarete]}
                 </div>`;
    }
    $("stats-album").innerHTML = html;
}

/* ---------- Écouteurs de la barre d'outils ---------- */
document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        vueAlbum = btn.dataset.vueAlbum;
        document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("actif", b === btn));
        afficherAlbum();
    });
});

$("selecteur-tri").addEventListener("change", e => {
    triAlbum = e.target.value;
    afficherAlbum();
});

/* ---------- Gestionnaire de packs ---------- */
let dernierTick = 0;
function lancerGestionnairePacks() {
    actualiserCalculPacks();
    actualiserAffichageBouton();
    if (boucleTemps) cancelAnimationFrame(boucleTemps);
    boucler();
}

function boucler() {
    const t = performance.now();
    if (t - dernierTick > 1000) {
        dernierTick = t;
        if ($("vue-accueil").classList.contains("active")) {
            actualiserCalculPacks();
            actualiserAffichageBouton();
        }
    }
    boucleTemps = requestAnimationFrame(boucler);
}

function actualiserCalculPacks() {
    const tempsEcoule = Date.now() - dateDernierCalcul;
    if (tempsEcoule >= TEMPS_GENERATION_MS) {
        const packsGagnes = Math.floor(tempsEcoule / TEMPS_GENERATION_MS);
        packsDisponibles += packsGagnes;
        dateDernierCalcul += packsGagnes * TEMPS_GENERATION_MS;
        localStorage.setItem("packsDispoTennis", packsDisponibles);
        localStorage.setItem("dateDernierCalculTennis", dateDernierCalcul);
    }
}

function actualiserAffichageBouton() {
    const bouton = $("btn-ouvrir");
    const affichage = $("timer-display");

    const tempsRestant = TEMPS_GENERATION_MS - (Date.now() - dateDernierCalcul);
    let min = Math.floor(tempsRestant / 60000);
    let sec = Math.floor((tempsRestant % 60000) / 1000);
    const texteChrono = `${min}:${sec < 10 ? '0'+sec : sec}`;

    if (packsDisponibles > 0) {
        bouton.disabled = false;
        bouton.innerText = `Ouvrir le pack (${packsDisponibles} en stock)`;
        affichage.innerText = `+1 pack en approche... (${texteChrono})`;
    } else {
        bouton.disabled = true;
        bouton.innerText = "Recherche de joueurs...";
        affichage.innerText = `Nouveau pack dans : ${texteChrono}`;
    }
}

chargerJeu();
