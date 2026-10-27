# Déployer Traffiq sur Dokploy

Traffiq tourne sur le même VPS que Dokploy et lit le log d'accès de Traefik
(`/etc/dokploy/traefik/dynamic/access.log`). Rien ne sort du serveur.

## 1. Activer les logs d'accès de Traefik

Ils sont désactivés par défaut dans Dokploy.

Dans Dokploy : **Web Server → Traefik → Requests**, puis active les requêtes.
Dokploy ajoute alors ceci à `/etc/dokploy/traefik/traefik.yml` et redémarre Traefik :

```yaml
accessLog:
  filePath: /etc/dokploy/traefik/dynamic/access.log
  format: json
  bufferingSize: 100
```

### Recommandé : vraie IP des visiteurs, User-Agent, Request ID

Par défaut, Traefik n'écrit aucun en-tête HTTP dans le log. Deux conséquences :

- le champ « User agent » du détail d'une requête reste vide ;
- derrière Cloudflare ou un tunnel, Traefik ne voit que l'adresse du proxy (par exemple
  `172.20.x.x`). La carte et les « Top client IPs » ne montrent alors pas les vrais visiteurs.

Pour corriger ça, édite `traefik.yml` (Web Server → Traefik → **Modify**) et complète le
bloc `accessLog` :

```yaml
accessLog:
  filePath: /etc/dokploy/traefik/dynamic/access.log
  format: json
  bufferingSize: 100
  fields:
    headers:
      defaultMode: drop
      names:
        User-Agent: keep
        X-Request-Id: keep
        Cf-Connecting-Ip: keep
        X-Forwarded-For: keep
        X-Real-Ip: keep
```

Puis redémarre Traefik (Web Server → Traefik → **Reload**). Seuls ces en-têtes sont gardés :
les cookies et les en-têtes `Authorization` ne sont jamais écrits. Traffiq prend la vraie IP
dans `Cf-Connecting-Ip`, puis dans la première adresse publique de `X-Forwarded-For`. L'adresse
du proxy reste visible dans le détail d'une requête (« Proxy peer »).

Les requêtes enregistrées avant ce changement gardent l'adresse du proxy : la carte se remplit
avec le nouveau trafic.

> Si tu désactives puis réactives « Requests » dans Dokploy, il réécrit le bloc
> `accessLog` sans les `fields` : refais cette étape.

## 2. Pousser le code sur Git

Dokploy déploie depuis un dépôt Git (GitHub, GitLab, Gitea…). Crée un dépôt privé et pousse
la branche `master`.

## 3. Créer le service dans Dokploy

1. **Create Service → Compose**, nomme-le `traffiq`.
2. **Provider** : ton dépôt Git, branche `master`, compose path `./docker-compose.yml`.
3. **Environment** :

   ```env
   AUTH_PASSWORD=un-mot-de-passe-long
   SESSION_SECRET=une-chaine-aleatoire-de-32-caracteres-ou-plus
   SERVER_NAME=vps-01
   IGNORE_HOSTS=traffic.mondomaine.com
   ```

   - `AUTH_PASSWORD` est obligatoire : le déploiement échoue sans lui.
   - `SESSION_SECRET` : génère-le, par exemple avec `openssl rand -hex 32`. Changer sa valeur déconnecte tout le monde.
   - `IGNORE_HOSTS` : mets le domaine du dashboard pour ne pas compter ses propres requêtes. Tu peux en mettre plusieurs, séparés par des virgules, par exemple le domaine du panneau Dokploy.

4. **Domains → Add Domain** : service `traffiq`, port `3000`, ton domaine,
   HTTPS activé avec Let's Encrypt.
5. **Deploy**.

## 4. Vérifier

- Ouvre le domaine et connecte-toi avec `AUTH_PASSWORD`.
- **Settings → Test connection** doit afficher « Log file readable ».
- Si le bandeau indique que le log est illisible : vérifie l'étape 1. Le fichier n'existe
  qu'une fois que Traefik a reçu au moins une requête après l'activation.

## Bon à savoir

- **Données** : la base SQLite est dans le volume `traffiq-data`. Elle survit aux
  redéploiements. Choisis la durée de conservation dans Settings (14 jours par défaut).
- **Géolocalisation** : au premier démarrage, Traffiq télécharge la base DB-IP City Lite
  (environ 60 Mo, puis 130 Mo une fois décompressée) dans le volume de données, et la
  rafraîchit chaque mois. Les recherches se font en mémoire : aucune IP de visiteur n'est
  envoyée à l'extérieur. Pour désactiver la géolocalisation, mets `GEOIP=false`. La base est
  sous licence CC BY 4.0 : l'attribution « IP Geolocation by DB-IP » figure sur la page Map.
- **Premier démarrage** : seuls les 64 derniers Mo du log sont importés (`BACKFILL_BYTES`).
- **Nettoyage nocturne de Dokploy** : chaque nuit, Dokploy remplace le log par ses 1000
  dernières lignes. Traffiq détecte ce remplacement et n'importe pas ces lignes en double.
  L'historique reste dans la base de Traffiq.
- **Accès au log** : le dossier `/etc/dokploy/traefik/dynamic` est monté en lecture seule.
  Le conteneur tourne en root pour pouvoir lire le fichier, qui appartient à root sur l'hôte.
- **Mise à jour** : pousse sur `master` puis clique **Deploy**, ou active l'auto-deploy du
  webhook Git dans Dokploy.
