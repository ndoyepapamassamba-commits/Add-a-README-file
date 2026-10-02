"""Publication TikTok via l'API officielle « Content Posting » (OAuth, aucun mot de passe stocké)."""
import json
import secrets
import time
import urllib.parse
from pathlib import Path

import requests

from . import config

API = "https://open.tiktokapis.com"
SCOPES = "user.info.basic,video.upload,video.publish"
TOKEN_FILE = config.STATE_DIR / "tiktok_tokens.json"


# --- OAuth ---------------------------------------------------------------

def authorize_url() -> str:
    params = {
        "client_key": config.TIKTOK_CLIENT_KEY, "response_type": "code", "scope": SCOPES,
        "redirect_uri": config.TIKTOK_REDIRECT_URI, "state": secrets.token_urlsafe(16),
    }
    return "https://www.tiktok.com/v2/auth/authorize/?" + urllib.parse.urlencode(params)


def _token_request(data: dict) -> dict:
    r = requests.post(f"{API}/v2/oauth/token/", data={
        "client_key": config.TIKTOK_CLIENT_KEY, "client_secret": config.TIKTOK_CLIENT_SECRET,
        **data}, headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=30)
    r.raise_for_status()
    tok = r.json()
    if "access_token" not in tok:
        raise RuntimeError(f"Échec OAuth TikTok : {tok}")
    tok["obtained_at"] = int(time.time())
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(json.dumps(tok, indent=2))
    return tok


def exchange_code(redirected_url_or_code: str) -> dict:
    """Accepte l'URL complète de redirection (après « Autoriser ») ou juste le code."""
    code = redirected_url_or_code
    if "code=" in code:
        code = urllib.parse.parse_qs(urllib.parse.urlparse(code).query)["code"][0]
    return _token_request({"code": code, "grant_type": "authorization_code",
                           "redirect_uri": config.TIKTOK_REDIRECT_URI})


def access_token() -> str:
    tok = json.loads(TOKEN_FILE.read_text()) if TOKEN_FILE.exists() else {}
    if tok and time.time() < tok["obtained_at"] + tok.get("expires_in", 0) - 300:
        return tok["access_token"]
    refresh = tok.get("refresh_token") or config.TIKTOK_REFRESH_TOKEN
    if not refresh:
        raise RuntimeError("Pas de jeton TikTok : lancez d'abord `python run.py auth`")
    return _token_request({"grant_type": "refresh_token", "refresh_token": refresh})["access_token"]


# --- Publication ---------------------------------------------------------

def _post(path: str, body: dict, token: str) -> dict:
    r = requests.post(f"{API}{path}", json=body, timeout=60, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8"})
    data = r.json()
    if r.status_code >= 400 or data.get("error", {}).get("code") not in (None, "ok"):
        raise RuntimeError(f"Erreur API TikTok {path} : {data}")
    return data["data"]


def _chunking(size: int) -> tuple[int, int]:
    """Règles TikTok : morceaux de 5 à 64 Mo, le dernier absorbe le reste."""
    if size <= 64 * 1024 * 1024:
        return size, 1
    chunk = 10 * 1024 * 1024
    return chunk, size // chunk


def _upload(upload_url: str, video: Path, chunk: int, count: int) -> None:
    size = video.stat().st_size
    with open(video, "rb") as f:
        for i in range(count):
            start = i * chunk
            end = size - 1 if i == count - 1 else start + chunk - 1
            f.seek(start)
            body = f.read(end - start + 1)
            r = requests.put(upload_url, data=body, timeout=600, headers={
                "Content-Type": "video/mp4", "Content-Length": str(len(body)),
                "Content-Range": f"bytes {start}-{end}/{size}"})
            r.raise_for_status()


def publish(video: Path, caption: str, mode: str | None = None) -> dict:
    mode = mode or config.TIKTOK_MODE
    token = access_token()
    size = video.stat().st_size
    chunk, count = _chunking(size)
    source = {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": chunk,
              "total_chunk_count": count}

    if mode == "direct":
        creator = _post("/v2/post/publish/creator_info/query/", {}, token)
        options = creator.get("privacy_level_options", [])
        privacy = config.TIKTOK_PRIVACY if config.TIKTOK_PRIVACY in options else "SELF_ONLY"
        if privacy != config.TIKTOK_PRIVACY:
            print(f"[tiktok] {config.TIKTOK_PRIVACY} refusé (app non auditée ?) → {privacy}")
        init = _post("/v2/post/publish/video/init/", {
            "post_info": {
                "title": caption[:2200], "privacy_level": privacy,
                "disable_duet": False, "disable_comment": False, "disable_stitch": False,
                "video_cover_timestamp_ms": 1000,
                "is_aigc": True,  # étiquette « contenu généré par IA » exigée par TikTok
            },
            "source_info": source}, token)
    else:
        init = _post("/v2/post/publish/inbox/video/init/", {"source_info": source}, token)

    _upload(init["upload_url"], video, chunk, count)

    publish_id = init["publish_id"]
    for _ in range(120):
        st = _post("/v2/post/publish/status/fetch/", {"publish_id": publish_id}, token)
        status = st.get("status")
        if status in ("PUBLISH_COMPLETE", "SEND_TO_USER_INBOX"):
            return {"publish_id": publish_id, "status": status, **st}
        if status == "FAILED":
            raise RuntimeError(f"Publication TikTok échouée : {st}")
        time.sleep(5)
    return {"publish_id": publish_id, "status": "TIMEOUT"}
