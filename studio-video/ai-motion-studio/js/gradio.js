/* MASSAMBA AI MOTION STUDIO — client minimal de la file Gradio (22/10/2026).
 * Protocole « sse_v3 » de Gradio 5/6, celui du client officiel @gradio/client (REA du 17/10/2026, preuve ev_ac6e1004…,
 * dist/index.js l. 35-44 et 1162-1180) : /config → /upload → /queue/join → /queue/data (flux SSE) → fichier vidéo.
 * Observé le 22/10/2026 sur les Spaces utilisés (version 6.0.2 à 6.8.0, api_prefix « /gradio_api », CORS ouvert).
 * Le jeton Hugging Face éventuel n'est JAMAIS conservé ici : il est passé appel par appel et reste en mémoire vive.
 * Fonctionne tel quel dans le navigateur (script classique) et dans Node 22 (tests). */
(function (racine) {
  'use strict';

  function ErreurQuota(message, demandeS, resteS) {
    var e = new Error(message); e.name = 'ErreurQuota'; e.demandeS = demandeS; e.resteS = resteS; return e;
  }

  /** « (60s requested vs. 12s left) » → { demandeS: 60, resteS: 12 } */
  function lireQuota(t) {
    var m = /\((\d+(?:\.\d+)?)\s*s\s+requested\s+vs\.?\s+(\d+(?:\.\d+)?)\s*s\s+left\)/i.exec(String(t || ''));
    return m ? { demandeS: Number(m[1]), resteS: Number(m[2]) } : {};
  }

  /** message clair en français pour l'utilisateur, à partir du texte brut renvoyé par le Space. */
  function messageErreur(brut) {
    var t = String(brut == null ? '' : brut).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/no gpu was available/i.test(t)) return 'Aucun GPU libre dans la file gratuite pour l’instant : réessayez dans une minute, ou connectez un compte Hugging Face gratuit (Paramètres) pour passer devant les anonymes.';
    if (/quota/i.test(t)) {
      var q = lireQuota(t);
      var detail = q.resteS != null ? ' Il reste ' + Math.round(q.resteS) + ' s, ce clip en demande ' + Math.round(q.demandeS || 0) + '.' : '';
      return 'Quota GPU gratuit du jour épuisé : il revient 24 h après la première utilisation (davantage avec un compte Hugging Face gratuit).' + detail;
    }
    if (/sleep|paused|building|503/i.test(t)) return 'Le GPU distant se réveille ou est en pause : réessayez dans une minute.';
    if (/abort/i.test(t)) return 'Génération annulée.';
    return t ? 'Service distant : ' + t : 'Service distant : erreur sans message.';
  }

  function entetes(jeton, extra) {
    var h = {}; if (jeton) h.Authorization = 'Bearer ' + String(jeton).trim();
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  /** lit la configuration publique du Space (composants, fonctions, version) */
  async function config(racineSpace, o) {
    o = o || {}; var f = o.fetch || fetch;
    var r = await f(racineSpace.replace(/\/$/, '') + '/config', { headers: entetes(o.jeton), signal: o.signal });
    if (!r.ok) throw new Error(messageErreur('configuration indisponible (' + r.status + ')'));
    return r.json();
  }

  /** décrit une fonction exposée : index, entrées (type, libellé, bornes, valeur par défaut) et sorties. */
  function decrire(cfg, apiName) {
    var comps = {}; (cfg.components || []).forEach(function (c) { comps[c.id] = c; });
    var deps = cfg.dependencies || [];
    for (var i = 0; i < deps.length; i++) {
      var d = deps[i];
      if (d.api_name !== apiName) continue;
      return {
        fn: d.id != null ? d.id : i,
        entrees: (d.inputs || []).map(function (id) {
          var c = comps[id] || {}; var p = c.props || {};
          return { type: c.type, libelle: p.label || null, defaut: p.value, min: p.minimum, max: p.maximum, choix: (p.choices || []).map(function (x) { return Array.isArray(x) ? x[1] : x; }) };
        }),
        sorties: (d.outputs || []).map(function (id) { return (comps[id] || {}).type; })
      };
    }
    return null;
  }

  /** lit le flux SSE de la file jusqu'au résultat ; onEtat reçoit file / calcul / progression. */
  async function lireFlux(corps, onEtat) {
    var lec = corps.getReader(); var dec = new TextDecoder(); var tampon = '';
    for (;;) {
      var lu = await lec.read();
      if (lu.value) tampon += dec.decode(lu.value, { stream: true });
      var i;
      while ((i = tampon.indexOf('\n')) >= 0) {
        var ligne = tampon.slice(0, i).trim(); tampon = tampon.slice(i + 1);
        if (ligne.indexOf('data:') !== 0) continue;
        var m; try { m = JSON.parse(ligne.slice(5)); } catch (e) { continue; }
        if (m.msg === 'estimation') onEtat && onEtat({ phase: 'file', rang: m.rank, attenteS: m.rank_eta });
        else if (m.msg === 'process_starts') onEtat && onEtat({ phase: 'calcul', attenteS: m.eta });
        else if (m.msg === 'progress') {
          var p = m.progress_data && m.progress_data[0];
          if (p && p.length) onEtat && onEtat({ phase: 'calcul', progression: p.index / p.length });
        } else if (m.msg === 'process_completed') {
          if (!m.success) {
            var brut = String((m.output && (m.output.error || m.output.title)) || '');
            if (/quota/i.test(brut)) { var q = lireQuota(brut); throw ErreurQuota(messageErreur(brut), q.demandeS, q.resteS); }
            throw new Error(messageErreur(brut));
          }
          return m.output;
        } else if (m.msg === 'unexpected_error') throw new Error(messageErreur(m.message));
      }
      if (lu.done) break;
    }
    throw new Error('Service distant : flux terminé sans résultat.');
  }

  /** envoie un fichier (Blob) et renvoie l'objet FileData attendu par Gradio. */
  async function envoyer(racineSpace, prefixe, session, blob, nom, o) {
    var f = o.fetch || fetch; var fd = new FormData(); fd.append('files', blob, nom);
    var r = await f(racineSpace + prefixe + '/upload?upload_id=' + session, { method: 'POST', body: fd, headers: entetes(o.jeton), signal: o.signal });
    if (!r.ok) throw new Error(messageErreur('envoi du fichier refusé (' + r.status + ')'));
    var chemin = (await r.json())[0];
    return { path: chemin, orig_name: nom, meta: { _type: 'gradio.FileData' } };
  }

  /** extrait l'URL de la vidéo d'une sortie Gradio (Video → {video:{url}} ou FileData → {url}). */
  function urlVideo(v) {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (v.video) return v.video.url || v.video.path || null;
    return v.url || null;
  }

  /**
   * appelle une fonction du Space. `valeurs` : liste dans l'ordre des entrées ; un Blob devient un fichier envoyé.
   * Renvoie { data, video: Blob|null, graine }.
   */
  async function appeler(racineSpace, apiName, valeurs, o) {
    o = o || {}; var f = o.fetch || fetch; racineSpace = racineSpace.replace(/\/$/, '');
    var cfg = o.cfg || await config(racineSpace, o);
    var pre = cfg.api_prefix || '/gradio_api';
    var desc = decrire(cfg, apiName);
    if (!desc) throw new Error('Ce Space n’expose plus « ' + apiName + ' » : capacité retirée du registre.');
    var session = Math.random().toString(36).slice(2, 13);
    o.onEtat && o.onEtat({ phase: 'envoi' });
    var data = [];
    for (var i = 0; i < valeurs.length; i++) {
      var v = valeurs[i];
      if (v && typeof v === 'object' && typeof v.arrayBuffer === 'function') data.push(await envoyer(racineSpace, pre, session, v, v.name || ('entree-' + i + '.png'), o));
      else data.push(v);
    }
    var j = await f(racineSpace + pre + '/queue/join', {
      method: 'POST', headers: entetes(o.jeton, { 'Content-Type': 'application/json' }), signal: o.signal,
      body: JSON.stringify({ data: data, fn_index: desc.fn, session_hash: session, event_data: null, trigger_id: null })
    });
    if (!j.ok) throw new Error(messageErreur('entrée en file refusée (' + j.status + ')'));
    var flux = await f(racineSpace + pre + '/queue/data?session_hash=' + session, { headers: entetes(o.jeton), signal: o.signal });
    if (!flux.ok || !flux.body) throw new Error(messageErreur('flux indisponible (' + flux.status + ')'));
    var sortie = await lireFlux(flux.body, o.onEtat);
    var url = urlVideo(sortie.data && sortie.data[0]);
    if (!url) throw new Error('Le service a répondu sans vidéo.');
    if (url.indexOf('http') !== 0) url = racineSpace + pre + '/file=' + url;
    o.onEtat && o.onEtat({ phase: 'reception' });
    // le Space peut avoir plusieurs répliques : le fichier n'existe que sur celle qui a calculé. Un navigateur garde
    // sa connexion HTTP/2 (même réplique) ; on retente quand même trois fois avant d'abandonner.
    var clip = null;
    for (var essai = 0; essai < 3; essai++) {
      clip = await f(url, { headers: entetes(o.jeton), signal: o.signal });
      if (clip.ok || (clip.status !== 403 && clip.status !== 404)) break;
      await new Promise(function (r) { setTimeout(r, 800); });
    }
    if (!clip.ok) throw new Error(messageErreur('la vidéo a été calculée mais son téléchargement est refusé (' + clip.status + ')'));
    var b = await clip.blob();
    var graine = null;
    for (var k = 1; k < (sortie.data || []).length; k++) if (typeof sortie.data[k] === 'number') { graine = sortie.data[k]; break; }
    return { data: sortie.data, video: b, graine: graine, url: url };
  }

  var API = { config: config, decrire: decrire, lireFlux: lireFlux, appeler: appeler, messageErreur: messageErreur, lireQuota: lireQuota, urlVideo: urlVideo };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { racine.MAMS = racine.MAMS || {}; racine.MAMS.gradio = API; }
})(typeof self !== 'undefined' ? self : this);
