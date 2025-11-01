# LiftLog - Deployment & Delen als App

## 🚀 PWA (Progressive Web App) Setup

De app is geconfigureerd als een Progressive Web App (PWA), wat betekent dat gebruikers de app kunnen installeren op hun mobiel zonder via app stores te hoeven gaan.

## 📱 App Installatie voor Gebruikers

### Op Android:
1. Open de app in Chrome browser
2. Klik op het menu (3 punten)
3. Selecteer "Toevoegen aan startscherm" of "Installeer app"
4. Bevestig de installatie
5. De app verschijnt nu als een app op je startscherm

### Op iOS (iPhone/iPad):
1. Open de app in Safari browser
2. Klik op het deel-icoon (vierkant met pijl)
3. Scroll naar beneden en klik "Voeg toe aan beginscherm"
4. Bevestig met "Toevoegen"
5. De app verschijnt nu als een app op je beginscherm

## 🛠️ Deployment Opties

### Optie 1: Vercel (Aanbevolen - Makkelijkste)

1. **Installeer Vercel CLI** (als je dat nog niet hebt):
   ```bash
   npm install -g vercel
   ```

2. **Deploy de app**:
   ```bash
   vercel
   ```
   Volg de instructies op scherm. Vercel detecteert automatisch dat het een Vite project is.

3. **Automatische deployments**: 
   - Push je code naar GitHub
   - Verbind je GitHub repo met Vercel
   - Elke push wordt automatisch gedeployed

**Voordelen:**
- ✅ Gratis hosting
- ✅ SSL certificaat automatisch
- ✅ Automatische deployments
- ✅ Werkt perfect met PWA

### Optie 2: Netlify

1. **Installeer Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Deploy de app**:
   ```bash
   npm run build
   netlify deploy --prod --dir=dist
   ```

3. Of gebruik de Netlify dashboard:
   - Login op netlify.com
   - "New site from Git"
   - Verbind je GitHub repo
   - Build command: `npm run build`
   - Publish directory: `dist`

**Voordelen:**
- ✅ Gratis hosting
- ✅ SSL certificaat automatisch
- ✅ Eenvoudige setup

### Optie 3: GitHub Pages

1. **Installeer gh-pages**:
   ```bash
   npm install -D gh-pages
   ```

2. **Voeg scripts toe aan package.json**:
   ```json
   "scripts": {
     "predeploy": "npm run build",
     "deploy": "gh-pages -d dist"
   }
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```

4. **Activeer GitHub Pages**:
   - Ga naar je GitHub repo settings
   - Ga naar "Pages"
   - Selecteer branch: `gh-pages`
   - Je site is nu live op: `https://jouwgebruikersnaam.github.io/LiftLog`

**Voordelen:**
- ✅ Gratis via GitHub
- ✅ Werkt goed voor static sites

### Optie 4: Eigen Server / Hosting

1. **Build de app**:
   ```bash
   npm run build
   ```

2. **Upload de `dist` folder** naar je webserver

3. **Configureer je server** om alle routes naar `index.html` te sturen (voor SPA routing)

**Voor Apache** (`.htaccess` in dist folder):
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

**Voor Nginx**:
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## 🎨 App Icons Toevoegen (Optioneel maar Aanbevolen)

Voor de beste ervaring, voeg PNG icons toe:

1. Maak een `icon-192.png` (192x192 pixels)
2. Maak een `icon-512.png` (512x512 pixels)
3. Plaats ze in de `public/` folder
4. De PWA plugin pikt ze automatisch op

**Tools om icons te maken:**
- Online: https://www.favicon-generator.org/
- Of gebruik de SVG logo en converteer naar PNG

## 🔧 Pre-Deploy Checklist

Voor je deelt, controleer:

- [ ] `npm run build` werkt zonder errors
- [ ] Test de app lokaal met `npm run preview`
- [ ] Controleer dat de manifest.json wordt gegenereerd (in `dist/` na build)
- [ ] Test PWA installatie op mobiel
- [ ] Controleer dat offline functionaliteit werkt (data wordt opgeslagen in localStorage)

## 📝 URL Delen

Zodra je app gedeployed is:

1. **Deel de URL** met gebruikers
2. **Leg uit** hoe ze de app kunnen installeren (zie bovenstaande instructies)
3. **Optioneel**: Maak een QR-code van de URL voor makkelijke toegang

## 🔒 HTTPS Vereiste

**BELANGRIJK**: PWA functionaliteit werkt alleen via HTTPS (of localhost). Zorg ervoor dat je hosting provider HTTPS ondersteunt (wat meestal gratis is bij Vercel/Netlify).

## 🎯 Extra Features

De app heeft al:
- ✅ Offline storage (localStorage)
- ✅ Responsive design voor mobiel
- ✅ PWA manifest
- ✅ Service worker voor caching

Geniet van je app! 🎉

