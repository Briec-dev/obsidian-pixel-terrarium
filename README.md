# Pixel Terrarium

> 🇬🇧 **[English Documentation](#-english-documentation)** | 🇫🇷 **[Documentation en Français](#-documentation-en-français)**

### 📸 Visual Preview / Aperçu visuel

**Snow & snowy canopy / Neige et arbre enneigé**

<img width="1240" height="632" alt="05-meteo-neige" src="https://github.com/user-attachments/assets/6970f8cc-e83f-4692-b119-f23d9100ba01" />

**Drizzle & raindrops / Bruine et gouttes**

<img width="1240" height="632" alt="04-meteo-bruine" src="https://github.com/user-attachments/assets/f9ce43a4-ecdd-44c7-b75f-94c50a71c60d" />

**Growth stages / Stades de croissance**

<img width="400" height="848" alt="02-croissance-arbre" src="https://github.com/user-attachments/assets/91baf0f5-8006-46f0-ab35-726c3b8e2c2b" />

**Species & seasons / Essences et saisons**

<img width="1000" height="470" alt="06-arbre-saisons" src="https://github.com/user-attachments/assets/4e989dbb-2b6c-46a8-95d9-33dbdc0014d7" />

**Interactive tree menu & decorations / Menu interactif de l'arbre et pose de décorations**

<img width="700" height="740" alt="01-menu-arbre-nichoir" src="https://github.com/user-attachments/assets/015b8cf1-ce84-4939-b750-1293447df719" />

---
## 🇬🇧 English Documentation

**Pixel Terrarium** turns your Obsidian workspace into a living pixel-art micro-ecosystem: live weather over your writing panes paired with an animated companion tree, wildlife visitors, and branch-anchored decorations that react directly to the weather. Weather and companion tree can be enabled or disabled independently in Settings.

### ✨ Features

#### 🌦️ Pixel-Art Weather

- **Live weather with zero API key**: Uses [Open-Meteo](https://open-meteo.com/) (Paris configured by default `48.8566, 2.3522`, changeable via city search).
- **11 weather conditions**: `Sunny`, `Starry Night`, `Partly Cloudy`, `Cloudy Night`, `Overcast`, `Foggy`, `Drizzle`, `Rain`, `Heavy Rain`, `Snow`, and `Thunderstorm`.
- **Blocked weather conditions**: Block any weather condition in automatic mode to automatically replace it with a calmer weather (e.g., `Heavy Rain` → `Rain`).
- **Customizable overlay**: Independently enable or disable weather or the tree from their collapsible sections, adjust pixel size, density, opacity, layer position (above or behind text), scope (active tab or all windows, editing-only or reading), celestial bodies/clouds, snow at the bottom of the screen, typing reaction, and manual preview mode.

#### 🌱 Living Companion Tree & Micro-Ecosystem

- **3 tree species & 6 growth stages**: Choose between **Oak**, **Cherry Blossom (Sakura)**, and **Pine**, growing from **Tiny Sprout** to **Seedling**, **Sapling**, **Young Tree**, **Mature Tree**, and **Ancient Tree** over time, writing activity, and watering.
- **Seasons & day/night cycle**: Foliage palettes, blossoms, falling leaves, and ambient light adapt automatically to the calendar (hemisphere-aware) and your selected city's local time, or via manual preview.
- **Animated pixel watering can**: Water your tree from its compact menu or the command palette—a watering can appears above the canopy, tilts, and pours a curved water stream with splashes.
- **Branch-anchored decorations**: Place **Lanterns** (warm glow and wind sway) and **Birdhouses** on the tree; each decoration remembers its anchor branch (`branchId`, `branchT`) and follows the tree as it grows.
- **Wildlife visitors**: Birds, butterflies, bees, fireflies, owl, squirrel, and woodpecker arrive and depart naturally off-screen to visit the canopy.
- **Real-time weather ↔ tree interactions**: Raindrops detect the foliage silhouette and splash on impact while hydrating the tree; snow settles onto leaves, branches, and decorations then melts gently when snowfall stops; wind and typing gusts animate the branches; lightning flashes illuminate the tree.

### 📥 Installation

#### Option 1 — Obsidian Community Plugins (coming soon)

1. Open **Settings → Community plugins** in Obsidian.
2. Click **Browse** and search for **Pixel Terrarium**.
3. Click **Install**, then **Enable**.

#### Option 2 — Via BRAT

1. Install the **BRAT** community plugin in Obsidian.
2. Open BRAT settings, click **Add Beta plugin**, and enter:
   ```text
   Briec-dev/obsidian-pixel-terrarium
   ```
3. Enable **Pixel Terrarium** in **Settings → Community plugins**.

#### Option 3 — Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](https://github.com/Briec-dev/obsidian-pixel-terrarium/releases).
2. Copy those 3 files into your vault at:
   ```text
   <YourVault>/.obsidian/plugins/pixel-terrarium/
   ```
3. Reload community plugins in Obsidian and enable **Pixel Terrarium**.

### 🔒 Privacy & Network

Pixel Terrarium does not track analytics or collect personal data; it only queries **Open-Meteo** (`api.open-meteo.com` and `geocoding-api.open-meteo.com`) via Obsidian's `requestUrl` for weather forecasts and city search, with no API key required.

---

## 🇫🇷 Documentation en Français

**Pixel Terrarium** transforme votre espace de travail Obsidian en un micro-écosystème vivant en pixel art : météo en direct sur vos fenêtres d'écriture combinée avec un arbre compagnon animé, sa faune et ses décorations ancrées aux branches qui réagissent directement à la météo. La météo et l'arbre compagnon peuvent être activés ou désactivés indépendamment dans les paramètres.

### ✨ Fonctionnalités

#### 🌦️ Météo en Pixel Art

- **Météo en direct sans clé API** : Utilise [Open-Meteo](https://open-meteo.com/) (Paris configuré par défaut `48.8566, 2.3522`, modifiable via la recherche de ville).
- **11 ambiances météo** : `Ensoleillé`, `Nuit étoilée`, `Éclaircies`, `Nuit nuageuse`, `Couvert`, `Brouillard`, `Bruine`, `Pluie`, `Forte pluie`, `Neige` et `Orage`.
- **Blocage de météos** : Bloquez n'importe quelle météo en mode automatique pour la remplacer automatiquement par une ambiance plus douce (ex. `Forte pluie` → `Pluie`).
- **Calque personnalisable** : Activez ou désactivez séparément la météo ou l'arbre depuis leurs sections dépliables, ajustez la taille des pixels, la densité, l'opacité, la position du calque (au-dessus ou derrière le texte), la portée (onglet actif ou toutes les fenêtres, écriture seule ou lecture), les astres/nuages, la neige au bas de l'écran, la réaction à la frappe et le mode aperçu manuel.

#### 🌱 Arbre Compagnon & Micro-Écosystème Vivant

- **3 essences & 6 stades de croissance** : Choisissez entre **Chêne**, **Cerisier (Sakura)** et **Pin**, évoluant de **Pousse naissante** à **Jeune pousse**, **Arbrisseau**, **Jeune arbre**, **Arbre mature** et **Arbre ancien** au fil du temps, de votre écriture et des arrosages.
- **Saisons & cycle jour/nuit** : Palettes de feuillage, floraisons, feuilles mortes et lumière ambiante s'adaptent automatiquement au calendrier (selon l'hémisphère) et à l'heure locale de la ville choisie, ou via aperçu manuel.
- **Arrosoir animé en pixel art** : Arrosez votre arbre depuis son menu compact ou la palette de commandes : un arrosoir apparaît au-dessus de la canopée, s'incline et verse un jet d'eau courbé avec éclaboussures.
- **Décorations ancrées aux branches** : Posez des **Lanternes** (lueur chaude et oscillation au vent) et des **Nichoirs** sur l'arbre ; chaque décoration mémorise sa branche d'ancrage (`branchId`, `branchT`) et suit l'arbre pendant sa croissance.
- **Visiteurs de la faune** : Oiseaux, papillons, abeilles, lucioles, chouette, écureuil et pic-vert arrivent et repartent naturellement hors écran pour visiter la canopée.
- **Interactions météo ↔ arbre en temps réel** : Les gouttes de pluie détectent la silhouette du feuillage et éclatent à l'impact tout en hydratant l'arbre ; la neige blanchit feuilles, branches et décorations puis fond doucement à l'arrêt de la neige ; le vent et les rafales de frappe animent les branches ; les éclairs illuminent l'arbre.

### 📥 Installation

#### Option 1 — Store intégré d'Obsidian (bientôt disponible)

1. Ouvrez **Paramètres → Modules complémentaires** dans Obsidian.
2. Cliquez sur **Parcourir** et recherchez **Pixel Terrarium**.
3. Cliquez sur **Installer**, puis **Activer**.

#### Option 2 — Via BRAT

1. Installez le plugin communautaire **BRAT** dans Obsidian.
2. Dans les paramètres de BRAT, cliquez sur **Add Beta plugin** et saisissez :
   ```text
   Briec-dev/obsidian-pixel-terrarium
   ```
3. Activez **Pixel Terrarium** dans **Paramètres → Modules complémentaires**.

#### Option 3 — Installation Manuelle

1. Téléchargez `main.js`, `manifest.json` et `styles.css` depuis la dernière [Release GitHub](https://github.com/Briec-dev/obsidian-pixel-terrarium/releases).
2. Copiez ces 3 fichiers dans votre coffre :
   ```text
   <VotreCoffre>/.obsidian/plugins/pixel-terrarium/
   ```
3. Rechargez la liste des modules complémentaires dans Obsidian et activez **Pixel Terrarium**.

### 🔒 Confidentialité & Réseau

Pixel Terrarium ne collecte aucune donnée personnelle ni télémétrie ; seules des requêtes vers **Open-Meteo** (`api.open-meteo.com` et `geocoding-api.open-meteo.com`) sont effectuées via `requestUrl` d'Obsidian pour la météo et la recherche de ville, sans clé API.

## 📄 License

Distributed under the [MIT License](LICENSE).
