let baseDeDonneesJoueurs = [];
let inventaire = JSON.parse(localStorage.getItem("inventaireTennis_V2")) || [];

// --- SYSTÈME DE STOCKAGE DE PACKS ---
const TEMPS_GENERATION_MS = 1 * 60 * 1000; // 1 minute
let packsDisponibles = parseInt(localStorage.getItem("packsDispoTennis_V2"));
if (isNaN(packsDisponibles)) packsDisponibles = 1;

let dateDernierCalcul = parseInt(localStorage.getItem("dateDernierCalculTennis_V2")) || Date.now();
localStorage.setItem("dateDernierCalculTennis_V2", dateDernierCalcul);

const RANGS_RARETE = { "Commun": 1, "Peu-Commun": 2, "Rare": 3, "Très-Rare": 4, "Légendaire": 5 };
const COULEURS = { "Commun": "#ecf0f1", "Peu-Commun": "#2ecc71", "Rare": "#3498db", "Très-Rare": "#9b59b6", "Légendaire": "#e67e22" };
const PARTICULES = { "Commun": 15, "Peu-Commun": 25, "Rare": 40, "Très-Rare": 65, "Légendaire": 110 };

let packActuel = [];
let nouvellesCartes = [];
let etapeOuverture = 0;
let verrou = false;
let boucleTemps = null;

// État de l'album
let vueAlbum = "toutes";
let triAlbum = "rarete-desc";

const $ = id => document.getElementById(id);

async function chargerJeu() {
    try {
        const rep = await fetch('joueurs.json');
        baseDeDonneesJoueurs = await rep.json();
        majCompteursAlbum();
        lancerGestionnairePacks();
        brancherRotation();
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

/* ---------- Filtres de l'album ---------- */
document.querySelectorAll(".seg-btn[data-vue-album]").forEach(b => {
    b.addEventListener("click", () => {
        vueAlbum = b.dataset.vueAlbum;
        document.querySelectorAll(".seg-btn[data-vue-album]").forEach(x => x.classList.remove("actif"));
        b.classList.add("actif");
        afficherAlbum();
    });
});
const selectTri = $("tri-album");
if (selectTri) {
    selectTri.addEventListener("change", () => { triAlbum = selectTri.value; afficherAlbum(); });
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
    if (!scene || !cible) return;
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

function brancherRotation() {
    brancherRotationPack($("scene-ouverture"), $("pack-gros-plan"));
    brancherRotationPack($("scene-accueil"), $("pack-accueil"));
}

/* ---------- Ouverture du pack ---------- */
$("btn-ouvrir").addEventListener("click", () => {
    if (!baseDeDonneesJoueurs.length || packsDisponibles <= 0) return;

    packsDisponibles--;
    localStorage.setItem("packsDispoTennis_V2", packsDisponibles);
    actualiserAffichageBouton();

    // Tirage + tri CROISSANT : la meilleure carte est en index 4 (révélée en dernier)
    packActuel = [];
    for (let i = 0; i < 5; i++) packActuel.push(tirerUnJoueur());
    packActuel.sort((a, b) => RANGS_RARETE[a.rarete] - RANGS_RARETE[b.rarete]);

    // PRÉCHARGEMENT INVISIBLE DES IMAGES DU PACK
    packActuel.forEach(joueur => {
        const img = new Image();
        img.src = joueur.photo;
    });

    const dejaVus = new Set(inventaire.map(j => j.nom));
    nouvellesCartes = packActuel.map(j => {
        const nouveau = !dejaVus.has(j.nom);
        dejaVus.add(j.nom);
        return nouveau;
    });

    inventaire = inventaire.concat(packActuel);
    localStorage.setItem("inventaireTennis_V2", JSON.stringify(inventaire));

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
    $("dechirure").style.display = "block";
    $("carte-affichee").className = "carte-cachee";
    $("carte-affichee").innerHTML = "";
    $("tuto-clic").innerText = "Clique sur le pack pour l'ouvrir !";
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
        pack.classList.add("dechire");
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
        }, 1000);
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
                 class="photo-joueur" loading="lazy" onerror="this.src='images/default.png'">
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
    return vus;
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

    const possedes = inventaireUnique();

    const listePossedees = [];
    possedes.forEach(entry => listePossedees.push(entry));

    const listeManquantes = [];
    baseDeDonneesJoueurs.forEach((j, i) => {
        if (!possedes.has(j.nom)) listeManquantes.push({ joueur: j, ordre: i });
    });

    let ensemble;
    if (vueAlbum === "possedees") ensemble = listePossedees;
    else if (vueAlbum === "manquantes") ensemble = listeManquantes;
    else ensemble = [...listePossedees, ...listeManquantes];

    const trie = appliquerTri(ensemble);

    $("compte-toutes").textContent = baseDeDonneesJoueurs.length;
    $("compte-possedees").textContent = listePossedees.length;
    $("compte-manquantes").textContent = listeManquantes.length;

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
    const possedes = inventaireUnique();
    let totalCommun = 0, totalPeu = 0, totalRare = 0, totalTresRare = 0, totalLegendaire = 0;
    possedes.forEach(({ joueur }) => {
        if (joueur.rarete === "Commun") totalCommun++;
        else if (joueur.rarete === "Peu-Commun") totalPeu++;
        else if (joueur.rarete === "Rare") totalRare++;
        else if (joueur.rarete === "Très-Rare") totalTresRare++;
        else if (joueur.rarete === "Légendaire") totalLegendaire++;
    });
    if ($("vue-album").classList.contains("active")) afficherAlbum();
}

/* ---------- Gestion des packs ---------- */
function actualiserAffichageBouton() {
    if (packsDisponibles > 0) {
        $("btn-ouvrir").disabled = false;
        $("btn-ouvrir").innerText = `Ouvrir un pack (${packsDisponibles})`;
    } else {
        $("btn-ouvrir").disabled = true;
        $("btn-ouvrir").innerText = "Aucun pack disponible";
    }
}

function lancerGestionnairePacks() {
    actualiserAffichageBouton();
    if (boucleTemps) clearInterval(boucleTemps);
    majTimer();
    boucleTemps = setInterval(() => {
        const maintenant = Date.now();
        const ecoule = maintenant - dateDernierCalcul;
        if (ecoule >= TEMPS_GENERATION_MS) {
            const gagnes = Math.floor(ecoule / TEMPS_GENERATION_MS);
            packsDisponibles += gagnes;
            localStorage.setItem("packsDispoTennis_V2", packsDisponibles);
            dateDernierCalcul += gagnes * TEMPS_GENERATION_MS;
            localStorage.setItem("dateDernierCalculTennis_V2", dateDernierCalcul);
            actualiserAffichageBouton();
        }
        majTimer();
    }, 1000);
}

function majTimer() {
    if (packsDisponibles > 0) {
        $("timer-display").innerText = "Tu as un pack à ouvrir !";
        return;
    }
    const ecoule = Date.now() - dateDernierCalcul;
    const reste = Math.max(0, TEMPS_GENERATION_MS - ecoule);
    const s = Math.ceil(reste / 1000);
    const min = Math.floor(s / 60);
    const sec = s % 60;
    $("timer-display").innerText = `Prochain pack dans ${min}:${sec.toString().padStart(2, "0")}`;
}

chargerJeu();